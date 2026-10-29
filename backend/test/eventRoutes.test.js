import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { eventService } from '../src/services/eventService.js';

describe('HTTP Event API Endpoints', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('GET /health returns status UP', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, { status: 'UP' });
  });

  test('GET /actuator/health returns status UP', async () => {
    const res = await fetch(`${baseUrl}/actuator/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, { status: 'UP' });
  });

  test('POST /events generates a valid UUID eventId', async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: 'POST',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.eventId);
    // UUID v4 regex validation
    assert.match(
      data.eventId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test('POST /events/:eventId/upload returns 400 when no files are attached', async () => {
    const eventId = 'test-event-uuid';
    const res = await fetch(`${baseUrl}/events/${eventId}/upload`, {
      method: 'POST',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'No files provided');
  });

  test('POST /events/:eventId/search returns 400 when no files are attached', async () => {
    const eventId = 'test-event-uuid';
    const res = await fetch(`${baseUrl}/events/${eventId}/search`, {
      method: 'POST',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'No files provided');
  });

  test('POST /events/:eventId/upload succeeds with files when AI service is mocked', async () => {
    const eventId = 'test-event-uuid';
    const originalProcess = eventService.aiService.processImages;
    eventService.aiService.processImages = async () => ({
      status: 'processing_started',
      eventId,
    });

    try {
      const formData = new FormData();
      const dummyFile = new Blob(['dummy content'], { type: 'image/jpeg' });
      formData.append('files', dummyFile, 'photo1.jpg');

      const res = await fetch(`${baseUrl}/events/${eventId}/upload`, {
        method: 'POST',
        body: formData,
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'processing_started');
      assert.equal(data.eventId, eventId);
    } finally {
      eventService.aiService.processImages = originalProcess;
    }
  });

  test('POST /events/:eventId/search returns matches when AI service is mocked', async () => {
    const eventId = 'test-event-uuid';
    const originalSearch = eventService.aiService.searchImages;
    eventService.aiService.searchImages = async (id, files, page, size) => ({
      total: 1,
      page,
      size,
      hasMore: false,
      strongMatches: [{ imageId: 'img1.jpg', score: 0.85, url: 'http://localhost/img1.jpg' }],
      weakMatches: [],
    });

    try {
      const formData = new FormData();
      const dummyFile = new Blob(['selfie content'], { type: 'image/jpeg' });
      formData.append('files', dummyFile, 'selfie.jpg');

      const res = await fetch(`${baseUrl}/events/${eventId}/search?page=1&size=20`, {
        method: 'POST',
        body: formData,
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.total, 1);
      assert.equal(data.strongMatches.length, 1);
      assert.equal(data.strongMatches[0].imageId, 'img1.jpg');
    } finally {
      eventService.aiService.searchImages = originalSearch;
    }
  });

  test('GET /events/:eventId/download returns photos.zip when AI service is mocked', async () => {
    const eventId = 'test-event-uuid';
    const originalDownload = eventService.aiService.downloadAllImages;
    eventService.aiService.downloadAllImages = async () => Buffer.from('mock zip binary content');

    try {
      const res = await fetch(`${baseUrl}/events/${eventId}/download`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-disposition'), 'attachment; filename="photos.zip"');
      assert.equal(res.headers.get('content-type'), 'application/octet-stream');

      const buf = await res.arrayBuffer();
      assert.equal(Buffer.from(buf).toString(), 'mock zip binary content');
    } finally {
      eventService.aiService.downloadAllImages = originalDownload;
    }
  });
});
