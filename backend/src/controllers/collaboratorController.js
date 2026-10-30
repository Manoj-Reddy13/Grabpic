import { collaboratorService } from '../services/collaboratorService.js';
import { getUser, requireEventRole } from '../middleware/auth.js';

export class CollaboratorController {
  getCollaborators = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const list = collaboratorService.getCollaborators(eventId);
      return res.status(200).json({ eventId, collaborators: list });
    } catch (err) {
      next(err);
    }
  };

  inviteCollaborator = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const { email, role } = req.body;
      const user = req.user || getUser(req);
      const result = collaboratorService.inviteCollaborator(eventId, email, role, user.id);
      return res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  respondInvitation = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const { accept } = req.body;
      const user = req.user || getUser(req);
      const result = collaboratorService.respondInvitation(eventId, user.id, accept !== false);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  updateRole = async (req, res, next) => {
    try {
      const { eventId, userId } = req.params;
      const { role } = req.body;
      const user = req.user || getUser(req);
      const result = collaboratorService.updateRole(eventId, userId, role, user.id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  removeCollaborator = async (req, res, next) => {
    try {
      const { eventId, userId } = req.params;
      const user = req.user || getUser(req);
      const result = collaboratorService.removeCollaborator(eventId, userId, user.id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getActivityHistory = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const limit = req.query.limit || 50;
      const logs = collaboratorService.getActivityHistory(eventId, limit);
      return res.status(200).json({ eventId, activities: logs });
    } catch (err) {
      next(err);
    }
  };
}

export const collaboratorController = new CollaboratorController();

