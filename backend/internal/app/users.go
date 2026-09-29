package app

import (
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

var usernameRE = regexp.MustCompile(`^[a-zA-Z0-9_]{3,30}$`)

func validUsername(s string) bool {
	if !usernameRE.MatchString(s) {
		return false
	}
	switch strings.ToLower(s) {
	case "home", "notifications", "bookmarks", "explore", "api", "admin", "login", "assets":
		return false
	}
	return true
}
func (a *App) updateUser(w http.ResponseWriter, r *http.Request) error {
	var in map[string]json.RawMessage
	if err := decode(w, r, &in); err != nil {
		return err
	}
	columns := map[string]string{"name": "name", "bio": "bio", "website": "website", "location": "location", "username": "username", "photoURL": "photo_url", "coverPhotoURL": "cover_photo_url", "theme": "theme", "accent": "accent", "pinnedTweet": "pinned_post_id"}
	err := a.transaction(r, func(tx pgx.Tx, uid string) error {
		target := r.PathValue("id")
		var admin bool
		if err := tx.QueryRow(r.Context(), "SELECT is_admin FROM users WHERE id=$1", uid).Scan(&admin); err != nil {
			return err
		}
		if target != uid && !admin {
			return forbidden()
		}
		for key, raw := range in {
			col, ok := columns[key]
			if !ok {
				return bad("unsupported profile field: " + key)
			}
			var value *string
			if err := json.Unmarshal(raw, &value); err != nil {
				return bad("profile values must be strings or null")
			}
			v := ""
			if value != nil {
				v = *value
			}
			max := 160
			switch key {
			case "name":
				max = 50
				if strings.TrimSpace(v) == "" {
					return bad("name required")
				}
			case "username":
				if !validUsername(v) {
					return bad("invalid username")
				}
			case "location":
				max = 30
			case "website":
				max = 100
				if v != "" {
					u, e := url.Parse(v)
					if e != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
						return bad("invalid website")
					}
				}
			case "theme":
				if v != "" && v != "light" && v != "dim" && v != "dark" {
					return bad("invalid theme")
				}
			case "accent":
				if v != "" && v != "blue" && v != "yellow" && v != "pink" && v != "purple" && v != "orange" && v != "green" {
					return bad("invalid accent")
				}
			case "photoURL", "coverPhotoURL":
				if v != "" && v != "/assets/default-avatar.png" {
					mid := strings.TrimPrefix(v, "/api/v1/media/")
					var exists bool
					if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM media WHERE id=$1 AND owner_id=$2 AND content_type LIKE 'image/%')", mid, uid).Scan(&exists); err != nil {
						return err
					}
					if !exists {
						return bad("invalid profile image")
					}
				}
			case "pinnedTweet":
				if v != "" {
					var exists bool
					if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM posts WHERE id=$1 AND author_id=$2)", v, target).Scan(&exists); err != nil {
						return err
					}
					if !exists {
						return bad("you may only pin your own post")
					}
				}
			}
			if utf8.RuneCountInString(v) > max {
				return bad("profile field too long")
			}
			if _, err := tx.Exec(r.Context(), "UPDATE users SET "+col+"=$1,updated_at=now() WHERE id=$2", value, target); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return respond(w, map[string]bool{"ok": true})
}
func (a *App) follow(add bool) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		err := a.transaction(r, func(tx pgx.Tx, uid string) error {
			target := r.PathValue("id")
			if target == uid {
				return bad("cannot follow yourself")
			}
			ctx := r.Context()
			var banned bool
			if err := tx.QueryRow(ctx, "SELECT is_banned FROM users WHERE id=$1", target).Scan(&banned); err != nil {
				return err
			}
			if banned {
				return forbidden()
			}
			if add {
				tag, err := tx.Exec(ctx, "INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING", uid, target)
				if err != nil {
					return err
				}
				if tag.RowsAffected() > 0 {
					return notify(ctx, tx, uid, target, "follower", nil)
				}
				return nil
			}
			_, err := tx.Exec(ctx, "DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2", uid, target)
			return err
		})
		if err != nil {
			return err
		}
		return respond(w, map[string]bool{"ok": true})
	}
}
func (a *App) ban(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Banned bool   `json:"banned"`
		Reason string `json:"reason"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if strings.TrimSpace(in.Reason) == "" || len(in.Reason) > 1000 {
		return bad("reason required (max 1000 bytes)")
	}
	err := a.transaction(r, func(tx pgx.Tx, uid string) error {
		var admin bool
		if err := tx.QueryRow(r.Context(), "SELECT is_admin FROM users WHERE id=$1", uid).Scan(&admin); err != nil {
			return err
		}
		if !admin || uid == r.PathValue("id") {
			return forbidden()
		}
		tag, err := tx.Exec(r.Context(), "UPDATE users SET is_banned=$1,session_version=session_version+1,updated_at=now() WHERE id=$2 AND NOT is_admin", in.Banned, r.PathValue("id"))
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return forbidden()
		}
		_, err = tx.Exec(r.Context(), "INSERT INTO moderation_events(actor_id,target_id,banned,reason) VALUES($1,$2,$3,$4)", uid, r.PathValue("id"), in.Banned, in.Reason)
		return err
	})
	if err != nil {
		return err
	}
	return respond(w, map[string]bool{"ok": true})
}
