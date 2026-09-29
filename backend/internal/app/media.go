package app

import (
	"bytes"
	"github.com/minio/minio-go/v7"
	"io"
	"net/http"
	"strings"
)

func allowedMedia(t string) bool {
	switch t {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime":
		return true
	}
	return false
}
func (a *App) upload(w http.ResponseWriter, r *http.Request) error {
	uid, err := a.actor(r)
	if err != nil {
		return err
	}
	r.Body = http.MaxBytesReader(w, r.Body, 51<<20)
	if err = r.ParseMultipartForm(1 << 20); err != nil {
		return bad("file too large or invalid multipart form")
	}
	defer r.MultipartForm.RemoveAll()
	f, h, err := r.FormFile("file")
	if err != nil {
		return bad("file required")
	}
	defer f.Close()
	if h.Size <= 0 || h.Size > 50<<20 {
		return bad("file must be 1 byte to 50 MiB")
	}
	head := make([]byte, 512)
	n, err := io.ReadFull(f, head)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return err
	}
	head = head[:n]
	mime := http.DetectContentType(head)
	if mime == "application/octet-stream" && len(head) > 12 && string(head[4:8]) == "ftyp" {
		mime = "video/mp4"
	}
	if mime == "video/webm" || mime == "application/octet-stream" {
		if bytes.HasPrefix(head, []byte{0x1a, 0x45, 0xdf, 0xa3}) {
			mime = "video/webm"
		}
	}
	if !allowedMedia(mime) {
		return bad("unsupported media content")
	}
	mid := id()
	key := uid + "/" + mid
	_, err = a.S3.PutObject(r.Context(), a.Bucket, key, io.MultiReader(bytes.NewReader(head), f), h.Size, minio.PutObjectOptions{ContentType: mime})
	if err != nil {
		return err
	}
	alt := h.Filename
	if len(alt) > 255 {
		alt = alt[:255]
	}
	tag, err := a.DB.Exec(r.Context(), "INSERT INTO media(id,owner_id,object_key,content_type,size,alt) SELECT $1,id,$3,$4,$5,$6 FROM users WHERE id=$2 AND NOT is_banned", mid, uid, key, mime, h.Size, alt)
	if err == nil && tag.RowsAffected() != 1 {
		err = forbidden()
	}
	if err != nil {
		_ = a.S3.RemoveObject(r.Context(), a.Bucket, key, minio.RemoveObjectOptions{})
		return err
	}
	return respond(w, map[string]string{"id": mid, "src": "/api/v1/media/" + mid, "type": mime, "alt": alt})
}
func (a *App) media(w http.ResponseWriter, r *http.Request) error {
	uid, err := a.actor(r)
	if err != nil {
		return err
	}
	var key, mime string
	err = a.DB.QueryRow(r.Context(), `SELECT object_key,content_type FROM media m JOIN users u ON u.id=m.owner_id WHERE m.id=$1 AND NOT u.is_banned AND (m.owner_id=$2 OR EXISTS(SELECT 1 FROM post_media pm WHERE pm.media_id=m.id) OR u.photo_url='/api/v1/media/'||m.id OR u.cover_photo_url='/api/v1/media/'||m.id)`, r.PathValue("id"), uid).Scan(&key, &mime)
	if err != nil {
		return err
	}
	obj, err := a.S3.GetObject(r.Context(), a.Bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return err
	}
	defer obj.Close()
	stat, err := obj.Stat()
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Disposition", "inline")
	http.ServeContent(w, r, strings.ReplaceAll(key, "/", "_"), stat.LastModified, obj)
	return nil
}
