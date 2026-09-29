package app

import (
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"
)

type PostInput struct {
	Text     string   `json:"text"`
	ParentID *string  `json:"parentId"`
	MediaIDs []string `json:"mediaIds"`
}

var hashtag = regexp.MustCompile(`#[\p{L}\p{N}_]+`)

func (a *App) createPost(w http.ResponseWriter, r *http.Request) error {
	var in PostInput
	if err := decode(w, r, &in); err != nil {
		return err
	}
	in.Text = strings.TrimSpace(in.Text)
	if utf8.RuneCountInString(in.Text) > 280 || (in.Text == "" && len(in.MediaIDs) == 0) || len(in.MediaIDs) > 4 {
		return bad("post needs text or up to four media items; maximum 280 characters")
	}
	pid := id()
	err := a.transaction(r, func(tx pgx.Tx, uid string) error {
		ctx := r.Context()
		var parentAuthor string
		if in.ParentID != nil {
			if err := tx.QueryRow(ctx, "SELECT p.author_id FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=$1 AND NOT u.is_banned FOR SHARE OF p", *in.ParentID).Scan(&parentAuthor); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, "INSERT INTO posts(id,author_id,text,parent_id) VALUES($1,$2,$3,$4)", pid, uid, nullable(in.Text), in.ParentID); err != nil {
			return err
		}
		for i, mid := range in.MediaIDs {
			tag, err := tx.Exec(ctx, "INSERT INTO post_media(post_id,media_id,position) SELECT $1,id,$3 FROM media WHERE id=$2 AND owner_id=$4", pid, mid, i, uid)
			if err != nil {
				return err
			}
			if tag.RowsAffected() != 1 {
				return bad("media does not belong to you")
			}
		}
		for _, tag := range hashtag.FindAllString(in.Text, -1) {
			if _, err := tx.Exec(ctx, "INSERT INTO post_tags(post_id,tag) VALUES($1,$2) ON CONFLICT DO NOTHING", pid, strings.ToLower(tag)); err != nil {
				return err
			}
		}
		if in.ParentID != nil {
			if err := notify(ctx, tx, uid, parentAuthor, "reply", pid); err != nil {
				return err
			}
		}
		payload, _ := json.Marshal(map[string]string{"postId": pid, "authorId": uid})
		_, err := tx.Exec(ctx, "INSERT INTO outbox(kind,payload) VALUES('post.created',$1)", payload)
		return err
	})
	if err != nil {
		return err
	}
	return respond(w, map[string]string{"id": pid})
}
func (a *App) deletePost(w http.ResponseWriter, r *http.Request) error {
	err := a.transaction(r, func(tx pgx.Tx, uid string) error {
		tag, err := tx.Exec(r.Context(), "DELETE FROM posts WHERE id=$1 AND (author_id=$2 OR EXISTS(SELECT 1 FROM users WHERE id=$2 AND is_admin))", r.PathValue("id"), uid)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return forbidden()
		}
		return nil
	})
	if err != nil {
		return err
	}
	return respond(w, map[string]bool{"ok": true})
}
func (a *App) interaction(kind string, add bool) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		table := map[string]string{"like": "likes", "repost": "reposts", "bookmark": "bookmarks"}[kind]
		err := a.transaction(r, func(tx pgx.Tx, uid string) error {
			pid := r.PathValue("id")
			var author string
			ctx := r.Context()
			if err := tx.QueryRow(ctx, "SELECT p.author_id FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=$1 AND NOT u.is_banned FOR SHARE OF p", pid).Scan(&author); err != nil {
				return err
			}
			if add {
				tag, err := tx.Exec(ctx, "INSERT INTO "+table+"(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING", uid, pid)
				if err != nil {
					return err
				}
				if tag.RowsAffected() > 0 && kind != "bookmark" {
					nt := kind
					if kind == "like" {
						nt = "liked"
					}
					return notify(ctx, tx, uid, author, nt, pid)
				}
				return nil
			}
			_, err := tx.Exec(ctx, "DELETE FROM "+table+" WHERE user_id=$1 AND post_id=$2", uid, pid)
			return err
		})
		if err != nil {
			return err
		}
		return respond(w, map[string]bool{"ok": true})
	}
}
func (a *App) clearBookmarks(w http.ResponseWriter, r *http.Request) error {
	err := a.transaction(r, func(tx pgx.Tx, uid string) error {
		_, err := tx.Exec(r.Context(), "DELETE FROM bookmarks WHERE user_id=$1", uid)
		return err
	})
	if err != nil {
		return err
	}
	return respond(w, map[string]bool{"ok": true})
}
