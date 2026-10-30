import { randomUUID } from 'node:crypto';
import { eventService } from '../services/eventService.js';
import { collaboratorService } from '../services/collaboratorService.js';
import { notificationService } from '../services/notificationService.js';
import { getUser } from '../middleware/auth.js';
import db from '../db/database.js';

export class EventController {
  constructor(service = eventService) {
    this.eventService = service;
  }

  /**
   * POST /events
   * Generates a new event UUID and returns it.
   */
  createEvent = async (req, res, next) => {
    try {
      const eventId = randomUUID();
      const user = req.user || getUser(req);
      const title = req.body?.title || 'Untitled Event';
      collaboratorService.ensureEvent(eventId, user.id, title);
      collaboratorService.logActivity(eventId, user.id, 'created_event', { title });
      return res.status(200).json({ eventId, title });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /events/:eventId
   * Gets event details
   */
  getEvent = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const event = db.prepare('SELECT id, title, description, owner_id, created_at, expires_at FROM events WHERE id = ?').get(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      return res.status(200).json(event);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /events/:eventId/upload
   * Uploads photos for processing in the AI service.
   */
  uploadImages = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const files = req.files || [];
      const user = req.user || getUser(req);

      collaboratorService.ensureEvent(eventId, user.id);
      const result = await this.eventService.processImages(eventId, files);

      // Log activity
      collaboratorService.logActivity(eventId, user.id, 'uploaded_photos', { count: files.length });

      // Save photos to photos table
      for (const file of files) {
        const photoId = file.originalname || randomUUID();
        db.prepare(`
          INSERT OR IGNORE INTO photos (id, event_id, uploaded_by)
          VALUES (?, ?, ?)
        `).run(photoId, eventId, user.id);
      }

      // Check registered guest profiles for match notifications
      try {
        const profiles = notificationService.getRegisteredProfilesForEvent(eventId);
        if (profiles.length > 0) {
          for (const profile of profiles) {
            notificationService.createNotification(
              profile.userId,
              eventId,
              'New Photos Uploaded',
              `New photos were uploaded to event ${eventId}. Search to find any new matches!`,
              { type: 'new_photos_uploaded', count: files.length }
            );
          }
        }
      } catch (notifErr) {
        console.warn('Notification trigger warning:', notifErr.message);
      }

      return res.status(200).send(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /events/:eventId/search?page=1&size=20
   * Searches event photos using uploaded selfies with pagination.
   */
  searchImages = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const files = req.files || [];
      const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
      const size = Math.max(1, parseInt(req.query.size || '20', 10) || 20);

      const response = await this.eventService.searchImages(eventId, files, page, size);
      return res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /events/:eventId/download
   * Downloads all photos as a ZIP file.
   */
  downloadAll = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const zipBuffer = await this.eventService.downloadAll(eventId);

      res.setHeader('Content-Disposition', 'attachment; filename="photos.zip"');
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.status(200).send(zipBuffer);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /events/:eventId/stats
   * Retrieves AI classification statistics
   */
  getPhotosStats = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const stats = await this.eventService.getPhotosMetadata(eventId);
      return res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /events/:eventId/photos/:photoId/analysis
   * Retrieves detailed face bounding boxes, emotion, and scene analysis for a photo
   */
  getPhotoAnalysis = async (req, res, next) => {
    try {
      const { eventId, photoId } = req.params;
      const analysis = await this.eventService.getPhotoAnalysis(eventId, photoId);
      return res.status(200).json(analysis);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /events/:eventId/filter
   * Filters photos by scene, expression, min_faces, etc.
   */
  filterPhotos = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const results = await this.eventService.filterPhotos(eventId, req.body || {});
      return res.status(200).json(results);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /events/:eventId/nl-search
   * Natural language query photo search
   */
  naturalLanguageSearch = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const query = req.body?.query || '';
      const results = await this.eventService.naturalLanguageSearch(eventId, query);
      return res.status(200).json(results);
    } catch (err) {
      next(err);
    }
  };
}

export const eventController = new EventController();
