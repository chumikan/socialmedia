package app

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// The query API is a read-only view adapter for the preserved UI. No table names,
// SQL expressions or write operations are accepted from clients.
type Constraint struct {
	Kind  string `json:"kind"`
	Field string `json:"field,omitempty"`
	Op    string `json:"op,omitempty"`
	Value any    `json:"value,omitempty"`
}
type QueryInput struct {
	Collection  string       `json:"collection"`
	Constraints []Constraint `json:"constraints"`
	Limit       int          `json:"limit"`
	Cursor      string       `json:"cursor,omitempty"`
	Count       bool         `json:"count,omitempty"`
}

func (a *App) query(w http.ResponseWriter, r *http.Request) error {
	uid, err := a.actor(r)
	if err != nil {
		return err
	}
	var in QueryInput
	if err = decode(w, r, &in); err != nil {
		return err
	}
	sql, args, err := compileQuery(in, uid)
	if err != nil {
		return err
	}
	if in.Count {
		var n int
		if err = a.DB.QueryRow(r.Context(), sql, args...).Scan(&n); err != nil {
			return err
		}
		return respond(w, map[string]int{"count": n})
	}
	rows, err := a.DB.Query(r.Context(), sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var b json.RawMessage
		if err = rows.Scan(&b); err != nil {
			return err
		}
		items = append(items, b)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	n := in.Limit
	if n <= 0 {
		n = 50
	}
	if n > 100 {
		n = 100
	}
	next := ""
	if len(items) > n {
		items = items[:n]
		next = encodeCursor(in, items[n-1])
	}
	return respond(w, struct {
		Items      []json.RawMessage `json:"items"`
		NextCursor string            `json:"nextCursor"`
	}{items, next})
}

type pageCursor struct {
	Scope string            `json:"scope"`
	Keys  []json.RawMessage `json:"keys"`
}

func sortConstraints(in QueryInput) []Constraint {
	result := []Constraint{}
	for _, c := range in.Constraints {
		if c.Kind == "order" {
			result = append(result, c)
		}
	}
	if len(result) == 0 {
		result = append(result, Constraint{Field: "createdAt", Op: "desc"})
	}
	return append(result, Constraint{Field: "id", Op: "desc"})
}
func cursorScope(in QueryInput) string {
	in.Limit = 0
	in.Cursor = ""
	in.Count = false
	b, _ := json.Marshal(in)
	return fmt.Sprintf("%x", sha256.Sum256(b))
}
func encodeCursor(in QueryInput, item json.RawMessage) string {
	var data map[string]json.RawMessage
	_ = json.Unmarshal(item, &data)
	c := pageCursor{Scope: cursorScope(in)}
	for _, sort := range sortConstraints(in) {
		v := data[sort.Field]
		if sort.Field == "parent.id" {
			var parent map[string]json.RawMessage
			_ = json.Unmarshal(data["parent"], &parent)
			v = parent["id"]
		}
		if len(v) == 0 {
			v = json.RawMessage("null")
		}
		c.Keys = append(c.Keys, v)
	}
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}
func decodeCursor(s string) (pageCursor, error) {
	var c pageCursor
	if len(s) > 8192 {
		return c, bad("invalid cursor")
	}
	b, e := base64.RawURLEncoding.DecodeString(s)
	if e != nil {
		return c, bad("invalid cursor")
	}
	if json.Unmarshal(b, &c) != nil {
		return c, bad("invalid cursor")
	}
	return c, nil
}
func compileQuery(in QueryInput, uid string) (string, []any, error) {
	args := []any{uid}
	base := ""
	security := "TRUE"
	fields := map[string]bool{}
	addFields := func(s string) {
		for _, f := range strings.Fields(s) {
			fields[f] = true
		}
	}
	addFields("id createdAt updatedAt")
	switch in.Collection {
	case "users":
		base = "SELECT id,data FROM user_documents"
		addFields("username name following followers isBanned")
	case "posts", "feed":
		base = "SELECT id,data FROM post_documents"
		addFields("createdBy parent parent.id images userLikes userReposts text")
		if in.Collection == "feed" {
			security = "(author_id=$1 OR EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=author_id) OR EXISTS(SELECT 1 FROM reposts rp JOIN follows f ON f.followed_id=rp.user_id WHERE f.follower_id=$1 AND rp.post_id=post_documents.id))"
		}
		base += " WHERE " + security
	case "notifications":
		base = "SELECT id,data FROM notification_documents WHERE target_user_id=$1"
		addFields("userId targetUserId type isChecked")
	case "trends":
		base = "SELECT id,data FROM trend_documents"
		addFields("text counter")
	default:
		parts := strings.Split(in.Collection, "/")
		if len(parts) != 3 || parts[0] != "users" {
			return "", nil, bad("unknown collection")
		}
		if parts[2] == "stats" {
			args = append(args, parts[1])
			base = `SELECT 'stats' AS id,jsonb_build_object('id','stats','likes',coalesce((SELECT jsonb_agg(post_id) FROM likes WHERE user_id=$2),'[]'),'posts',coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM posts WHERE author_id=$2 UNION SELECT post_id FROM reposts WHERE user_id=$2) s),'[]'),'updatedAt',null) AS data WHERE $1::text IS NOT NULL`
		} else {
			return "", nil, bad("unknown collection")
		}
	}
	// Ensure the actor parameter is always referenced (even in public views).
	clauses := []string{"$1::text IS NOT NULL"}

	orderField := "createdAt"
	expr := func(field string) (string, error) {
		if !fields[field] {
			return "", bad("unsupported query field")
		}
		if field == "parent.id" {
			return "data #> '{parent,id}'", nil
		}
		return "data->'" + field + "'", nil
	}
	if len(in.Constraints) > 12 {
		return "", nil, bad("too many constraints")
	}
	for _, c := range in.Constraints {
		if c.Kind == "order" {
			x, e := expr(c.Field)
			if e != nil {
				return "", nil, e
			}
			direction := "ASC"
			if c.Op == "desc" {
				direction = "DESC"
			} else if c.Op != "asc" {
				return "", nil, bad("invalid order")
			}
			_ = x
			_ = direction
			orderField = c.Field
			continue
		}
		if c.Kind == "limit" {
			continue
		}
		field := c.Field
		op := c.Op
		if c.Kind == "start" {
			field = orderField
			op = ">="
		}
		if c.Kind == "end" {
			field = orderField
			op = "<="
		}
		if op == "search" && field == "text" && (in.Collection == "posts" || in.Collection == "feed") {
			text, ok := c.Value.(string)
			if !ok || len(text) > 200 {
				return "", nil, bad("invalid search")
			}
			args = append(args, text)
			clauses = append(clauses, fmt.Sprintf("id IN (SELECT id FROM posts WHERE to_tsvector('simple',coalesce(text,'')) @@ websearch_to_tsquery('simple',$%d))", len(args)))
			continue
		}
		x, e := expr(field)
		if e != nil {
			return "", nil, e
		}
		b, e := json.Marshal(c.Value)
		if e != nil {
			return "", nil, bad("invalid filter")
		}
		args = append(args, string(b))
		p := fmt.Sprintf("$%d::jsonb", len(args))
		switch op {
		case "==":
			clauses = append(clauses, x+" = "+p)
		case "!=":
			clauses = append(clauses, x+" <> "+p)
		case ">=", "<=", ">", "<":
			clauses = append(clauses, x+" "+op+" "+p)
		case "array-contains":
			clauses = append(clauses, x+" @> jsonb_build_array("+p+")")
		default:
			return "", nil, bad("unsupported operator")
		}
	}

	if in.Count {
		return "SELECT count(*) FROM (" + base + ") AS documents WHERE " + strings.Join(clauses, " AND "), args, nil
	}
	sorts := sortConstraints(in)
	orders := []string{}
	expressions := []string{}
	for _, sort := range sorts {
		x, e := expr(sort.Field)
		if e != nil {
			return "", nil, e
		}
		x = "coalesce(" + x + ",'null'::jsonb)"
		expressions = append(expressions, x)
		direction := "ASC"
		if sort.Op == "desc" {
			direction = "DESC"
		}
		orders = append(orders, x+" "+direction)
	}
	if in.Cursor != "" {
		cursor, e := decodeCursor(in.Cursor)
		if e != nil {
			return "", nil, e
		}
		if cursor.Scope != cursorScope(in) || len(cursor.Keys) != len(sorts) {
			return "", nil, bad("cursor does not match query")
		}
		equal := []string{}
		branches := []string{}
		for i, key := range cursor.Keys {
			args = append(args, string(key))
			p := fmt.Sprintf("$%d::jsonb", len(args))
			op := ">"
			if sorts[i].Op == "desc" {
				op = "<"
			}
			term := expressions[i] + op + p
			parts := append(append([]string{}, equal...), term)
			branches = append(branches, "("+strings.Join(parts, " AND ")+")")
			equal = append(equal, expressions[i]+"="+p)
		}
		clauses = append(clauses, "("+strings.Join(branches, " OR ")+")")
	}
	n := in.Limit
	if n <= 0 {
		n = 50
	}
	if n > 100 {
		n = 100
	}
	args = append(args, n+1)
	return "SELECT data FROM (" + base + ") AS documents WHERE " + strings.Join(clauses, " AND ") + " ORDER BY " + strings.Join(orders, ",") + fmt.Sprintf(" LIMIT $%d", len(args)), args, nil
}
