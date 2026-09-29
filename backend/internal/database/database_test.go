package database

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"socialmedia/backend/migrations"
)

func TestRemoveDMMigration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("migration_test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(ctx, "CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"001_initial.sql", "002_auth.sql", "003_sessions_search.sql"} {
		sql, err := migrations.Files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(ctx, string(sql)); err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(ctx, "INSERT INTO schema_migrations(name) VALUES($1)", name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = db.Exec(ctx, `
 INSERT INTO users(id,email,username,name) VALUES('a','a@test.invalid','alice','Alice'),('b','b@test.invalid','bob','Bob');
 INSERT INTO posts(id,author_id,text) VALUES('p','a','retained');
 INSERT INTO conversations(id,user_id,target_user_id) VALUES('c','a','b');
 INSERT INTO messages(id,conversation_id,user_id,text) VALUES('m','c','a','removed');
 INSERT INTO notifications(id,user_id,target_user_id,type) VALUES('dm','a','b','message'),('follow','a','b','follower');
 `); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = Migrate(ctx, db); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"messages", "conversations", "message_documents", "conversation_documents", "messages_pkey", "conversations_pkey", "messages_conversation", "conversations_pair", "conversations_user", "conversations_target"} {
		var absent bool
		if err = db.QueryRow(ctx, "SELECT to_regclass($1) IS NULL", schema+"."+name).Scan(&absent); err != nil || !absent {
			t.Fatalf("relation %s remains: %v", name, err)
		}
	}
	var retained bool
	if err = db.QueryRow(ctx, `SELECT
 (SELECT count(*) FROM users)=2 AND
 (SELECT count(*) FROM posts WHERE id='p')=1 AND
 (SELECT count(*) FROM notifications)=1 AND
 (SELECT type FROM notifications WHERE id='follow')='follower'`).Scan(&retained); err != nil || !retained {
		t.Fatalf("unrelated data changed: %v", err)
	}
}
