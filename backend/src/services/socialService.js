import { randomUUID } from 'node:crypto';
import db from '../db/database.js';

export class SocialService {
  /**
   * Toggles like for a photo by a user
   * Enforces 1 like per user per photo
   */
  toggleLike(eventId, photoId, userId, userName = 'Guest') {
    const existing = db.prepare('SELECT id FROM photo_likes WHERE photo_id = ? AND user_id = ?').get(photoId, userId);

    if (existing) {
      db.prepare('DELETE FROM photo_likes WHERE id = ?').run(existing.id);
      const countRes = db.prepare('SELECT COUNT(*) as count FROM photo_likes WHERE photo_id = ?').get(photoId);

      this.logActivity(eventId, userId, userName, 'unliked_photo', { photoId });
      return { photoId, liked: false, likeCount: countRes.count };
    } else {
      const id = randomUUID();
      db.prepare('INSERT INTO photo_likes (id, photo_id, event_id, user_id) VALUES (?, ?, ?, ?)').run(id, photoId, eventId, userId);
      const countRes = db.prepare('SELECT COUNT(*) as count FROM photo_likes WHERE photo_id = ?').get(photoId);

      this.logActivity(eventId, userId, userName, 'liked_photo', { photoId });
      return { photoId, liked: true, likeCount: countRes.count };
    }
  }

  /**
   * Gets like stats for a photo
   */
  getPhotoLikes(photoId, userId = null) {
    const countRes = db.prepare('SELECT COUNT(*) as count FROM photo_likes WHERE photo_id = ?').get(photoId);
    let hasLiked = false;

    if (userId) {
      const userLike = db.prepare('SELECT 1 FROM photo_likes WHERE photo_id = ? AND user_id = ?').get(photoId, userId);
      hasLiked = Boolean(userLike);
    }

    return {
      photoId,
      likeCount: countRes ? countRes.count : 0,
      hasLiked
    };
  }

  /**
   * Gets bulk likes for an array of photoIds in an event
   */
  getEventLikesMap(eventId, photoIds = [], userId = null) {
    const results = {};
    for (const photoId of photoIds) {
      results[photoId] = this.getPhotoLikes(photoId, userId);
    }
    return results;
  }

  /**
   * Adds a comment to a photo
   */
  addComment(eventId, photoId, userId, userName, commentText) {
    if (!commentText || !commentText.trim()) {
      const err = new Error('Comment text cannot be empty');
      err.status = 400;
      throw err;
    }

    const id = randomUUID();
    const cleanText = commentText.trim().slice(0, 1000); // 1000 chars max

    db.prepare(`
      INSERT INTO photo_comments (id, photo_id, event_id, user_id, user_name, comment_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, photoId, eventId, userId, userName, cleanText);

    this.logActivity(eventId, userId, userName, 'added_comment', { photoId, commentId: id });

    return db.prepare('SELECT * FROM photo_comments WHERE id = ?').get(id);
  }

  /**
   * Fetches paginated comments for a photo
   */
  getComments(photoId, page = 1, size = 20) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(size, 10) || 20);
    const offset = (pageNum - 1) * pageSize;

    const totalRes = db.prepare('SELECT COUNT(*) as count FROM photo_comments WHERE photo_id = ?').get(photoId);
    const total = totalRes ? totalRes.count : 0;

    const comments = db.prepare(`
      SELECT id, photo_id, event_id, user_id, user_name, comment_text, created_at, updated_at
      FROM photo_comments
      WHERE photo_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `).all(photoId, pageSize, offset);

    return {
      photoId,
      total,
      page: pageNum,
      size: pageSize,
      hasMore: offset + comments.length < total,
      comments
    };
  }

  /**
   * Deletes a comment
   * Allows if the requester is the comment author, or an event owner/admin (moderation)
   */
  deleteComment(eventId, commentId, userId, userRole = 'viewer') {
    const comment = db.prepare('SELECT * FROM photo_comments WHERE id = ?').get(commentId);
    if (!comment) {
      const err = new Error('Comment not found');
      err.status = 404;
      throw err;
    }

    const isAuthor = comment.user_id === userId;
    const isModerator = userRole === 'owner' || userRole === 'admin';

    if (!isAuthor && !isModerator) {
      const err = new Error('Permission denied: You can only delete your own comments or moderate as an event admin');
      err.status = 403;
      throw err;
    }

    db.prepare('DELETE FROM photo_comments WHERE id = ?').run(commentId);
    this.logActivity(eventId, userId, 'User', isModerator && !isAuthor ? 'moderated_comment' : 'deleted_comment', { commentId });

    return { success: true, message: 'Comment deleted successfully' };
  }

  logActivity(event_id, user_id, user_name, action, details = {}) {
    try {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO activity_logs (id, event_id, user_id, user_name, action, details_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, event_id, user_id, user_name, action, JSON.stringify(details));
    } catch (e) {
      console.warn('Failed to log activity:', e.message);
    }
  }
}

export const socialService = new SocialService();
