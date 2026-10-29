import { aiService } from './aiService.js';

export class EventService {
  constructor(service = aiService) {
    this.aiService = service;
  }

  validateFiles(files) {
    if (!files || !Array.isArray(files) || files.length === 0) {
      const err = new Error('No files provided');
      err.status = 400;
      throw err;
    }
  }

  async processImages(eventId, files) {
    this.validateFiles(files);
    return this.aiService.processImages(eventId, files);
  }

  async searchImages(eventId, files, page, size) {
    this.validateFiles(files);
    return this.aiService.searchImages(eventId, files, page, size);
  }

  async downloadAll(eventId) {
    return this.aiService.downloadAllImages(eventId);
  }
}

export const eventService = new EventService();
