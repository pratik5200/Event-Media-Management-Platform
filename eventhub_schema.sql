--  EventHub.io — Event & Media Management Platform
--  Database Schema (PostgreSQL / Neon Serverless)
--  EXTENSION: pgcrypto for UUID generation

CREATE EXTENSION IF NOT EXISTS pgcrypto;


--  TABLE: users
--  Core identity table. Every record is a registered account.

CREATE TABLE users (
    id                  SERIAL          PRIMARY KEY,
    email               VARCHAR(255)    NOT NULL UNIQUE,
    hashed_password     VARCHAR(255)    NOT NULL,
    full_name           VARCHAR(150),
    avatar_url          TEXT,                              
    role                VARCHAR(30)     NOT NULL DEFAULT 'member',
                                                           
    is_verified         BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email       ON users (email);
CREATE INDEX idx_users_role        ON users (role);
CREATE INDEX idx_users_is_active   ON users (is_active);

COMMENT ON TABLE  users                  IS 'Registered user accounts for EventHub.io';
COMMENT ON COLUMN users.role             IS 'admin = platform super-user; organiser = can create events; member = attendee-only';
COMMENT ON COLUMN users.hashed_password  IS 'bcrypt hash – never store plaintext passwords';
COMMENT ON COLUMN users.avatar_url       IS 'Temporary presigned S3 URL refreshed on each profile load';


--  TABLE: otp_verification
--  Short-lived One-Time Password records for email MFA.
CREATE TABLE otp_verification (
    id          SERIAL          PRIMARY KEY,
    email       VARCHAR(255)    NOT NULL,
    otp_code    CHAR(6)         NOT NULL,
    expires_at  TIMESTAMPTZ     NOT NULL,
    is_used     SMALLINT        NOT NULL DEFAULT 0,        -- 0 = unused | 1 = used
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_email    ON otp_verification (email);
CREATE INDEX idx_otp_expires  ON otp_verification (expires_at);

COMMENT ON TABLE  otp_verification          IS 'Temporary OTP codes emailed via Google Apps Script proxy';
COMMENT ON COLUMN otp_verification.is_used  IS '0 = still valid; 1 = consumed (prevents replay attacks)';
COMMENT ON COLUMN otp_verification.expires_at IS 'Set to NOW() + 5 minutes at insert time using datetime.utcnow()';


--  TABLE: events
--  A single organised event — conference, concert, meetup, etc.

CREATE TABLE events (
    id              SERIAL          PRIMARY KEY,
    title           VARCHAR(255)    NOT NULL,
    description     TEXT,
    location        VARCHAR(255),
    venue_lat       DECIMAL(9,6),                         
    venue_lng       DECIMAL(9,6),
    starts_at       TIMESTAMPTZ     NOT NULL,
    ends_at         TIMESTAMPTZ     NOT NULL,
    capacity        INTEGER         DEFAULT NULL,           
    is_public       BOOLEAN         NOT NULL DEFAULT TRUE,
    status          VARCHAR(30)     NOT NULL DEFAULT 'draft',
                                                           
    cover_image_url TEXT,                                  
    organiser_id    INTEGER         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_organiser  ON events (organiser_id);
CREATE INDEX idx_events_status     ON events (status);
CREATE INDEX idx_events_starts_at  ON events (starts_at);
CREATE INDEX idx_events_is_public  ON events (is_public);

COMMENT ON TABLE  events               IS 'Master record for every event on the platform';
COMMENT ON COLUMN events.status        IS 'Lifecycle state machine: draft → published → completed | cancelled';
COMMENT ON COLUMN events.organiser_id  IS 'FK to users.id – the account that created and manages this event';


--  TABLE: event_registrations

CREATE TABLE event_registrations (
    id              SERIAL          PRIMARY KEY,
    event_id        INTEGER         NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    user_id         INTEGER         NOT NULL REFERENCES users  (id) ON DELETE CASCADE,
    status          VARCHAR(30)     NOT NULL DEFAULT 'registered',
                                                           
    registered_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)                             
);

CREATE INDEX idx_reg_event   ON event_registrations (event_id);
CREATE INDEX idx_reg_user    ON event_registrations (user_id);
CREATE INDEX idx_reg_status  ON event_registrations (status);

COMMENT ON TABLE  event_registrations         IS 'Attendee sign-ups per event';
COMMENT ON COLUMN event_registrations.status  IS 'registered = confirmed; waitlisted = over capacity; attended = physically checked in';


--  TABLE: media_folders
--  Logical folder/album to group media files by event or theme.

CREATE TABLE media_folders (
    id          SERIAL          PRIMARY KEY,
    name        VARCHAR(150)    NOT NULL,
    description TEXT,
    event_id    INTEGER         REFERENCES events (id) ON DELETE SET NULL,
    owner_id    INTEGER         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_folders_event  ON media_folders (event_id);
CREATE INDEX idx_folders_owner  ON media_folders (owner_id);

COMMENT ON TABLE  media_folders           IS 'Named albums grouping media uploads; optionally linked to an event';
COMMENT ON COLUMN media_folders.event_id  IS 'Optional FK – NULL if folder is not tied to a specific event';



--  TABLE: media
--  Individual uploaded file (image/video) stored in AWS S3.

CREATE TABLE media (
    id              SERIAL          PRIMARY KEY,
    filename        VARCHAR(255)    NOT NULL,              
    s3_key          VARCHAR(512)    NOT NULL UNIQUE,       
    s3_url          TEXT            NOT NULL,              
    content_type    VARCHAR(100)    NOT NULL,              
    file_size_bytes BIGINT,
    width_px        INTEGER,                               
    height_px       INTEGER,                               
    duration_secs   INTEGER,                              
    ai_tags         TEXT            NOT NULL DEFAULT '',   
    caption         TEXT,
    is_public       BOOLEAN         NOT NULL DEFAULT FALSE,
    folder_id       INTEGER         REFERENCES media_folders (id) ON DELETE SET NULL,
    uploader_id     INTEGER         NOT NULL REFERENCES users  (id) ON DELETE CASCADE,
    uploaded_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_uploader  ON media (uploader_id);
CREATE INDEX idx_media_folder    ON media (folder_id);
CREATE INDEX idx_media_ai_tags   ON media USING GIN (to_tsvector('english', ai_tags));
CREATE INDEX idx_media_public    ON media (is_public);

COMMENT ON TABLE  media           IS 'Every uploaded media file – images and videos stored in AWS S3';
COMMENT ON COLUMN media.s3_key    IS 'Format: {uuid}_{original_filename}; used to generate presigned URLs';
COMMENT ON COLUMN media.ai_tags   IS 'Comma-separated strings e.g. "outdoor,crowd,stage"; searchable via ilike or GIN index';
COMMENT ON COLUMN media.s3_url    IS 'Do NOT expose directly; always serve via generate_presigned_url()';


--  TABLE: media_likes

CREATE TABLE media_likes (
    id          SERIAL      PRIMARY KEY,
    media_id    INTEGER     NOT NULL REFERENCES media (id) ON DELETE CASCADE,
    user_id     INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    liked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (media_id, user_id)
);

CREATE INDEX idx_likes_media  ON media_likes (media_id);
CREATE INDEX idx_likes_user   ON media_likes (user_id);

COMMENT ON TABLE media_likes IS 'Heart/like reactions on individual media items; one per user per item';


--  TABLE: comments

CREATE TABLE comments (
    id          SERIAL          PRIMARY KEY,
    media_id    INTEGER         NOT NULL REFERENCES media    (id) ON DELETE CASCADE,
    author_id   INTEGER         NOT NULL REFERENCES users    (id) ON DELETE CASCADE,
    parent_id   INTEGER                  REFERENCES comments (id) ON DELETE CASCADE,
                                                           
    body        TEXT            NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_media   ON comments (media_id);
CREATE INDEX idx_comments_author  ON comments (author_id);
CREATE INDEX idx_comments_parent  ON comments (parent_id);

COMMENT ON TABLE  comments           IS 'Threaded comment system on media items';
COMMENT ON COLUMN comments.parent_id IS 'Self-referencing FK for replies; NULL indicates a root-level comment';

--  TABLE: notifications
--  System and activity notifications delivered via WebSocket.

CREATE TABLE notifications (
    id          SERIAL          PRIMARY KEY,
    recipient_id INTEGER        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type        VARCHAR(60)     NOT NULL,
                                                         
    title       VARCHAR(255)    NOT NULL,
    message     TEXT,
    is_read     BOOLEAN         NOT NULL DEFAULT FALSE,
    payload     JSONB,                                     -- Optional metadata (e.g. {"media_id": 42})
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_recipient  ON notifications (recipient_id);
CREATE INDEX idx_notif_is_read    ON notifications (is_read);
CREATE INDEX idx_notif_type       ON notifications (type);
CREATE INDEX idx_notif_payload    ON notifications USING GIN (payload);

COMMENT ON TABLE  notifications           IS 'Activity feed items; pushed to browser via WebSocket /ws/notifications';
COMMENT ON COLUMN notifications.payload   IS 'JSONB blob for type-specific metadata used by frontend to route the user';
COMMENT ON COLUMN notifications.type      IS 'Enum-like string; frontend switches on this to render the correct icon/action';

--  TABLE: audit_log

CREATE TABLE audit_log (
    id          BIGSERIAL       PRIMARY KEY,
    actor_id    INTEGER         REFERENCES users (id) ON DELETE SET NULL,
    action      VARCHAR(100)    NOT NULL,                 
    target_type VARCHAR(60),                               
    target_id   INTEGER,
    ip_address  INET,
    user_agent  TEXT,
    metadata    JSONB,
    occurred_at TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor      ON audit_log (actor_id);
CREATE INDEX idx_audit_action     ON audit_log (action);
CREATE INDEX idx_audit_occurred   ON audit_log (occurred_at);

COMMENT ON TABLE  audit_log  IS 'Append-only compliance log – never update or delete rows; set actor_id NULL when user is deleted';

--  TRIGGER HELPER: auto-refresh updated_at

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--  VIEWS (convenience)

-- Public event listing with organiser name
CREATE VIEW v_public_events AS
SELECT
    e.id,
    e.title,
    e.description,
    e.location,
    e.starts_at,
    e.ends_at,
    e.capacity,
    e.status,
    e.cover_image_url,
    u.full_name  AS organiser_name,
    u.avatar_url AS organiser_avatar,
    (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'registered') AS registered_count
FROM  events e
JOIN  users  u ON u.id = e.organiser_id
WHERE e.is_public = TRUE
  AND e.status    = 'published'
ORDER BY e.starts_at ASC;

COMMENT ON VIEW v_public_events IS 'Safe read-only view of live public events; exposed to unauthenticated frontend requests';


-- Media gallery for a folder (excludes private items unless queried directly)
CREATE VIEW v_folder_gallery AS
SELECT
    m.id,
    m.filename,
    m.s3_key,
    m.content_type,
    m.ai_tags,
    m.caption,
    m.uploaded_at,
    m.folder_id,
    u.full_name  AS uploader_name,
    u.avatar_url AS uploader_avatar,
    (SELECT COUNT(*) FROM media_likes ml WHERE ml.media_id = m.id) AS like_count,
    (SELECT COUNT(*) FROM comments   c  WHERE c.media_id  = m.id AND c.parent_id IS NULL) AS comment_count
FROM  media m
JOIN  users u ON u.id = m.uploader_id
ORDER BY m.uploaded_at DESC;

COMMENT ON VIEW v_folder_gallery IS 'Denormalised gallery view; backend must filter by folder_id and enforce auth before serving';



