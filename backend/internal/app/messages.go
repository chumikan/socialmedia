package app

import (
	"github.com/jackc/pgx/v5"
	"net/http"
	"strings"
	"unicode/utf8"
)

func (a *App) createConversation(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Target string `json:"targetUserId"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	cid := id()
	err := a.transaction(r, func(tx pgx.Tx, uid string) error {
		if in.Target == uid {
			return bad("cannot message yourself")
		}
		var banned bool
		if err := tx.QueryRow(r.Context(), "SELECT is_banned FROM users WHERE id=$1", in.Target).Scan(&banned); err != nil {
			return err
		}
		if banned {
			return forbidden()
		}
		return tx.QueryRow(r.Context(), `INSERT INTO conversations(id,user_id,target_user_id) VALUES($1,$2,$3) ON CONFLICT(least(user_id,target_user_id),greatest(user_id,target_user_id)) DO UPDATE SET id=conversations.id RETURNING id`, cid, uid, in.Target).Scan(&cid)
	})
	if err != nil {
		return err
	}
	return respond(w, map[string]string{"id": cid})
}
func (a *App) createMessage(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		ConversationID string `json:"conversationId"`
		Text           string `json:"text"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	in.Text = strings.TrimSpace(in.Text)
	if in.Text == "" || utf8.RuneCountInString(in.Text) > 4000 {
		return bad("message must contain 1–4000 characters")
	}
	mid := id()
	err := a.transaction(r, func(tx pgx.Tx, uid string) error {
		ctx := r.Context()
		var target string
		if err := tx.QueryRow(ctx, "SELECT CASE WHEN user_id=$2 THEN target_user_id ELSE user_id END FROM conversations WHERE id=$1 AND (user_id=$2 OR target_user_id=$2) FOR UPDATE", in.ConversationID, uid).Scan(&target); err != nil {
			return err
		}
		var banned bool
		if err := tx.QueryRow(ctx, "SELECT is_banned FROM users WHERE id=$1", target).Scan(&banned); err != nil {
			return err
		}
		if banned {
			return forbidden()
		}
		if _, err := tx.Exec(ctx, "INSERT INTO messages(id,conversation_id,user_id,text) VALUES($1,$2,$3,$4)", mid, in.ConversationID, uid, in.Text); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "UPDATE conversations SET updated_at=now() WHERE id=$1", in.ConversationID); err != nil {
			return err
		}
		return notify(ctx, tx, uid, target, "message", nil)
	})
	if err != nil {
		return err
	}
	return respond(w, map[string]string{"id": mid})
}
func (a *App) readNotification(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		IsChecked bool `json:"isChecked"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	err := a.transaction(r, func(tx pgx.Tx, uid string) error {
		tag, err := tx.Exec(r.Context(), "UPDATE notifications SET is_checked=$1,updated_at=now() WHERE id=$2 AND target_user_id=$3", in.IsChecked, r.PathValue("id"), uid)
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
