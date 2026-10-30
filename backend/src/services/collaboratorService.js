import { randomUUID } from 'node:crypto';
import db from '../db/database.js';

export class CollaboratorService {
  /**
   * Ensures an event record exists in the DB, setting owner if needed
   */
  ensureEvent(eventId, ownerId = 'default_owner', title = 'Event') {
    const existing = db.prepare('SELECT id, owner_id FROM events WHERE id = ?').get(eventId);
    if (!existing) {
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + 24 * 3600;
      db.prepare(`
        INSERT INTO events (id, title, owner_id, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(eventId, title, ownerId, expiresAt);

      // Also insert owner as collaborator
      const collabId = randomUUID();
      db.prepare(`
        INSERT OR IGNORE INTO event_collaborators (id, event_id, user_id, user_email, role, status)
        VALUES (?, ?, ?, ?, 'owner', 'accepted')
      `).run(collabId, eventId, ownerId, `${ownerId}@grabpic.local`);
    }
  }

  /**
   * Lists all collaborators for an event
   */
  getCollaborators(eventId) {
    return db.prepare(`
      SELECT c.id, c.event_id, c.user_id, c.user_email, c.role, c.status, c.created_at,
             COALESCE(u.name, c.user_email, c.user_id) as user_name
      FROM event_collaborators c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.event_id = ?
      ORDER BY 
        CASE c.role 
          WHEN 'owner' THEN 1 
          WHEN 'admin' THEN 2 
          WHEN 'photographer' THEN 3 
          ELSE 4 
        END,
        c.created_at ASC
    `).all(eventId);
  }

  /**
   * Invites a new collaborator
   */
  inviteCollaborator(eventId, userEmail, role = 'viewer', invitedBy = 'owner') {
    const validRoles = ['admin', 'photographer', 'viewer'];
    if (!validRoles.includes(role)) {
      const err = new Error(`Invalid role '${role}'. Must be one of [${validRoles.join(', ')}]`);
      err.status = 400;
      throw err;
    }

    if (!userEmail || !userEmail.includes('@')) {
      const err = new Error('A valid email is required to invite a collaborator');
      err.status = 400;
      throw err;
    }

    const cleanEmail = userEmail.trim().toLowerCase();

    // Check if user exists in users table, else create placeholder
    let user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(cleanEmail);
    if (!user) {
      const newUserId = randomUUID();
      const userName = cleanEmail.split('@')[0];
      db.prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)').run(newUserId, cleanEmail, userName);
      user = { id: newUserId, email: cleanEmail, name: userName };
    }

    // Check if already a collaborator
    const existing = db.prepare('SELECT id, role, status FROM event_collaborators WHERE event_id = ? AND user_id = ?').get(eventId, user.id);
    if (existing) {
      if (existing.role === 'owner') {
        const err = new Error('Cannot modify role of the event owner');
        err.status = 400;
        throw err;
      }
      // Update existing
      db.prepare(`
        UPDATE event_collaborators 
        SET role = ?, status = 'pending', user_email = ?
        WHERE id = ?
      `).run(role, cleanEmail, existing.id);

      this.logActivity(eventId, invitedBy, 're-invited_collaborator', { userEmail: cleanEmail, role });
      return { id: existing.id, event_id: eventId, user_id: user.id, email: cleanEmail, role, status: 'pending' };
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO event_collaborators (id, event_id, user_id, user_email, role, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(id, eventId, user.id, cleanEmail, role);

    this.logActivity(eventId, invitedBy, 'invited_collaborator', { userEmail: cleanEmail, role });
    return { id, event_id: eventId, user_id: user.id, email: cleanEmail, role, status: 'pending' };
  }

  /**
   * Responds to an invitation (accept or decline)
   */
  respondInvitation(eventId, userId, accept = true) {
    const collab = db.prepare('SELECT id, role, status FROM event_collaborators WHERE event_id = ? AND user_id = ?').get(eventId, userId);
    if (!collab) {
      const err = new Error('Invitation not found for this user and event');
      err.status = 404;
      throw err;
    }

    if (!accept) {
      db.prepare('DELETE FROM event_collaborators WHERE id = ?').run(collab.id);
      this.logActivity(eventId, userId, 'declined_invitation', {});
      return { success: true, message: 'Invitation declined' };
    }

    db.prepare("UPDATE event_collaborators SET status = 'accepted' WHERE id = ?").run(collab.id);
    this.logActivity(eventId, userId, 'accepted_invitation', { role: collab.role });
    return { success: true, message: 'Invitation accepted', role: collab.role };
  }

  /**
   * Updates a collaborator's role
   */
  updateRole(eventId, targetUserId, newRole, updatedBy) {
    const validRoles = ['admin', 'photographer', 'viewer'];
    if (!validRoles.includes(newRole)) {
      const err = new Error(`Invalid role. Must be one of [${validRoles.join(', ')}]`);
      err.status = 400;
      throw err;
    }

    const collab = db.prepare('SELECT id, role FROM event_collaborators WHERE event_id = ? AND user_id = ?').get(eventId, targetUserId);
    if (!collab) {
      const err = new Error('Collaborator not found');
      err.status = 404;
      throw err;
    }

    if (collab.role === 'owner') {
      const err = new Error('Cannot change role of event owner');
      err.status = 400;
      throw err;
    }

    db.prepare('UPDATE event_collaborators SET role = ? WHERE id = ?').run(newRole, collab.id);
    this.logActivity(eventId, updatedBy, 'updated_collaborator_role', { targetUserId, newRole });

    return { success: true, message: `Role updated to ${newRole}` };
  }

  /**
   * Removes a collaborator from an event
   */
  removeCollaborator(eventId, targetUserId, removedBy) {
    const collab = db.prepare('SELECT id, role FROM event_collaborators WHERE event_id = ? AND user_id = ?').get(eventId, targetUserId);
    if (!collab) {
      const err = new Error('Collaborator not found');
      err.status = 404;
      throw err;
    }

    if (collab.role === 'owner') {
      const err = new Error('Cannot remove the event owner');
      err.status = 400;
      throw err;
    }

    db.prepare('DELETE FROM event_collaborators WHERE id = ?').run(collab.id);
    this.logActivity(eventId, removedBy, 'removed_collaborator', { targetUserId });

    return { success: true, message: 'Collaborator removed successfully' };
  }

  /**
   * Returns activity history for an event
   */
  getActivityHistory(eventId, limit = 50) {
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const logs = db.prepare(`
      SELECT id, event_id, user_id, user_name, action, details_json, created_at
      FROM activity_logs
      WHERE event_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(eventId, limitNum);

    return logs.map(l => ({
      ...l,
      details: JSON.parse(l.details_json || '{}')
    }));
  }

  logActivity(event_id, user_id, action, details = {}) {
    try {
      const id = randomUUID();
      const user = db.prepare('SELECT name FROM users WHERE id = ?').get(user_id);
      const userName = user ? user.name : user_id;

      db.prepare(`
        INSERT INTO activity_logs (id, event_id, user_id, user_name, action, details_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, event_id, user_id, userName, action, JSON.stringify(details));
    } catch (e) {
      console.warn('Failed to log activity:', e.message);
    }
  }
}

export const collaboratorService = new CollaboratorService();

