package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"net/http/httptest"
	"os"
	"socialmedia/backend/internal/database"
	"sync"
	"testing"
)

func TestIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := "test_" + id()
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
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal("migration rerun", err)
	}
	a, err := New(db)
	if err != nil {
		t.Fatal(err)
	}
	h := a.Handler()
	call := func(method, path string, body any, cookie *http.Cookie) (int, map[string]any, *http.Cookie) {
		b, _ := json.Marshal(body)
		r := httptest.NewRequest(method, "http://localhost:3000/api/v1"+path, bytes.NewReader(b))
		r.Header.Set("X-SNS-Request", "1")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		var c *http.Cookie
		for _, v := range w.Result().Cookies() {
			if v.Name == "sns_session" {
				c = v
			}
		}
		return w.Code, out, c
	}
	must := func(method, path string, body any, c *http.Cookie) map[string]any {
		t.Helper()
		status, out, _ := call(method, path, body, c)
		if status != 200 {
			t.Fatalf("%s %s: %d %+v", method, path, status, out)
		}
		return out
	}
	register := func(email string) (string, *http.Cookie) {
		t.Helper()
		status, u, c := call("POST", "/auth/register", LoginInput{email, "long-passphrase-123"}, nil)
		if status != 200 || c == nil {
			t.Fatalf("register: %d %+v", status, u)
		}
		if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode {
			t.Fatal("insecure cookie")
		}
		return u["id"].(string), c
	}
	alice, ac := register("alice@example.test")
	bob, bc := register("bob@example.test")
	_, ec := register("eve@example.test")
	if status, _, _ := call("POST", "/auth/login", LoginInput{"alice@example.test", "wrong-password"}, nil); status != 401 {
		t.Fatal("bad password accepted")
	}
	if status, _, _ := call("PATCH", "/users/"+bob, map[string]any{"isAdmin": true}, ac); status != 403 {
		t.Fatalf("profile authorization: %d", status)
	}
	if status, _, _ := call("PATCH", "/users/"+alice, map[string]any{"isAdmin": true}, ac); status != 400 {
		t.Fatal("privilege escalation accepted")
	}
	// Concurrent profile updates must serialize without lock-upgrade deadlocks.
	var profileWG sync.WaitGroup
	profileErr := make(chan int, 8)
	for i := 0; i < 8; i++ {
		profileWG.Add(1)
		go func(n int) {
			defer profileWG.Done()
			status, _, _ := call("PATCH", "/users/"+alice, map[string]any{"accent": "blue", "bio": fmt.Sprint("update", n)}, ac)
			if status != 200 {
				profileErr <- status
			}
		}(i)
	}
	profileWG.Wait()
	close(profileErr)
	for status := range profileErr {
		t.Fatalf("concurrent profile update: %d", status)
	}
	must("PUT", "/users/"+bob+"/follow", nil, ac)
	must("PUT", "/users/"+bob+"/follow", nil, ac)
	post := must("POST", "/posts", PostInput{Text: "hello #test"}, bc)["id"].(string)
	q := func(collection string, filters ...Constraint) map[string]any {
		return map[string]any{"collection": collection, "constraints": filters, "limit": 20}
	}
	feed := must("POST", "/query", q("feed"), ac)
	if len(feed["items"].([]any)) != 1 {
		t.Fatal("followed post missing from feed")
	}
	search := must("POST", "/query", q("posts", Constraint{Kind: "where", Field: "text", Op: "search", Value: "hello"}), ac)
	if len(search["items"].([]any)) != 1 {
		t.Fatal("full-text search did not find post")
	}
	if status, _, _ := call("DELETE", "/posts/"+post, nil, ec); status != 403 {
		t.Fatal("unauthorized delete accepted")
	}
	var wg sync.WaitGroup
	fail := make(chan int, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s, _, _ := call("PUT", "/posts/"+post+"/like", nil, ac)
			if s != 200 {
				fail <- s
			}
		}()
	}
	wg.Wait()
	close(fail)
	for s := range fail {
		t.Fatalf("concurrent like: %d", s)
	}
	var likes int
	if err = db.QueryRow(ctx, "SELECT count(*) FROM likes WHERE post_id=$1", post).Scan(&likes); err != nil || likes != 1 {
		t.Fatal("duplicate likes", likes, err)
	}
	must("PUT", "/posts/"+post+"/repost", nil, ac)
	must("PATCH", "/users/"+bob, map[string]any{"pinnedPost": post}, bc)
	profile := must("GET", "/auth/me", nil, bc)
	if profile["pinnedPost"] != post || profile["totalPosts"] != float64(1) {
		t.Fatalf("profile post fields: %v", profile)
	}
	projected := must("POST", "/query", q("posts", Constraint{Kind: "where", Field: "userReposts", Op: "array-contains", Value: alice}), ac)["items"].([]any)
	if len(projected) != 1 || projected[0].(map[string]any)["id"] != post {
		t.Fatalf("repost projection: %v", projected)
	}
	stats := must("POST", "/query", q("users/"+alice+"/stats"), ac)["items"].([]any)
	ids := stats[0].(map[string]any)["posts"].([]any)
	if len(ids) != 1 || ids[0] != post {
		t.Fatalf("post stats: %v", stats)
	}

	reply := must("POST", "/posts", PostInput{Text: "reply", ParentID: &post}, ac)["id"].(string)
	_ = reply
	for _, endpoint := range []struct{ method, path string }{{"PUT", "/posts/" + post + "/bookmark"}, {"DELETE", "/posts/" + post + "/bookmark"}, {"DELETE", "/bookmarks"}} {
		if status, _, _ := call(endpoint.method, endpoint.path, nil, ac); status != 404 {
			t.Fatalf("removed endpoint %s: %d", endpoint.path, status)
		}
	}
	if status, _, _ := call("POST", "/query", q("users/"+alice+"/bookmarks"), ac); status != 400 {
		t.Fatalf("removed collection: %d", status)
	}

	for _, route := range []string{"/messages", "/conversations"} {
		if status, _, _ := call("POST", route, map[string]string{}, ac); status != http.StatusNotFound {
			t.Fatalf("removed route %s returned %d", route, status)
		}
	}
	ns := must("POST", "/query", q("notifications"), bc)["items"].([]any)
	if len(ns) < 2 {
		t.Fatal("missing notifications")
	}
	nid := ns[0].(map[string]any)["id"].(string)
	if s, _, _ := call("PATCH", "/notifications/"+nid, map[string]bool{"isChecked": true}, ec); s != 403 {
		t.Fatal("notification write leak")
	}
	must("PATCH", "/notifications/"+nid, map[string]bool{"isChecked": true}, bc)
	// Stable pagination with tied timestamps.
	for i := 0; i < 3; i++ {
		must("POST", "/posts", PostInput{Text: fmt.Sprint("page", i)}, ac)
	}
	page := must("POST", "/query", map[string]any{"collection": "posts", "limit": 2}, ac)
	next := page["nextCursor"].(string)
	if next == "" {
		t.Fatal("missing next cursor")
	}
	second := must("POST", "/query", map[string]any{"collection": "posts", "limit": 2, "cursor": next}, ac)
	seen := map[string]bool{}
	for _, p := range page["items"].([]any) {
		seen[p.(map[string]any)["id"].(string)] = true
	}
	for _, p := range second["items"].([]any) {
		if seen[p.(map[string]any)["id"].(string)] {
			t.Fatal("pagination duplicate")
		}
	}
	must("DELETE", "/posts/"+post, nil, bc)
	for _, table := range []string{"likes", "reposts", "post_tags"} {
		var n int
		db.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE post_id=$1", post).Scan(&n)
		if n != 0 {
			t.Fatal("orphaned relation", table)
		}
	}
	if s, _, _ := call("PUT", "/users/"+bob+"/ban", map[string]any{"banned": true, "reason": "test"}, ac); s != 403 {
		t.Fatal("nonadmin ban accepted")
	}
	if _, err = db.Exec(ctx, "UPDATE users SET is_admin=true WHERE id=$1", alice); err != nil {
		t.Fatal(err)
	}
	must("PUT", "/users/"+bob+"/ban", map[string]any{"banned": true, "reason": "test"}, ac)
	if s, _, _ := call("POST", "/posts", PostInput{Text: "banned"}, bc); s != 401 && s != 403 {
		t.Fatal("banned session accepted")
	}
	must("PUT", "/users/"+bob+"/ban", map[string]any{"banned": false, "reason": "appeal"}, ac)
	r := httptest.NewRequest("POST", "/api/v1/posts", bytes.NewBufferString(`{}`))
	r.AddCookie(ac)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("CSRF request accepted")
	}
	must("POST", "/auth/logout", nil, ac)
	if s, _, _ := call("GET", "/auth/me", nil, ac); s != 401 {
		t.Fatal("logged out token accepted")
	}
}
