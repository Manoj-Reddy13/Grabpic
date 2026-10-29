import axios from 'axios';
import FormData from 'form-data';
import config from '../config/index.js';
import { tokenService } from './tokenService.js';
import { blobService } from './blobService.js';

export class AiService {
  constructor() {
    this.internalBaseUrl = config.ai.internalBaseUrl;
    this.publicBaseUrl = config.ai.publicBaseUrl;
  }

  /**
   * Forwards image uploads to AI service for face detection and indexing.
   *
   * @param {string} eventId
   * @param {Array<Express.Multer.File>} files
   * @returns {Promise<any>}
   */
  async processImages(eventId, files) {
    const url = `${this.internalBaseUrl}/process/${eventId}`;
    const form = new FormData();

    for (const file of files) {
      form.append('files', file.buffer, {
        filename: file.originalname || 'image.jpg',
        contentType: file.mimetype || 'image/jpeg',
      });
    }

    try {
      const response = await axios.post(url, form, {
        headers: {
          ...form.getHeaders(),
        },
        maxContentLength: config.maxRequestSize,
        maxBodyLength: config.maxRequestSize,
      });
      return response.data;
    } catch (err) {
      const errorDetail = err.response?.data || err.message;
      console.error(`AI call failed for process event ${eventId}:`, errorDetail);
      throw new Error(`AI process failed: ${typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail}`);
    }
  }

  /**
   * Forwards selfie images to AI service and paginates strong and weak matches.
   *
   * @param {string} eventId
   * @param {Array<Express.Multer.File>} files
   * @param {number} page - 1-based page index
   * @param {number} size - page size
   * @returns {Promise<object>} SearchResponse
   */
  async searchImages(eventId, files, page = 1, size = 20) {
    const url = `${this.internalBaseUrl}/search/${eventId}`;
    const form = new FormData();

    for (const file of files) {
      form.append('files', file.buffer, {
        filename: file.originalname || 'selfie.jpg',
        contentType: file.mimetype || 'image/jpeg',
      });
    }

    try {
      const response = await axios.post(url, form, {
        headers: {
          ...form.getHeaders(),
        },
        maxContentLength: config.maxRequestSize,
        maxBodyLength: config.maxRequestSize,
      });

      const data = response.data;
      if (data && data.error) {
        throw new Error(`AI error: ${data.error}`);
      }

      const rawStrong = Array.isArray(data?.strong_matches) ? data.strong_matches : [];
      const rawWeak = Array.isArray(data?.weak_matches) ? data.weak_matches : [];

      const strongMatches = rawStrong.map((m) => this.buildImageMatch(m, eventId));
      const weakMatches = rawWeak.map((m) => this.buildImageMatch(m, eventId));

      return this.paginate({ strong: strongMatches, weak: weakMatches }, page, size);
    } catch (err) {
      const errorDetail = err.response?.data || err.message;
      console.error(`AI search failed for event ${eventId}:`, errorDetail);
      throw new Error(`AI search failed: ${typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail}`);
    }
  }

  /**
   * Builds an ImageMatch object with signed or SAS URL.
   *
   * @param {object} m - raw match { image_id, score }
   * @param {string} eventId
   * @returns {{ imageId: string, score: number, url: string }}
   */
  buildImageMatch(m, eventId) {
    const imageId = m.image_id;
    const score = Number(m.score);

    if (blobService.isAvailable()) {
      try {
        const sasUrl = blobService.generateSasUrl(eventId, imageId);
        return { imageId, score, url: sasUrl };
      } catch (err) {
        console.warn(`Failed to generate SAS URL for image ${imageId}, falling back to token URL:`, err.message);
      }
    }

    // Fallback: Use AI service signed URLs (valid for 24 hours)
    const expiryTs = Math.floor(Date.now() / 1000) + 24 * 3600;
    const token = tokenService.generateToken(eventId, imageId, expiryTs);
    const url = `${this.publicBaseUrl}/images/${eventId}/images/${imageId}?token=${token}`;

    return { imageId, score, url };
  }

  /**
   * Paginates matches matching Spring Boot logic:
   * Combines strong followed by weak matches, takes slice [from, to],
   * and preserves strong and weak categorizations within the slice.
   *
   * @param {{ strong: Array, weak: Array }} buckets
   * @param {number} page - 1-based page index
   * @param {number} size
   * @returns {object} SearchResponse
   */
  paginate(buckets, page = 1, size = 20) {
    const combined = [...buckets.strong, ...buckets.weak];
    const total = combined.length;
    const from = (page - 1) * size;

    if (from >= total) {
      return {
        total,
        page,
        size,
        hasMore: false,
        strongMatches: [],
        weakMatches: [],
      };
    }

    const to = Math.min(from + size, total);
    const pageSlice = combined.slice(from, to);

    const strongSet = new Set(buckets.strong);
    const weakSet = new Set(buckets.weak);

    const strongMatches = pageSlice.filter((item) => strongSet.has(item));
    const weakMatches = pageSlice.filter((item) => weakSet.has(item));
    const hasMore = to < total;

    return {
      total,
      page,
      size,
      hasMore,
      strongMatches,
      weakMatches,
    };
  }

  /**
   * Downloads all photos as a ZIP binary from AI service.
   *
   * @param {string} eventId
   * @returns {Promise<Buffer>}
   */
  async downloadAllImages(eventId) {
    const url = `${this.internalBaseUrl}/events/${eventId}/download`;
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return Buffer.from(response.data);
    } catch (err) {
      const errorDetail = err.response?.data || err.message;
      console.error(`Download failed for event ${eventId}:`, errorDetail);
      throw new Error(`Failed to download ZIP: ${err.message}`);
    }
  }
}

export const aiService = new AiService();
