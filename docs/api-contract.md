# SNS API v1

Base path: `/api/v1`. The Next.js server proxies this path to the Go service; browsers use the same origin. JSON responses use camelCase, string IDs and RFC3339 timestamps. Dates are hydrated into local UI date values in `frontend/src/lib/api/query.ts`. Firebase SDKs are not involved.

## Authentication and errors

`POST /auth/register` and `/auth/login`: `{email,password}`. Register requires a valid email and a 12–72 byte password; bcrypt cost 12. Success returns UserDTO and an HttpOnly, SameSite=Lax SCS session cookie. Sessions live in PostgreSQL, expire after seven days or 24 hours of inactivity, rotate on login, and are destroyed on logout. Production must set COOKIE_SECURE=true with HTTPS.

`GET /auth/me`: UserDTO. `POST /auth/logout`: `{ok:true}`. Google OIDC: `GET /auth/google` → Google → `/auth/google/callback`, verified issuer/audience/signature/nonce/state. No automatic linking by email to an existing account.

Every mutation, including the read-only POST query endpoint, requires `X-SNS-Request: 1`. If Origin is supplied it must equal APP_ORIGIN. There is no cross-origin CORS grant. IDs and roles come from the server session. Auth endpoints are throttled in PostgreSQL. The direct peer IP is used; configure a dedicated ingress rate limiter before high-traffic deployment (the Next proxy shares a backend peer).

Errors: `{error:string}` with 400 validation, 401 missing/expired/revoked session, 403 authorization/BAN, 404 missing or inaccessible resource, 409 conflict, 429 rate limit, 500 internal error. Internal SQL details are logged only on the server. Do not infer resource existence from 403 vs 404.

## Writes

| Method / route | Body | Authorization / semantics |
|---|---|---|
| POST /posts | `{text,parentId: string|null,mediaIds:string[]}` | Current user; 280 Unicode characters, 0–4 owned media; text or media required. Reply, tags and outbox in one transaction. Returns `{id}`. |
| DELETE /posts/{id} | none | Author or admin. Interactions, bookmarks and tag links cascade; replies survive with null parent. |
| PUT / DELETE /posts/{id}/like | none | Current user; idempotent unique relation; first insertion notifies author. |
| PUT / DELETE /posts/{id}/repost | none | Current user; idempotent unique relation. |
| PUT / DELETE /posts/{id}/bookmark | none | Current user; private relation. |
| DELETE /bookmarks | none | Clears current user's bookmarks. |
| PUT / DELETE /users/{id}/follow | none | Current user; self-follow and banned targets rejected. |
| PATCH /users/{id} | Subset of `name,bio,website,location,username,photoURL,coverPhotoURL,theme,accent,pinnedPost` | Owner or admin. No role/verified/BAN fields. Pin must belong to profile owner. Media must be owned by actor. |
| PUT /users/{id}/ban | `{banned:boolean,reason:string}` | Admin only, cannot target self or another admin. Audit row; session version increments. |
| PATCH /notifications/{id} | `{isChecked:boolean}` | Recipient only. |
| POST /media | multipart `file` | Authenticated, non-banned; 1 byte–50 MiB; content sniffed JPEG/PNG/GIF/WebP/MP4/WebM/QuickTime. Stores metadata in PostgreSQL, bytes in private S3. Returns MediaDTO. |

`GET /media/{id}` serves bytes with range support for video. An unbound upload is visible only to its owner; published post/profile media is visible to signed-in users. Files from banned owners are hidden. URLs remain same-origin so private cookies never go to S3. SVG/HTML are rejected.

## Read views and pagination

`POST /query`:

```json
{"collection":"feed","constraints":[{"kind":"where","field":"parent","op":"==","value":null},{"kind":"order","field":"createdAt","op":"desc"}],"limit":20,"cursor":""}
```

Returns `{items: DTO[],nextCursor:string}`. Maximum page size 100, default 50. A nonempty nextCursor is passed verbatim for the next page with the same collection and constraints. Keyset pagination uses ordered values plus a stable ID tie-breaker; insertion at the head does not shift later pages. Ordering by mutable values (e.g. user updatedAt) is not a transaction snapshot. The client deduplicates IDs. `{count:true}` returns `{count:number}`.

Allowed collections: `users`, `posts`, `feed`, `trends`, `notifications`, `users/{id}/bookmarks`, `users/{id}/stats`. Each has a field allowlist in query.go; no SQL, table names or writes are accepted. Filters: `==`, `!=`, comparisons, `array-contains`; order: asc/desc; start/end bounds for username prefix search. `where text search` uses PostgreSQL simple full-text search with a GIN index. Japanese morphological tokenization is not included.

Feed = own/followed users' posts plus posts reposted by followed users, newest original post first; one entry per post. Client can exclude replies. Banned authors' posts are always excluded. Follow/like/repost arrays are compatibility projections over normalized relationship tables, not authoritative client-writable arrays.

Notifications are restricted to the recipient. Other users' bookmark paths are rejected. Public user views never include email, password hash or session data.

`GET /presence` records current user's activity and returns up to 100 recently active IDs. Changes are refreshed with polling; no Socket.IO or Firebase listener connection remains.

## Types and versioning

`backend/internal/app/contracts.go` and exported input structs are the transport source. Generate TypeScript:

```sh
cd backend
go run ./cmd/contracts > ../frontend/src/lib/api/contracts.ts
```

User and post UI types derive from generated DTOs, replacing only transport date/media presentation fields. CI compares generated output byte-for-byte. Integration tests exercise SQL projections and serialized field types. Breaking changes require a new API version or a coordinated DTO regeneration.

## Extension boundary

The API is one Go service, split into auth, posts, users, notifications, query and media files. PostgreSQL outbox events are committed with post writes. SMTP delivery is an optional at-least-once worker using a trusted SMTP relay; events remain pending when unconfigured. Future ranking jobs can consume versioned events/SQL read models in a separate process without rewriting frontend mutations. No federation protocols or Rust application code are introduced.
