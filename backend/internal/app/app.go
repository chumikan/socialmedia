package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/alexedwards/scs/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"io"
	"log"
	"net/http"
	"os"
	"socialmedia/backend/internal/database"
	"strings"
	"time"
)

type App struct {
	DB             *pgxpool.Pool
	Sessions       *scs.SessionManager
	S3             *minio.Client
	Bucket, Origin string
}
type apiError struct {
	status  int
	message string
}

func (e apiError) Error() string { return e.message }
func bad(s string) error         { return apiError{400, s} }
func forbidden() error           { return apiError{403, "forbidden"} }
func id() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func Env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func New(db *pgxpool.Pool) (*App, error) {
	s := scs.New()
	s.Store = database.SessionStore{DB: db}
	s.Lifetime = 7 * 24 * time.Hour
	s.IdleTimeout = 24 * time.Hour
	s.Cookie.Name = "sns_session"
	s.Cookie.HttpOnly = true
	s.Cookie.SameSite = http.SameSiteLaxMode
	s.Cookie.Secure = Env("COOKIE_SECURE", "false") == "true"
	client, err := minio.New(Env("S3_ENDPOINT", "localhost:9000"), &minio.Options{Creds: credentials.NewStaticV4(os.Getenv("S3_ACCESS_KEY"), os.Getenv("S3_SECRET_KEY"), ""), Secure: Env("S3_TLS", "false") == "true"})
	if err != nil {
		return nil, err
	}
	return &App{db, s, client, Env("S3_BUCKET", "socialmedia"), Env("APP_ORIGIN", "http://localhost:3000")}, nil
}
func (a *App) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/v1/health", a.wrap(func(w http.ResponseWriter, r *http.Request) error {
		if err := a.DB.Ping(r.Context()); err != nil {
			return err
		}
		return respond(w, map[string]string{"status": "ok"})
	}))
	m.HandleFunc("POST /api/v1/auth/register", a.wrap(a.register))
	m.HandleFunc("POST /api/v1/auth/login", a.wrap(a.login))
	m.HandleFunc("POST /api/v1/auth/logout", a.wrap(a.logout))
	m.HandleFunc("GET /api/v1/auth/me", a.wrap(a.me))
	m.HandleFunc("POST /api/v1/query", a.wrap(a.query))
	m.HandleFunc("POST /api/v1/posts", a.wrap(a.createPost))
	m.HandleFunc("DELETE /api/v1/posts/{id}", a.wrap(a.deletePost))
	for _, action := range []string{"like", "repost", "bookmark"} {
		m.HandleFunc("PUT /api/v1/posts/{id}/"+action, a.wrap(a.interaction(action, true)))
		m.HandleFunc("DELETE /api/v1/posts/{id}/"+action, a.wrap(a.interaction(action, false)))
	}
	m.HandleFunc("DELETE /api/v1/bookmarks", a.wrap(a.clearBookmarks))
	m.HandleFunc("PATCH /api/v1/users/{id}", a.wrap(a.updateUser))
	m.HandleFunc("PUT /api/v1/users/{id}/follow", a.wrap(a.follow(true)))
	m.HandleFunc("DELETE /api/v1/users/{id}/follow", a.wrap(a.follow(false)))
	m.HandleFunc("PUT /api/v1/users/{id}/ban", a.wrap(a.ban))
	m.HandleFunc("PATCH /api/v1/notifications/{id}", a.wrap(a.readNotification))
	m.HandleFunc("POST /api/v1/media", a.wrap(a.upload))
	m.HandleFunc("GET /api/v1/media/{id}", a.wrap(a.media))
	m.HandleFunc("GET /api/v1/presence", a.wrap(a.presence))
	m.HandleFunc("GET /api/v1/auth/google", a.wrap(a.googleStart))
	m.HandleFunc("GET /api/v1/auth/google/callback", a.wrap(a.googleCallback))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" && r.Method != "HEAD" {
			if r.Header.Get("X-SNS-Request") != "1" || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != a.Origin) {
				http.Error(w, `{"error":"invalid request origin"}`, 403)
				return
			}
		}
		a.Sessions.LoadAndSave(m).ServeHTTP(w, r)
	})
}
func (a *App) wrap(fn func(http.ResponseWriter, *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			status, msg := 500, "internal error"
			var ae apiError
			var pe *pgconn.PgError
			if errors.As(err, &ae) {
				status, msg = ae.status, ae.message
			} else if errors.Is(err, pgx.ErrNoRows) {
				status, msg = 404, "not found"
			} else if errors.As(err, &pe) {
				switch pe.Code {
				case "23505":
					status, msg = 409, "already exists"
				case "23503", "23514", "22P02":
					status, msg = 400, "invalid reference or value"
				}
			}
			if status == 500 {
				log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			json.NewEncoder(w).Encode(map[string]string{"error": msg})
		}
	}
}
func respond(w http.ResponseWriter, v any) error {
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(v)
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return bad("invalid JSON")
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return bad("request must contain a single JSON value")
	}
	return nil
}
func (a *App) actor(r *http.Request) (string, error) {
	uid := a.Sessions.GetString(r.Context(), "user_id")
	if uid == "" {
		return "", apiError{401, "sign in required"}
	}
	var banned bool
	var version int
	if err := a.DB.QueryRow(r.Context(), "SELECT is_banned,session_version FROM users WHERE id=$1", uid).Scan(&banned, &version); err != nil {
		return "", apiError{401, "invalid session"}
	}
	if version != a.Sessions.GetInt(r.Context(), "session_version") {
		return "", apiError{401, "session revoked"}
	}
	if banned {
		return "", apiError{403, "account suspended"}
	}
	return uid, nil
}
func (a *App) transaction(r *http.Request, fn func(pgx.Tx, string) error) error {
	uid, err := a.actor(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var banned bool
	if err = tx.QueryRow(ctx, "SELECT is_banned FROM users WHERE id=$1 FOR UPDATE", uid).Scan(&banned); err != nil {
		return err
	}
	if banned {
		return forbidden()
	}
	if err = fn(tx, uid); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func notify(ctx context.Context, tx pgx.Tx, actor, target, kind string, post any) error {
	if actor == target {
		return nil
	}
	_, err := tx.Exec(ctx, "INSERT INTO notifications(id,user_id,target_user_id,type,post_id) VALUES($1,$2,$3,$4,$5)", id(), actor, target, kind, post)
	return err
}
func (a *App) user(ctx context.Context, uid string) (json.RawMessage, error) {
	var b json.RawMessage
	err := a.DB.QueryRow(ctx, "SELECT data FROM user_documents WHERE id=$1", uid).Scan(&b)
	return b, err
}
func nullable(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
