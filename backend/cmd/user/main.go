// Administrative CLI: never exposed as an HTTP privilege-escalation endpoint.
package main

import (
	"context"
	"flag"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"io"
	"log"
	"os"
	"strings"
)

func main() {
	email := flag.String("email", "", "existing account email")
	admin := flag.Bool("admin", false, "grant administrator role")
	password := flag.Bool("password-stdin", false, "set password from stdin and revoke all sessions")
	flag.Parse()
	if *email == "" || (!*admin && !*password) {
		log.Fatal("use -email and either -admin or -password-stdin")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if *password {
		b, err := io.ReadAll(io.LimitReader(os.Stdin, 74))
		if err != nil {
			log.Fatal(err)
		}
		p := strings.TrimSuffix(string(b), "\n")
		if len(p) < 12 || len(p) > 72 {
			log.Fatal("password must contain 12–72 bytes")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(p), 12)
		if err != nil {
			log.Fatal(err)
		}
		tag, err := db.Exec(ctx, "UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE email=lower($2)", string(hash), *email)
		if err != nil {
			log.Fatal(err)
		}
		if tag.RowsAffected() != 1 {
			log.Fatal("account not found")
		}
	}
	if *admin {
		tag, err := db.Exec(ctx, "UPDATE users SET is_admin=true WHERE email=lower($1) AND NOT is_banned", *email)
		if err != nil {
			log.Fatal(err)
		}
		if tag.RowsAffected() != 1 {
			log.Fatal("active account not found")
		}
	}
	fmt.Println("Account updated")
}
