package app

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"log"
	"net"
	"net/smtp"
	"os"
	"strings"
	"time"
)

// At-least-once outbox delivery, with row locking so independent workers can be
// extracted later. SMTP is optional; undelivered events remain in PostgreSQL.
func (a *App) RunWorkers(ctx context.Context) {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			_, err := a.DB.Exec(ctx, "DELETE FROM sessions WHERE expiry<now(); DELETE FROM auth_attempts WHERE window_start<now()-interval '1 hour'")
			if err != nil {
				log.Printf("session cleanup: %v", err)
			}
			if os.Getenv("SMTP_ADDR") != "" {
				if err = a.deliverEmail(ctx); err != nil {
					log.Printf("outbox delivery: %v", err)
				}
			}
		}
	}
}
func (a *App) deliverEmail(ctx context.Context) error {
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var event int64
	var pid string
	err = tx.QueryRow(ctx, "SELECT id,payload->>'postId' FROM outbox WHERE delivered_at IS NULL AND kind='post.created' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED").Scan(&event, &pid)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	from, to := os.Getenv("SMTP_FROM"), os.Getenv("SMTP_TO")
	if from == "" || to == "" || strings.ContainsAny(from+to, "\r\n") {
		return bad("invalid SMTP configuration")
	}
	conn, err := net.DialTimeout("tcp", os.Getenv("SMTP_ADDR"), 5*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	host, _, err := net.SplitHostPort(os.Getenv("SMTP_ADDR"))
	if err != nil {
		return err
	}
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()
	if os.Getenv("SMTP_USERNAME") != "" {
		return bad("configure a trusted local SMTP relay; direct password SMTP is unsupported")
	}
	if err = client.Mail(from); err != nil {
		return err
	}
	if err = client.Rcpt(to); err != nil {
		return err
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	_, err = w.Write([]byte("From: " + from + "\r\nTo: " + to + "\r\nSubject: New SNS post\r\n\r\nPost ID: " + pid + "\r\n"))
	if err != nil {
		return err
	}
	if err = w.Close(); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE outbox SET delivered_at=now() WHERE id=$1", event); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
