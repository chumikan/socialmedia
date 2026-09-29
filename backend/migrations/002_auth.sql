ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
CREATE INDEX users_presence ON users(last_seen_at) WHERE NOT is_banned;
CREATE TABLE auth_attempts(key text NOT NULL,window_start timestamptz NOT NULL,attempts int NOT NULL,PRIMARY KEY(key,window_start));
