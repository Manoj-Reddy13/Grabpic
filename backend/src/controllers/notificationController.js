import { notificationService } from '../services/notificationService.js';
import { getUser } from '../middleware/auth.js';

export class NotificationController {
  registerGuestProfile = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const { name, email, embedding, consentGiven } = req.body;
      const user = req.user || getUser(req);
      const result = notificationService.registerGuestProfile(
        eventId,
        user.id,
        name || user.name,
        email || user.email,
        embedding,
        Boolean(consentGiven)
      );
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  deleteGuestProfile = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const user = req.user || getUser(req);
      const result = notificationService.deleteGuestProfile(eventId, user.id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getNotifications = async (req, res, next) => {
    try {
      const user = req.user || getUser(req);
      const unreadOnly = req.query.unreadOnly === 'true';
      const page = req.query.page || 1;
      const size = req.query.size || 30;
      const result = notificationService.getNotifications(user.id, unreadOnly, page, size);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getUnreadCount = async (req, res, next) => {
    try {
      const user = req.user || getUser(req);
      const count = notificationService.getUnreadCount(user.id);
      return res.status(200).json({ unreadCount: count });
    } catch (err) {
      next(err);
    }
  };

  markAsRead = async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = req.user || getUser(req);
      const result = notificationService.markAsRead(id, user.id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  markAllAsRead = async (req, res, next) => {
    try {
      const user = req.user || getUser(req);
      const result = notificationService.markAllAsRead(user.id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getPreferences = async (req, res, next) => {
    try {
      const user = req.user || getUser(req);
      const prefs = notificationService.getPreferences(user.id);
      return res.status(200).json(prefs);
    } catch (err) {
      next(err);
    }
  };

  updatePreferences = async (req, res, next) => {
    try {
      const user = req.user || getUser(req);
      const prefs = notificationService.updatePreferences(user.id, req.body);
      return res.status(200).json(prefs);
    } catch (err) {
      next(err);
    }
  };
}

export const notificationController = new NotificationController();

