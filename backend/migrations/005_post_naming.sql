-- Align document keys with the post API without modifying stored rows.
CREATE OR REPLACE VIEW user_documents AS
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
        'pinnedPost',
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
        'totalPosts',
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

CREATE OR REPLACE VIEW post_documents AS
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
        'userReposts',
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

