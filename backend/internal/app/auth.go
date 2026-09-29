package app

import (
	"crypto/sha256"
	"encoding/hex"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *App) authLimit(r *http.Request, key string, max int) error {
	var n int
	err := a.DB.QueryRow(r.Context(), `INSERT INTO auth_attempts(key,window_start,attempts) VALUES($1,date_trunc('minute',now()),1) ON CONFLICT(key,window_start) DO UPDATE SET attempts=auth_attempts.attempts+1 RETURNING attempts`, key).Scan(&n)
	if err != nil {
		return err
	}
	if n > max {
		return apiError{429, "try again later"}
	}
	return nil
}
func (a *App) authLimits(r *http.Request, email string) error {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if err = a.authLimit(r, "ip:"+host, 100); err != nil {
		return err
	}
	digest := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email))))
	return a.authLimit(r, "email:"+hex.EncodeToString(digest[:]), 10)
}
func (a *App) register(w http.ResponseWriter, r *http.Request) error {
	var in LoginInput
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if err := a.authLimits(r, in.Email); err != nil {
		return err
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	parsed, err := mail.ParseAddress(in.Email)
	if err != nil || parsed.Address != in.Email || len(in.Email) > 254 {
		return bad("invalid email")
	}
	if len(in.Password) < 12 || len(in.Password) > 72 {
		return bad("password must be 12–72 bytes")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	if err != nil {
		return err
	}
	uid := id()
	username := "user" + uid[:12]
	_, err = a.DB.Exec(r.Context(), "INSERT INTO users(id,email,password_hash,username,name) VALUES($1,$2,$3,$4,$4)", uid, in.Email, string(hash), username)
	if err != nil {
		return err
	}
	return a.startSession(w, r, uid)
}

// A fixed cost-12 hash keeps unknown-account login timing close to wrong-password login.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-valid-password"), 12)

func (a *App) login(w http.ResponseWriter, r *http.Request) error {
	var in LoginInput
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if err := a.authLimits(r, in.Email); err != nil {
		return err
	}
	if len(in.Password) > 72 {
		return bad("invalid credentials")
	}
	var uid string
	var hash *string
	var banned bool
	err := a.DB.QueryRow(r.Context(), "SELECT id,password_hash,is_banned FROM users WHERE email=$1", strings.ToLower(strings.TrimSpace(in.Email))).Scan(&uid, &hash, &banned)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	candidate := dummyHash
	if hash != nil {
		candidate = []byte(*hash)
	}
	valid := bcrypt.CompareHashAndPassword(candidate, []byte(in.Password)) == nil
	if err != nil || hash == nil || !valid {
		return apiError{401, "invalid credentials"}
	}
	if banned {
		return apiError{403, "account suspended"}
	}
	return a.startSession(w, r, uid)
}
func (a *App) startSession(w http.ResponseWriter, r *http.Request, uid string) error {
	if err := a.Sessions.RenewToken(r.Context()); err != nil {
		return err
	}
	a.Sessions.Put(r.Context(), "user_id", uid)
	var version int
	if err := a.DB.QueryRow(r.Context(), "SELECT session_version FROM users WHERE id=$1", uid).Scan(&version); err != nil {
		return err
	}
	a.Sessions.Put(r.Context(), "session_version", version)
	_, err := a.DB.Exec(r.Context(), "UPDATE users SET last_seen_at=$2 WHERE id=$1", uid, time.Now())
	if err != nil {
		return err
	}
	return a.me(w, r)
}
func (a *App) logout(w http.ResponseWriter, r *http.Request) error {
	if err := a.Sessions.Destroy(r.Context()); err != nil {
		return err
	}
	return respond(w, map[string]bool{"ok": true})
}
func (a *App) me(w http.ResponseWriter, r *http.Request) error {
	uid, err := a.actor(r)
	if err != nil {
		return err
	}
	u, err := a.user(r.Context(), uid)
	if err != nil {
		return err
	}
	return respond(w, u)
}
func (a *App) presence(w http.ResponseWriter, r *http.Request) error {
	uid, err := a.actor(r)
	if err != nil {
		return err
	}
	_, err = a.DB.Exec(r.Context(), "UPDATE users SET last_seen_at=now() WHERE id=$1", uid)
	if err != nil {
		return err
	}
	rows, err := a.DB.Query(r.Context(), "SELECT id FROM users WHERE last_seen_at>now()-interval '60 seconds' AND NOT is_banned ORDER BY id LIMIT 100")
	if err != nil {
		return err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var v string
		if err = rows.Scan(&v); err != nil {
			return err
		}
		ids = append(ids, v)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	return respond(w, ids)
}
