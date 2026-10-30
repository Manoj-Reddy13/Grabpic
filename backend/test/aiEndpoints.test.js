import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { EventService } from '../src/services/eventService.js';

describe('Advanced AI Features & Intelligent Search Endpoints', () => {
  let mockAiService;
  let service;

  before(() => {
    mockAiService = {
      getPhotosMetadata: async (eventId) => ({
        eventId,
        photos: {
          'p1.jpg': {
            filename: 'p1.jpg',
            face_count: 4,
            is_group_photo: true,
            scenes: [{ label: 'Group Photo', confidence: 0.95 }],
            dominant_expression: 'Happy / Smiling',
          },
          'p2.jpg': {
            filename: 'p2.jpg',
            face_count: 1,
            is_group_photo: false,
            scenes: [{ label: 'Stage', confidence: 0.88 }],
            dominant_expression: 'Neutral',
          }
        },
        stats: {
          total_photos: 2,
          group_photos: 1,
          single_photos: 1,
          scene_distribution: { 'Group Photo': 1, 'Stage': 1 },
          expression_distribution: { 'Happy / Smiling': 1, 'Neutral': 1 }
        }
      }),
      filterPhotos: async (eventId, filters) => {
        return {
          eventId,
          total: 1,
          matches: [
            {
              imageId: 'p1.jpg',
              filename: 'p1.jpg',
              face_count: 4,
              is_group_photo: true,
              scenes: [{ label: 'Group Photo', confidence: 0.95 }],
              dominant_expression: 'Happy / Smiling',
              url: 'http://localhost:8000/images/test/p1.jpg'
            }
          ]
        };
      },
      naturalLanguageSearch: async (eventId, query) => {
        return {
          query,
          parsedFilters: { is_group: true, expression: 'Happy / Smiling' },
          total: 1,
          matches: [
            {
              imageId: 'p1.jpg',
              filename: 'p1.jpg',
              url: 'http://localhost:8000/images/test/p1.jpg'
            }
          ]
        };
      }
    };
    service = new EventService(mockAiService);
  });

  test('retrieves photo classification stats and metadata', async () => {
    const res = await service.getPhotosMetadata('event-123');
    assert.equal(res.stats.total_photos, 2);
    assert.equal(res.stats.group_photos, 1);
    assert.equal(res.stats.scene_distribution['Group Photo'], 1);
  });

  test('filters photos by scene and expression', async () => {
    const res = await service.filterPhotos('event-123', { is_group: true, expression: 'Happy / Smiling' });
    assert.equal(res.total, 1);
    assert.equal(res.matches[0].imageId, 'p1.jpg');
    assert.equal(res.matches[0].dominant_expression, 'Happy / Smiling');
  });

  test('natural language search interprets query into results', async () => {
    const res = await service.naturalLanguageSearch('event-123', 'find smiling group photos');
    assert.equal(res.total, 1);
    assert.equal(res.parsedFilters.is_group, true);
    assert.equal(res.parsedFilters.expression, 'Happy / Smiling');
  });
});
