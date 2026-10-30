import { randomUUID } from 'node:crypto';
import db from '../db/database.js';

export class NotificationService {
  /**
   * Registers a guest face profile for automatic match notifications
   * Requires explicit biometric consent
   */
  registerGuestProfile(eventId, userId, name, email, embedding, consentGiven = true) {
    if (!consentGiven) {
      const err = new Error('Explicit biometric consent is required to register for face match notifications');
      err.status = 400;
      throw err;
    }

    if (!embedding || !Array.isArray(embedding)) {
      const err = new Error('Valid face embedding array is required');
      err.status = 400;
      throw err;
    }

    const existing = db.prepare('SELECT id FROM guest_profiles WHERE event_id = ? AND user_id = ?').get(eventId, userId);
    const embeddingStr = JSON.stringify(embedding);

    if (existing) {
      db.prepare(`
        UPDATE guest_profiles
        SET name = ?, email = ?, embedding_json = ?, consent_given = 1, created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, email || '', embeddingStr, existing.id);
      return { id: existing.id, eventId, userId, name, registered: true };
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO guest_profiles (id, event_id, user_id, name, email, embedding_json, consent_given)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, eventId, userId, name, email || '', embeddingStr);

    return { id, eventId, userId, name, registered: true };
  }

  /**
   * Deletes a registered face profile and associated biometric embeddings
   */
  deleteGuestProfile(eventId, userId) {
    db.prepare('DELETE FROM guest_profiles WHERE event_id = ? AND user_id = ?').run(eventId, userId);
    return { success: true, message: 'Registered biometric face data deleted successfully' };
  }

  /**
   * Gets list of registered profiles for an event (used by AI matcher)
   */
  getRegisteredProfilesForEvent(eventId) {
    const rows = db.prepare('SELECT id, user_id, name, email, embedding_json FROM guest_profiles WHERE event_id = ?').all(eventId);
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      email: r.email,
      embedding: JSON.parse(r.embedding_json)
    }));
  }

  /**
   * Creates a notification, deduplicating against previously notified photos for the same guest
   */
  createNotification(userId, eventId, title, message, data = {}) {
    // Check user preferences
    const prefRow = db.prepare('SELECT preferences_json FROM user_preferences WHERE user_id = ?').get(userId);
    if (prefRow) {
      const prefs = JSON.parse(prefRow.preferences_json || '{}');
      if (prefs.matchesEnabled === false && data.type === 'new_photo_matches') {
        return null; // User disabled match notifications
      }
    }

    // Deduplicate: if an unread notification exists for the exact same event and photos, merge or skip
    if (data.matchedPhotos && Array.isArray(data.matchedPhotos)) {
      const existing = db.prepare(`
        SELECT id, data_json, message FROM notifications
        WHERE user_id = ? AND event_id = ? AND is_read = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(userId, eventId);

      if (existing) {
        try {
          const prevData = JSON.parse(existing.data_json || '{}');
          const prevPhotos = prevData.matchedPhotos || [];
          const combined = Array.from(new Set([...prevPhotos, ...data.matchedPhotos]));
          
          if (combined.length === prevPhotos.length) {
            return existing; // No new photos to notify about
          }

          const updatedMessage = `New photos of you are available! We found ${combined.length} photos from your event.`;
          db.prepare(`
            UPDATE notifications 
            SET message = ?, data_json = ?, created_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(updatedMessage, JSON.stringify({ ...prevData, matchedPhotos: combined }), existing.id);

          return { id: existing.id, updated: true };
        } catch (e) {
          // fallback to creating new
        }
      }
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO notifications (id, user_id, event_id, title, message, data_json, is_read)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, userId, eventId, title, message, JSON.stringify(data));

    return { id, userId, eventId, title, message, is_read: 0 };
  }

  /**
   * Gets user notifications
   */
  getNotifications(userId, unreadOnly = false, page = 1, size = 30) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(size, 10) || 30);
    const offset = (pageNum - 1) * pageSize;

    const query = unreadOnly
      ? 'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const countQuery = unreadOnly
      ? 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
      : 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ?';

    const total = db.prepare(countQuery).get(userId).count;
    const items = db.prepare(query).all(userId, pageSize, offset);

    return {
      total,
      page: pageNum,
      size: pageSize,
      unreadCount: this.getUnreadCount(userId),
      notifications: items.map(n => ({
        ...n,
        is_read: Boolean(n.is_read),
        data: JSON.parse(n.data_json || '{}')
      }))
    };
  }

  /**
   * Returns unread notification count for badge
   */
  getUnreadCount(userId) {
    const res = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId);
    return res ? res.count : 0;
  }

  /**
   * Marks a single notification as read
   */
  markAsRead(notificationId, userId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notificationId, userId);
    return { success: true };
  }

  /**
   * Marks all notifications as read for a user
   */
  markAllAsRead(userId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
    return { success: true };
  }

  /**
   * Preferences management
   */
  getPreferences(userId) {
    const row = db.prepare('SELECT preferences_json FROM user_preferences WHERE user_id = ?').get(userId);
    if (!row) {
      return { matchesEnabled: true, commentsEnabled: true, emailAlerts: false };
    }
    return JSON.parse(row.preferences_json || '{}');
  }

  updatePreferences(userId, prefs = {}) {
    const current = this.getPreferences(userId);
    const updated = { ...current, ...prefs };
    db.prepare(`
      INSERT INTO user_preferences (user_id, preferences_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = CURRENT_TIMESTAMP
    `).run(userId, JSON.stringify(updated));

    return updated;
  }
}

export const notificationService = new NotificationService();

