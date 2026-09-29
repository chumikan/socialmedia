CREATE TABLE users (
    id text PRIMARY KEY,
    email text UNIQUE NOT NULL,
    password_hash text,
    username text NOT NULL,
    name text NOT NULL CHECK (
        length(name) BETWEEN 1
        AND 50
    ),
    bio text CHECK (length(bio) <= 160),
    website text,
    location text,
    photo_url text NOT NULL DEFAULT '/assets/default-avatar.png',
    cover_photo_url text,
    theme text,
    accent text,
    verified boolean NOT NULL DEFAULT false,
    is_admin boolean NOT NULL DEFAULT false,
    is_banned boolean NOT NULL DEFAULT false,
    pinned_post_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_username_unique ON users(lower(username));

CREATE INDEX users_username_search ON users(lower(username) text_pattern_ops);

CREATE TABLE sessions(
    token text PRIMARY KEY,
    data bytea NOT NULL,
    expiry timestamptz NOT NULL
);

CREATE INDEX sessions_expiry ON sessions(expiry);

CREATE TABLE follows (
    follower_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    followed_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(follower_id, followed_id),
    CHECK(follower_id <> followed_id)
);

CREATE INDEX follows_reverse ON follows(followed_id, follower_id);

CREATE TABLE posts (
    id text PRIMARY KEY,
    author_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    text text CHECK(length(text) <= 280),
    parent_id text REFERENCES posts ON DELETE
    SET
        NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz
);

ALTER TABLE
    users
ADD
    CONSTRAINT users_pin_fk FOREIGN KEY(pinned_post_id) REFERENCES posts ON DELETE
SET
    NULL;

CREATE INDEX posts_feed ON posts(created_at DESC, id DESC);

CREATE INDEX posts_author_feed ON posts(author_id, created_at DESC, id DESC);

CREATE INDEX posts_replies ON posts(parent_id, created_at DESC, id DESC);

CREATE TABLE media (
    id text PRIMARY KEY,
    owner_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    object_key text UNIQUE NOT NULL,
    content_type text NOT NULL,
    size bigint NOT NULL CHECK(
        size > 0
        AND size <= 52428800
    ),
    alt text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX media_owner ON media(owner_id);

CREATE TABLE post_media(
    post_id text REFERENCES posts ON DELETE CASCADE,
    media_id text REFERENCES media,
    position int NOT NULL CHECK(
        position BETWEEN 0
        AND 3
    ),
    PRIMARY KEY(post_id, media_id),
    UNIQUE(post_id, position)
);

CREATE TABLE likes(
    user_id text REFERENCES users ON DELETE CASCADE,
    post_id text REFERENCES posts ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, post_id)
);

CREATE INDEX likes_post ON likes(post_id);

CREATE TABLE reposts(LIKE likes INCLUDING ALL);

ALTER TABLE
    reposts
ADD
    FOREIGN KEY(user_id) REFERENCES users ON DELETE CASCADE;

ALTER TABLE
    reposts
ADD
    FOREIGN KEY(post_id) REFERENCES posts ON DELETE CASCADE;

CREATE TABLE bookmarks(LIKE likes INCLUDING ALL);

ALTER TABLE
    bookmarks
ADD
    FOREIGN KEY(user_id) REFERENCES users ON DELETE CASCADE;

ALTER TABLE
    bookmarks
ADD
    FOREIGN KEY(post_id) REFERENCES posts ON DELETE CASCADE;

CREATE INDEX bookmarks_user_time ON bookmarks(user_id, created_at DESC, post_id DESC);

CREATE TABLE post_tags(
    post_id text REFERENCES posts ON DELETE CASCADE,
    tag text NOT NULL,
    PRIMARY KEY(post_id, tag)
);

CREATE INDEX post_tags_tag ON post_tags(tag);

CREATE TABLE conversations (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    target_user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(user_id <> target_user_id)
);

CREATE UNIQUE INDEX conversations_pair ON conversations(
    least(user_id, target_user_id),
    greatest(user_id, target_user_id)
);

CREATE INDEX conversations_user ON conversations(user_id, updated_at DESC, id);

CREATE INDEX conversations_target ON conversations(target_user_id, updated_at DESC, id);

CREATE TABLE messages(
    id text PRIMARY KEY,
    conversation_id text NOT NULL REFERENCES conversations ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users,
    text text NOT NULL CHECK(
        length(text) BETWEEN 1
        AND 4000
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE INDEX messages_conversation ON messages(conversation_id, created_at DESC, id DESC);

CREATE TABLE notifications(
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    target_user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    type text NOT NULL,
    post_id text REFERENCES posts ON DELETE CASCADE,
    is_checked boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE INDEX notifications_recipient ON notifications(target_user_id, created_at DESC, id DESC);

CREATE INDEX notifications_unread ON notifications(target_user_id)
WHERE
    NOT is_checked;

CREATE TABLE moderation_events(
    id bigserial PRIMARY KEY,
    actor_id text REFERENCES users,
    target_id text REFERENCES users,
    banned boolean NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox(
    id bigserial PRIMARY KEY,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz
);

CREATE INDEX outbox_pending ON outbox(id)
WHERE
    delivered_at IS NULL;

CREATE TABLE oauth_identities(
    provider text NOT NULL,
    subject text NOT NULL,
    user_id text REFERENCES users ON DELETE CASCADE,
    PRIMARY KEY(provider, subject)
);

CREATE VIEW user_documents AS
SELECT
    u.id,
    jsonb_build_object(
        'id',
        u.id,
        'username',
        u.username,
        'name',
        u.name,
        'bio',
        u.bio,
        'website',
        u.website,
        'location',
        u.location,
        'photoURL',
        u.photo_url,
        'coverPhotoURL',
        u.cover_photo_url,
        'theme',
        u.theme,
        'accent',
        u.accent,
        'verified',
        u.verified,
        'isBanned',
        u.is_banned,
        'isAdmin',
        u.is_admin,
        'pinnedTweet',
        u.pinned_post_id,
        'createdAt',
        u.created_at,
        'updatedAt',
        u.updated_at,
        'following',
        coalesce(
            (
                SELECT
                    jsonb_agg(
                        followed_id
                        ORDER BY
                            followed_id
                    )
                FROM
                    follows
                WHERE
                    follower_id = u.id
            ),
            '[]'
        ),
        'followers',
        coalesce(
            (
                SELECT
                    jsonb_agg(
                        follower_id
                        ORDER BY
                            follower_id
                    )
                FROM
                    follows
                WHERE
                    followed_id = u.id
            ),
            '[]'
        ),
        'totalTweets',
(
            SELECT
                count(*)
            FROM
                posts
            WHERE
                author_id = u.id
        ),
        'totalPhotos',
(
            SELECT
                count(DISTINCT p.id)
            FROM
                posts p
                JOIN post_media m ON m.post_id = p.id
            WHERE
                p.author_id = u.id
        )
    ) AS data
FROM
    users u;

CREATE VIEW post_documents AS
SELECT
    p.id,
    p.author_id,
    p.created_at,
    jsonb_build_object(
        'id',
        p.id,
        'text',
        p.text,
        'createdBy',
        p.author_id,
        'createdAt',
        p.created_at,
        'updatedAt',
        p.updated_at,
        'parent',
(
            SELECT
                jsonb_build_object('id', pp.id, 'username', u.username)
            FROM
                posts pp
                JOIN users u ON u.id = pp.author_id
            WHERE
                pp.id = p.parent_id
        ),
        'userLikes',
        coalesce(
            (
                SELECT
                    jsonb_agg(
                        user_id
                        ORDER BY
                            user_id
                    )
                FROM
                    likes
                WHERE
                    post_id = p.id
            ),
            '[]'
        ),
        'userRetweets',
        coalesce(
            (
                SELECT
                    jsonb_agg(
                        user_id
                        ORDER BY
                            user_id
                    )
                FROM
                    reposts
                WHERE
                    post_id = p.id
            ),
            '[]'
        ),
        'userReplies',
(
            SELECT
                count(*)
            FROM
                posts
            WHERE
                parent_id = p.id
        ),
        'images',
(
            SELECT
                jsonb_agg(
                    jsonb_build_object(
                        'id',
                        m.id,
                        'src',
                        '/api/v1/media/' || m.id,
                        'alt',
                        m.alt,
                        'type',
                        m.content_type
                    )
                    ORDER BY
                        pm.position
                )
            FROM
                post_media pm
                JOIN media m ON m.id = pm.media_id
            WHERE
                pm.post_id = p.id
        )
    ) AS data
FROM
    posts p
    JOIN users u ON u.id = p.author_id
WHERE
    NOT u.is_banned;

CREATE VIEW conversation_documents AS
SELECT
    c.id,
    c.user_id,
    c.target_user_id,
    jsonb_build_object(
        'id',
        c.id,
        'userId',
        c.user_id,
        'targetUserId',
        c.target_user_id,
        'createdAt',
        c.created_at,
        'updatedAt',
        c.updated_at
    ) AS data
FROM
    conversations c;

CREATE VIEW message_documents AS
SELECT
    m.id,
    c.user_id AS participant_a,
    c.target_user_id AS participant_b,
    jsonb_build_object(
        'id',
        m.id,
        'userId',
        m.user_id,
        'conversationId',
        m.conversation_id,
        'text',
        m.text,
        'createdAt',
        m.created_at,
        'updatedAt',
        m.updated_at
    ) AS data
FROM
    messages m
    JOIN conversations c ON c.id = m.conversation_id;

CREATE VIEW notification_documents AS
SELECT
    n.id,
    n.target_user_id,
    jsonb_build_object(
        'id',
        n.id,
        'userId',
        n.user_id,
        'targetUserId',
        n.target_user_id,
        'type',
        n.type,
        'postId',
        n.post_id,
        'isChecked',
        n.is_checked,
        'createdAt',
        n.created_at,
        'updatedAt',
        n.updated_at
    ) AS data
FROM
    notifications n;

CREATE VIEW trend_documents AS
SELECT
    t.tag AS id,
    jsonb_build_object(
        'id',
        t.tag,
        'text',
        t.tag,
        'counter',
        count(*),
        'createdBy',
        min(p.author_id),
        'createdAt',
        max(p.created_at),
        'updatedAt',
        max(p.created_at),
        'parent',
        null
    ) AS data
FROM
    post_tags t
    JOIN posts p ON p.id = t.post_id
    JOIN users u ON u.id = p.author_id
WHERE
    NOT u.is_banned
    AND p.created_at > now() - interval '7 days'
GROUP BY
    t.tag;