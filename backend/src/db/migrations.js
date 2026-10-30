import db from './database.js';

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version);

  const migrations = [
    {
      version: 1,
      name: 'initial_social_and_collaboration_schema',
      up: () => {
        db.exec(`
          -- Users table
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            name TEXT NOT NULL,
            avatar_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- Events table
          CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'Untitled Event',
            description TEXT DEFAULT '',
            owner_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at INTEGER NOT NULL
          );

          -- Collaborators table
          CREATE TABLE IF NOT EXISTS event_collaborators (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_email TEXT,
            role TEXT CHECK(role IN ('owner', 'admin', 'photographer', 'viewer')) NOT NULL DEFAULT 'viewer',
            status TEXT CHECK(status IN ('pending', 'accepted')) NOT NULL DEFAULT 'accepted',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, user_id)
          );

          -- Photos table
          CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            uploaded_by TEXT,
            face_count INTEGER DEFAULT 0,
            scenes_json TEXT DEFAULT '[]',
            expressions_json TEXT DEFAULT '[]',
            metadata_json TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- Likes table (enforces 1 like per user per photo)
          CREATE TABLE IF NOT EXISTS photo_likes (
            id TEXT PRIMARY KEY,
            photo_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(photo_id, user_id)
          );

          -- Comments table
          CREATE TABLE IF NOT EXISTS photo_comments (
            id TEXT PRIMARY KEY,
            photo_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            comment_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- Activity logs table
          CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            user_id TEXT,
            user_name TEXT,
            action TEXT NOT NULL,
            details_json TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- Guest face profiles for notifications (with explicit biometric consent)
          CREATE TABLE IF NOT EXISTS guest_profiles (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            embedding_json TEXT NOT NULL,
            consent_given INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, user_id)
          );

          -- Notifications table
          CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            event_id TEXT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            data_json TEXT DEFAULT '{}',
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- User preferences
          CREATE TABLE IF NOT EXISTS user_preferences (
            user_id TEXT PRIMARY KEY,
            preferences_json TEXT DEFAULT '{}',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- Indexes for fast query performance
          CREATE INDEX IF NOT EXISTS idx_collab_event ON event_collaborators(event_id);
          CREATE INDEX IF NOT EXISTS idx_collab_user ON event_collaborators(user_id);
          CREATE INDEX IF NOT EXISTS idx_likes_photo ON photo_likes(photo_id);
          CREATE INDEX IF NOT EXISTS idx_likes_event ON photo_likes(event_id);
          CREATE INDEX IF NOT EXISTS idx_comments_photo ON photo_comments(photo_id);
          CREATE INDEX IF NOT EXISTS idx_comments_event ON photo_comments(event_id);
          CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id);
          CREATE INDEX IF NOT EXISTS idx_activity_event ON activity_logs(event_id);
          CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
          CREATE INDEX IF NOT EXISTS idx_guest_profiles_event ON guest_profiles(event_id);
        `);
      }
    }
  ];

  for (const migration of migrations) {
    if (!applied.includes(migration.version)) {
      console.log(`[DB] Applying migration ${migration.version}: ${migration.name}`);
      migration.up();
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    }
  }
}
