package app

import (
	"strings"
	"testing"
)

func TestQueryAuthorizationAndInjection(t *testing.T) {
	for _, collection := range []string{"notifications"} {
		sql, args, err := compileQuery(QueryInput{Collection: collection, Limit: 10}, "alice")
		if err != nil {
			t.Fatal(err)
		}
		if args[0] != "alice" || !strings.Contains(sql, "=$1") {
			t.Fatalf("missing recipient predicate: %s", sql)
		}
	}
	for _, q := range []QueryInput{{Collection: "users; DROP TABLE users"}, {Collection: "users", Constraints: []Constraint{{Kind: "where", Field: "id') OR TRUE --", Op: "==", Value: "x"}}}, {Collection: "users", Cursor: "invalid"}} {
		if _, _, e := compileQuery(q, "alice"); e == nil {
			t.Fatalf("accepted invalid query: %+v", q)
		}
	}
}
func TestUsernameAndMediaValidation(t *testing.T) {
	for _, s := range []string{"admin", "Home", "ab", "a/b", "x y"} {
		if validUsername(s) {
			t.Errorf("accepted username %q", s)
		}
	}
	if !validUsername("hello_123") {
		t.Fatal("valid username rejected")
	}
	if allowedMedia("image/svg+xml") || allowedMedia("text/html") {
		t.Fatal("active content accepted")
	}
}

func TestRemovedCollectionsRejected(t *testing.T) {
	for _, collection := range []string{"messages", "conversations"} {
		if _, _, err := compileQuery(QueryInput{Collection: collection}, "alice"); err == nil {
			t.Fatalf("removed collection accepted: %s", collection)
		}
	}
}
