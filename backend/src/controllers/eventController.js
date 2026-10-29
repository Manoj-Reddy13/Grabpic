import { randomUUID } from 'node:crypto';
import { eventService } from '../services/eventService.js';

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
      return res.status(200).json({ eventId });
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
      const result = await this.eventService.processImages(eventId, files);
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
}

export const eventController = new EventController();
