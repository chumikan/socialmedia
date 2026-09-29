# Firebase → Go / PostgreSQL migration

## Inventory (before migration)
- Next.js Pages Router / React / TypeScript: home, profiles, replies, media, likes, follows, bookmarks, explore, notifications, messages.
- `src/lib/firebase/{app,collections,utils}.ts`: Auth, Firestore, Storage and Functions SDK initialization, direct writes, counters and uploads.
- `src/lib/context/auth-context.tsx`: email/password and Google authentication, client-created profiles/stats; administrator inferred from username.
- `src/lib/hooks/use{Collection,Document,ArrayDocument,InfiniteScroll}` plus page/component imports: snapshots, filters and growing-limit pagination.
- Collections: users, tweets, users/*/stats, users/*/bookmarks, trends, notifications, conversations, messages. Timestamp objects, embedded media and arrays of follower/like/repost IDs.
- `functions/src/normalize-stats.ts`: cleanup after tweet deletion. `notify-email.ts`: Gmail new-post notification.
- Firestore rules include a catch-all authenticated read/write grant; DM privacy and administrator authority must be enforced by the API instead. Storage: authenticated media reads, owner uploads, 50 MiB limit. Fixed administrator UID in rules.
- Socket.IO API verifies Firebase token; online presence UI currently returns a placeholder. No actual Realtime Database calls found.
- Jest configured but no test files found; CI test step commented out. CI assumes root npm project despite yarn lockfile.
- Original Firebase implementation/configuration archived under `docs/legacy/firebase/` for offline reference only. Existing root .env files are excluded from new service builds.

## Architecture and stages
1. Preserve existing UI and move Next.js to frontend; add a single Go HTTP service in backend.
2. PostgreSQL normalized foreign-key tables and transactional writes; pgx driver; bcrypt passwords; SCS server-side PostgreSQL sessions, HttpOnly cookies, same-origin mutation guard.
3. Connect authentication, posts, follow relationships and chronological feed first.
4. Connect interactions, profiles, search/trends, notifications, DM, moderation and S3 media. Keep legacy read-view shapes through a typed local query adapter; no Firebase SDK or Firebase transport at runtime.
5. Offline JSON import, Compose, CI, integration and UI verification. Record any gaps explicitly.

## Feature mapping
| Feature | Existing implementation | New API | PostgreSQL | Status |
|---|---|---|---|---|
| Auth | auth-context / Firebase Auth | /api/v1/auth/* | users, sessions | implemented; DB/API tests |
| Posts/replies/feed | input, home, profile pages | /api/v1/posts; /api/v1/query (feed) | posts, post_media | implemented; DB/API tests |
| Follow | firebase/utils | /api/v1/users/{id}/follow | follows | implemented; DB/API tests |
| Likes/reposts | firebase/utils | /api/v1/posts/{id}/{like,repost} | likes, reposts | implemented; DB/API tests |
| Bookmarks | bookmarks page / user subcollection | /api/v1/posts/{id}/bookmark; /api/v1/bookmarks | bookmarks | implemented; DB/API tests |
| Profile/theme/pin | user-edit-profile, utils | PATCH /api/v1/users/{id} | users | implemented; DB/API tests |
| Search/trends | explore, aside-trends, input | /api/v1/query | users, posts, post_tags | implemented; DB/API tests |
| Notifications | aside-notifications | /api/v1/query; PATCH /api/v1/notifications/{id} | notifications | implemented; DB/API tests |
| DM | message pages, user-home-layout | /api/v1/conversations; /api/v1/messages | conversations, messages | implemented; DB/API tests |
| BAN | isBanned / UI-only guard | /api/v1/users/{id}/ban | users, moderation_events | implemented; DB/API tests |
| Media | Firebase Storage upload | /api/v1/media | media + private S3 bucket | implemented; DB/API tests |
| Deletion cleanup | normalizeStats function | DELETE /api/v1/posts/{id} + FK cascade | related tables | implemented; DB/API tests |
| New-post email | notifyEmail function | transactional outbox / SMTP | outbox | implemented; external integration unverified |
| Google sign-in | Firebase popup | Google OIDC | oauth_identities | implemented; external integration unverified |
| Presence | Socket.IO placeholder | authenticated polling | sessions | implemented; external integration unverified |

No production data access. Import only user-provided exports; never reuse Firebase password hashes as bcrypt hashes. No federation or Rust; versioned API and outbox allow independent workers later.

## Implementation evidence and remaining differences
- Go API and browser use SCS PostgreSQL sessions, bcrypt and same-origin cookies; no Firebase package or network calls remain in `frontend/src` or `backend`.
- Database schema and targeted indexes are in `backend/migrations`. API contract and generated UI transport types are in `docs/api-contract.md` and `frontend/src/lib/api/contracts.ts`.
- JSON import supports Firestore-style document JSON and Firebase Auth metadata after offline export conversion. It does not parse Firestore's managed binary export directly. Password hashes must be reset individually; no production data was accessed.
- The optional Google OIDC flow and SMTP relay are implemented but require external credentials/services to validate live. Apple/phone authentication were never implemented in the source UI and stay disabled.
- The read views preserve legacy field names and use polling. Their aggregate arrays and counts are computed per request; large deployments should replace these projections with targeted SQL read models. Full-text search uses PostgreSQL's `simple` tokenizer, without Japanese word segmentation.
- The legacy "online" socket handler only emitted one authenticated user's ID; it has been replaced by authenticated activity polling. This changes presence latency to up to 30 seconds.
- Local Compose storage is single-node SeaweedFS. Production should use managed/replicated S3-compatible storage, HTTPS, backups and ingress rate limits.
- Email outbox SMTP delivery is at least once. A crash after sending and before marking delivery may send a duplicate email.
