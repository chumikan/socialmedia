package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"log"
	"os"
	"path/filepath"
	"socialmedia/backend/internal/app"
	"socialmedia/backend/internal/database"
	"socialmedia/backend/internal/importer"
	"strings"
)

func main() {
	file := flag.String("file", "", "offline export.json")
	apply := flag.Bool("apply", false, "apply to DATABASE_URL (default validates only)")
	mediaDir := flag.String("media-dir", "", "local files named by objectKey")
	flag.Parse()
	b, err := os.ReadFile(*file)
	if err != nil {
		log.Fatal(err)
	}
	var data importer.Export
	if err = json.Unmarshal(b, &data); err != nil {
		log.Fatal(err)
	}
	if err = data.Validate(); err != nil {
		log.Fatal(err)
	}
	for _, m := range data.Media {
		if *mediaDir == "" {
			log.Fatal("media-dir required for media manifest")
		}
		root, e := filepath.EvalSymlinks(*mediaDir)
		if e != nil {
			log.Fatal(e)
		}
		path := filepath.Join(root, m.ObjectKey)
		path, e = filepath.EvalSymlinks(path)
		if e != nil {
			log.Fatal(e)
		}
		rel, e := filepath.Rel(root, path)
		if e != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			log.Fatalf("media path leaves media-dir: %s", m.ID)
		}
		st, e := os.Stat(path)
		if e != nil || st.Size() != m.Size {
			log.Fatalf("missing/size mismatch: %s", m.ID)
		}
	}
	fmt.Printf("Validated %d users, %d posts, %d media; apply=%t\n", len(data.Users), len(data.Tweets), len(data.Media), *apply)
	if !*apply {
		return
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err = database.Migrate(ctx, db); err != nil {
		log.Fatal(err)
	}
	a, err := app.New(db)
	if err != nil {
		log.Fatal(err)
	}
	for _, m := range data.Media {
		_, err = a.S3.FPutObject(ctx, a.Bucket, m.ObjectKey, filepath.Join(*mediaDir, m.ObjectKey), minio.PutObjectOptions{ContentType: m.ContentType})
		if err != nil {
			log.Fatal(err)
		}
	}
	if err = data.Apply(ctx, db); err != nil {
		log.Fatal(err)
	}
	fmt.Println("Import committed. Existing rows were retained; password hashes and admin privileges were not imported.")
}
