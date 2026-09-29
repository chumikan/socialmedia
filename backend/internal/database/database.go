package database

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"socialmedia/backend/migrations"
	"sort"
	"time"
)

func Migrate(ctx context.Context, db *pgxpool.Pool) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(72841019); CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	entries, err := migrations.Files.ReadDir(".")
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, e := range entries {
		var exists bool
		if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)", e.Name()).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		sql, _ := migrations.Files.ReadFile(e.Name())
		if _, err = tx.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("migration %s: %w", e.Name(), err)
		}
		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations(name) VALUES($1)", e.Name()); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// SCS stores only opaque session tokens in cookies. The session data stays in PostgreSQL.
type SessionStore struct{ DB *pgxpool.Pool }

func (s SessionStore) Find(token string) ([]byte, bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var b []byte
	err := s.DB.QueryRow(ctx, "SELECT data FROM sessions WHERE token=$1 AND expiry>now()", token).Scan(&b)
	if err == pgx.ErrNoRows {
		return nil, false, nil
	}
	return b, err == nil, err
}
func (s SessionStore) Commit(token string, b []byte, expiry time.Time) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := s.DB.Exec(ctx, "INSERT INTO sessions(token,data,expiry) VALUES($1,$2,$3) ON CONFLICT(token) DO UPDATE SET data=$2,expiry=$3", token, b, expiry)
	return err
}
func (s SessionStore) Delete(token string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := s.DB.Exec(ctx, "DELETE FROM sessions WHERE token=$1", token)
	return err
}
