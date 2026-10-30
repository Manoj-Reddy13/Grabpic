import db from '../db/database.js';

export function getUser(req) {
  // Support custom headers or query params or auth token
  const id = req.headers['x-user-id'] || req.query?.userId || 'guest_user';
  const name = req.headers['x-user-name'] || req.query?.userName || 'Guest User';
  const email = req.headers['x-user-email'] || req.query?.userEmail || `${id}@grabpic.local`;

  // Upsert user into DB if not exists
  try {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!existing) {
      db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)').run(id, name, email);
    }
  } catch (err) {
    // ignore
  }

  return { id, name, email };
}

export function authMiddleware(req, res, next) {
  req.user = getUser(req);
  next();
}

/**
 * Checks a user's role in an event
 * Returns 'owner', 'admin', 'photographer', 'viewer', or 'public'
 */
export function getEventRole(eventId, userId) {
  try {
    // Check if event exists
    const event = db.prepare('SELECT owner_id FROM events WHERE id = ?').get(eventId);
    
    // If event does not exist yet in DB, caller is uploading/creating as owner
    if (!event) {
      return 'owner';
    }

    if (event.owner_id === userId) {
      return 'owner';
    }

    // Check collaborator table
    const collab = db.prepare('SELECT role, status FROM event_collaborators WHERE event_id = ? AND user_id = ?').get(eventId, userId);
    if (collab && collab.status === 'accepted') {
      return collab.role;
    }

    return 'viewer';
  } catch (e) {
    return 'owner';
  }
}

/**
 * Middleware requiring specific roles in an event
 * e.g. requireEventRole(['owner', 'admin'])
 */
export function requireEventRole(allowedRoles = []) {
  return (req, res, next) => {
    const eventId = req.params.eventId || req.body?.eventId;
    const user = req.user || getUser(req);

    if (!eventId) {
      return res.status(400).json({ error: 'Missing eventId' });
    }

    const role = getEventRole(eventId, user.id);
    req.userRole = role;

    // 'owner' always has full permissions
    if (role === 'owner' || allowedRoles.includes(role)) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. Requires one of [${allowedRoles.join(', ')}], but current role is '${role}'`
    });
  };
}
