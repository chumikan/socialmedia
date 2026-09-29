package app

import (
	"github.com/jackc/pgx/v5"
	"net/http"
)

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
