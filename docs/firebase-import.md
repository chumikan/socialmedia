# Offline Firebase import

The importer never calls Firebase, Google Cloud or external image URLs. It reads an already exported JSON bundle and local media files. Run against a new local/staging database first. Back up PostgreSQL and S3 before importing into an existing deployment.

## Input

See `docs/fixtures/firebase-export.json` for a complete small example. Top-level arrays are `users`, `tweets`, `conversations`, `messages`, `notifications`, `authUsers`, `media`; `bookmarks` maps user IDs to bookmark arrays. Each Firestore document must include its document ID as `id`. Preserve original field names and UID references. `createdAt` accepts RFC3339 or `{seconds,nanoseconds}` / `{_seconds,_nanoseconds}`. Embedded `images` reference media manifest IDs.

Firebase Auth JSON exports can supply `authUsers` entries with `localId`, `email`, and `providerUserInfo`. Google `rawId` is imported into oauth_identities. Password hashes and administrator privileges are deliberately not imported: Firebase scrypt hashes are not bcrypt hashes. Stats and trends are rebuilt from posts/relationships. `following` is the canonical source for follows; reconcile inconsistent old follower arrays before import.

A managed Firestore binary export / emulator export directory is **not** this JSON format. First convert it offline in an isolated export/emulator environment you control; this repository's importer does not decode Google's binary format or connect to a live Firebase project. Object-map exports can be transformed to document arrays by attaching map keys as IDs. Inspect record counts and dangling references before applying.

A media manifest entry:

```json
{"id":"old-image-id","ownerId":"legacy-a","objectKey":"legacy-a/old-image-id","contentType":"image/png","size":1234,"alt":"photo.png","legacyURL":"https://old-storage-url"}
```

Store the corresponding file at `<media-dir>/legacy-a/old-image-id`. Original post image IDs must match manifest IDs. Profile photo/cover URLs are rewritten through `legacyURL`; unmapped profile images fall back to the default avatar / no cover, so include all profile assets if they must be retained. URLs are never downloaded automatically.

## Run

Set DATABASE_URL and S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET using your secret manager or local environment. For Compose host connections, PostgreSQL defaults to localhost:5433 and S3 to localhost:9000.

```sh
cd backend
# No database or S3 connection; validates JSON and referenced local file sizes.
go run ./cmd/import-firebase -file ../exports/export.json -media-dir ../exports/media
# Explicit apply uploads local bytes, then commits DB changes transactionally.
go run ./cmd/import-firebase -file ../exports/export.json -media-dir ../exports/media -apply
```

Stable IDs and ON CONFLICT make a repeated import idempotent. Existing rows are retained; this is not a bidirectional sync. Do not mix unrelated exports sharing IDs. DB failure rolls back the database transaction; S3 objects uploaded before that failure can remain and be reused on retry. Missing references fail the transaction rather than being silently dropped. Duplicate conversation pairs with different IDs must be reconciled in the export first. Import does not enqueue historical email notifications.

After import, compare counts, sample user profiles, follows, posts/replies, media, bookmarks and private conversations. Run the same export twice in staging to confirm idempotency. Only switch frontend traffic after this validation and a rollback snapshot.

For email/password users, establish identity through your account recovery process, then set a new password through the administrative CLI. Do not use a common default password:

```sh
# Provide the individual password via a protected stdin stream, never argv.
go run ./cmd/user -email user@example.com -password-stdin < /path/to/protected-password-file
```

This changes the bcrypt hash and revokes prior sessions. Google accounts with imported provider IDs can use configured Google OIDC. Users missing exported email addresses receive a non-deliverable `<UID>@import.invalid` address and need operator reconciliation.
