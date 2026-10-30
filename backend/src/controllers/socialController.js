import { socialService } from '../services/socialService.js';
import { getUser, getEventRole } from '../middleware/auth.js';

export class SocialController {
  toggleLike = async (req, res, next) => {
    try {
      const { eventId, photoId } = req.params;
      const user = req.user || getUser(req);
      const result = socialService.toggleLike(eventId, photoId, user.id, user.name);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getLikes = async (req, res, next) => {
    try {
      const { photoId } = req.params;
      const user = req.user || getUser(req);
      const result = socialService.getPhotoLikes(photoId, user.id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getBulkLikes = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const photoIds = req.query.photoIds ? req.query.photoIds.split(',') : [];
      const user = req.user || getUser(req);
      const result = socialService.getEventLikesMap(eventId, photoIds, user.id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  addComment = async (req, res, next) => {
    try {
      const { eventId, photoId } = req.params;
      const { text } = req.body;
      const user = req.user || getUser(req);
      const comment = socialService.addComment(eventId, photoId, user.id, user.name, text);
      return res.status(201).json(comment);
    } catch (err) {
      next(err);
    }
  };

  getComments = async (req, res, next) => {
    try {
      const { photoId } = req.params;
      const page = req.query.page || 1;
      const size = req.query.size || 20;
      const comments = socialService.getComments(photoId, page, size);
      return res.status(200).json(comments);
    } catch (err) {
      next(err);
    }
  };

  deleteComment = async (req, res, next) => {
    try {
      const { eventId, commentId } = req.params;
      const user = req.user || getUser(req);
      const role = getEventRole(eventId, user.id);
      const result = socialService.deleteComment(eventId, commentId, user.id, role);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const socialController = new SocialController();
