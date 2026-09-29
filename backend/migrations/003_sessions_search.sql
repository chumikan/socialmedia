ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
CREATE INDEX posts_text_search ON posts USING gin(to_tsvector('simple',coalesce(text,'')));
