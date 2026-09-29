package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"socialmedia/backend/internal/database"
	"testing"
	"time"
)

func fixture(t *testing.T) Export {
	t.Helper()
	b, e := os.ReadFile("../../../docs/fixtures/firebase-export.json")
	if e != nil {
		t.Fatal(e)
	}
	var v Export
	if e = json.Unmarshal(b, &v); e != nil {
		t.Fatal(e)
	}
	return v
}
func TestOfflineValidation(t *testing.T) {
	v := fixture(t)
	if e := v.Validate(); e != nil {
		t.Fatal(e)
	}
	if v.Users[0].Time("createdAt").Unix() != 1700000000 {
		t.Fatal("legacy timestamp conversion")
	}
	v.Tweets[0]["images"] = json.RawMessage(`[{"id":"missing"}]`)
	if v.Validate() == nil {
		t.Fatal("missing media silently accepted")
	}
}
func TestImportIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL")
	}
	ctx := context.Background()
	db, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	schema := fmt.Sprintf("import_test_%d", time.Now().UnixNano())
	if _, e = db.Exec(ctx, "CREATE SCHEMA "+schema); e != nil {
		t.Fatal(e)
	}
	defer db.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	cfg, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		t.Fatal(e)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	p, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	defer p.Close()
	if e = database.Migrate(ctx, p); e != nil {
		t.Fatal(e)
	}
	v := fixture(t)
	for i := 0; i < 2; i++ {
		if e = v.Apply(ctx, p); e != nil {
			t.Fatal(e)
		}
	}
	for table, want := range map[string]int{"users": 2, "posts": 1, "follows": 1, "likes": 1, "reposts": 1, "bookmarks": 1, "messages": 1, "post_tags": 1} {
		var n int
		if e = p.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&n); e != nil || n != want {
			t.Fatalf("%s: %d %v", table, n, e)
		}
	}
	var hash *string
	var admin bool
	if e = p.QueryRow(ctx, "SELECT password_hash,is_admin FROM users WHERE id='legacy-a'").Scan(&hash, &admin); e != nil || hash != nil || admin {
		t.Fatal("unsafe credential import")
	}
	v.Users[0]["following"] = json.RawMessage(`["missing-user"]`)
	if v.Apply(ctx, p) == nil {
		t.Fatal("dangling FK import accepted")
	}
}
