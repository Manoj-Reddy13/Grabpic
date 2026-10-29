import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AiService } from '../src/services/aiService.js';

describe('AiService Pagination', () => {
  const aiService = new AiService();

  test('paginates empty matches correctly', () => {
    const buckets = { strong: [], weak: [] };
    const res = aiService.paginate(buckets, 1, 20);

    assert.deepEqual(res, {
      total: 0,
      page: 1,
      size: 20,
      hasMore: false,
      strongMatches: [],
      weakMatches: [],
    });
  });

  test('returns empty matches when page is out of range', () => {
    const buckets = {
      strong: [{ imageId: 'img1', score: 0.9, url: 'u1' }],
      weak: [{ imageId: 'img2', score: 0.5, url: 'u2' }],
    };
    const res = aiService.paginate(buckets, 2, 20);

    assert.equal(res.total, 2);
    assert.equal(res.page, 2);
    assert.equal(res.hasMore, false);
    assert.equal(res.strongMatches.length, 0);
    assert.equal(res.weakMatches.length, 0);
  });

  test('paginates strong and weak matches preserving order and separation', () => {
    const strong = [
      { imageId: 's1', score: 0.9, url: 'u1' },
      { imageId: 's2', score: 0.85, url: 'u2' },
    ];
    const weak = [
      { imageId: 'w1', score: 0.6, url: 'u3' },
      { imageId: 'w2', score: 0.55, url: 'u4' },
      { imageId: 'w3', score: 0.52, url: 'u5' },
    ];

    // Page 1, size 3: should take s1, s2, w1
    const p1 = aiService.paginate({ strong, weak }, 1, 3);
    assert.equal(p1.total, 5);
    assert.equal(p1.page, 1);
    assert.equal(p1.size, 3);
    assert.equal(p1.hasMore, true);
    assert.deepEqual(p1.strongMatches, strong);
    assert.deepEqual(p1.weakMatches, [weak[0]]);

    // Page 2, size 3: should take w2, w3
    const p2 = aiService.paginate({ strong, weak }, 2, 3);
    assert.equal(p2.total, 5);
    assert.equal(p2.page, 2);
    assert.equal(p2.size, 3);
    assert.equal(p2.hasMore, false);
    assert.deepEqual(p2.strongMatches, []);
    assert.deepEqual(p2.weakMatches, [weak[1], weak[2]]);
  });
});
