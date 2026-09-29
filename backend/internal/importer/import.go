// Package importer consumes offline JSON only. It never contacts Firebase.
package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"strconv"
	"strings"
	"time"
)

type Document map[string]json.RawMessage

func (d Document) String(k string) string    { var s string; _ = json.Unmarshal(d[k], &s); return s }
func (d Document) Bool(k string) bool        { var b bool; _ = json.Unmarshal(d[k], &b); return b }
func (d Document) Strings(k string) []string { var s []string; _ = json.Unmarshal(d[k], &s); return s }
func (d Document) Time(k string) time.Time {
	var s string
	if json.Unmarshal(d[k], &s) == nil {
		t, e := time.Parse(time.RFC3339Nano, s)
		if e == nil {
			return t
		}
	}
	var v map[string]json.Number
	if json.Unmarshal(d[k], &v) == nil {
		sec := v["seconds"]
		if sec == "" {
			sec = v["_seconds"]
		}
		nsec := v["nanoseconds"]
		if nsec == "" {
			nsec = v["_nanoseconds"]
		}
		if n, e := strconv.ParseInt(string(sec), 10, 64); e == nil {
			ns, _ := strconv.ParseInt(string(nsec), 10, 64)
			return time.Unix(n, ns)
		}
	}
	return time.Time{}
}

type Media struct {
	ID          string `json:"id"`
	OwnerID     string `json:"ownerId"`
	ObjectKey   string `json:"objectKey"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	Alt         string `json:"alt"`
	LegacyURL   string `json:"legacyURL"`
}
type Export struct {
	Users         []Document            `json:"users"`
	Tweets        []Document            `json:"tweets"`
	Notifications []Document            `json:"notifications"`
	Bookmarks     map[string][]Document `json:"bookmarks"`
	Media         []Media               `json:"media"`
	AuthUsers     []Document            `json:"authUsers"`
}

func (e Export) Validate() error {
	for _, n := range e.Notifications {
		switch n.String("type") {
		case "follower", "liked", "reply", "repost":
		default:
			return fmt.Errorf("notification %s has unsupported type %q", n.String("id"), n.String("type"))
		}
	}
	seen := map[string]bool{}
	for _, u := range e.Users {
		uid := u.String("id")
		if uid == "" || seen[uid] {
			return fmt.Errorf("missing/duplicate user id %q", uid)
		}
		seen[uid] = true
		if u.String("username") == "" || u.String("name") == "" || u.Time("createdAt").IsZero() {
			return fmt.Errorf("user %s needs username, name and createdAt", uid)
		}
	}
	posts := map[string]bool{}
	media := map[string]bool{}
	for _, m := range e.Media {
		if m.ID == "" || media[m.ID] || !seen[m.OwnerID] || m.Size < 1 || m.Size > 50<<20 || m.ObjectKey == "" || strings.Contains(m.ObjectKey, "..") || strings.HasPrefix(m.ObjectKey, "/") {
			return fmt.Errorf("invalid media %s", m.ID)
		}
		allowed := map[string]bool{"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true, "video/mp4": true, "video/webm": true, "video/quicktime": true}
		if !allowed[m.ContentType] {
			return fmt.Errorf("unsupported media content type for %s", m.ID)
		}
		media[m.ID] = true
	}
	for _, p := range e.Tweets {
		pid := p.String("id")
		if pid == "" || posts[pid] || !seen[p.String("createdBy")] || p.Time("createdAt").IsZero() {
			return fmt.Errorf("invalid tweet %s", pid)
		}
		posts[pid] = true
		var images []Document
		_ = json.Unmarshal(p["images"], &images)
		for _, img := range images {
			if !media[img.String("id")] {
				return fmt.Errorf("tweet %s media %s missing manifest", pid, img.String("id"))
			}
		}
	}
	return nil
}
func null(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// Apply is atomic for database data and idempotent by stable IDs. Existing rows
// are never overwritten. Derived counters/trends are rebuilt from relationships.
func (e Export) Apply(ctx context.Context, db *pgxpool.Pool) error {
	if err := e.Validate(); err != nil {
		return err
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	exec := func(sql string, args ...any) error { _, err := tx.Exec(ctx, sql, args...); return err }
	auth := map[string]Document{}
	for _, u := range e.AuthUsers {
		auth[u.String("localId")] = u
	}
	urls := map[string]string{}
	for _, m := range e.Media {
		urls[m.LegacyURL] = "/api/v1/media/" + m.ID
	}
	for _, u := range e.Users {
		uid := u.String("id")
		email := strings.ToLower(auth[uid].String("email"))
		if email == "" {
			email = uid + "@import.invalid"
		}
		photo := "/assets/default-avatar.png"
		if v := urls[u.String("photoURL")]; v != "" {
			photo = v
		}
		cover := urls[u.String("coverPhotoURL")]
		err = exec(`INSERT INTO users(id,email,username,name,bio,website,location,photo_url,cover_photo_url,theme,accent,verified,is_banned,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) ON CONFLICT(id) DO NOTHING`, uid, email, u.String("username"), u.String("name"), null(u.String("bio")), null(u.String("website")), null(u.String("location")), photo, null(cover), null(u.String("theme")), null(u.String("accent")), u.Bool("verified"), u.Bool("isBanned"), u.Time("createdAt"))
		if err != nil {
			return fmt.Errorf("user %s: %w", uid, err)
		}
		var providers []Document
		_ = json.Unmarshal(auth[uid]["providerUserInfo"], &providers)
		for _, p := range providers {
			if p.String("providerId") == "google.com" && p.String("rawId") != "" {
				if err = exec("INSERT INTO oauth_identities(provider,subject,user_id) VALUES('google',$1,$2) ON CONFLICT DO NOTHING", p.String("rawId"), uid); err != nil {
					return err
				}
			}
		}
	}
	for _, m := range e.Media {
		if err = exec("INSERT INTO media(id,owner_id,object_key,content_type,size,alt) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING", m.ID, m.OwnerID, m.ObjectKey, m.ContentType, m.Size, m.Alt); err != nil {
			return err
		}
	}
	for _, p := range e.Tweets {
		if err = exec("INSERT INTO posts(id,author_id,text,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING", p.String("id"), p.String("createdBy"), null(p.String("text")), p.Time("createdAt")); err != nil {
			return err
		}
	}
	for _, p := range e.Tweets {
		pid := p.String("id")
		var parent Document
		_ = json.Unmarshal(p["parent"], &parent)
		if parent.String("id") != "" {
			if err = exec("UPDATE posts SET parent_id=$1 WHERE id=$2 AND parent_id IS NULL", parent.String("id"), pid); err != nil {
				return err
			}
		}
		for _, rel := range []struct{ field, table string }{{"userLikes", "likes"}, {"userRetweets", "reposts"}} {
			for _, uid := range p.Strings(rel.field) {
				if err = exec("INSERT INTO "+rel.table+"(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING", uid, pid); err != nil {
					return err
				}
			}
		}
		var images []Document
		_ = json.Unmarshal(p["images"], &images)
		for i, img := range images {
			if err = exec("INSERT INTO post_media(post_id,media_id,position) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", pid, img.String("id"), i); err != nil {
				return err
			}
		}
	}
	for _, u := range e.Users {
		for _, target := range u.Strings("following") {
			if err = exec("INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING", u.String("id"), target); err != nil {
				return err
			}
		}
		if pin := u.String("pinnedTweet"); pin != "" {
			if err = exec("UPDATE users SET pinned_post_id=$1 WHERE id=$2 AND pinned_post_id IS NULL", pin, u.String("id")); err != nil {
				return err
			}
		}
	}
	for uid, bookmarks := range e.Bookmarks {
		for _, b := range bookmarks {
			if err = exec("INSERT INTO bookmarks(user_id,post_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", uid, b.String("id"), b.Time("createdAt")); err != nil {
				return err
			}
		}
	}
	for _, n := range e.Notifications {
		if err = exec("INSERT INTO notifications(id,user_id,target_user_id,type,is_checked,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING", n.String("id"), n.String("userId"), n.String("targetUserId"), n.String("type"), n.Bool("isChecked"), n.Time("createdAt")); err != nil {
			return err
		}
	}
	if err = exec(`INSERT INTO post_tags(post_id,tag) SELECT id,lower((regexp_matches(text,'#[[:alnum:]_]+','g'))[1]) FROM posts ON CONFLICT DO NOTHING`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

var _ pgx.Tx // Keep the transaction contract explicit for extraction into import jobs.
