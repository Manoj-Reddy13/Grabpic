import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { socialService } from '../src/services/socialService.js';
import { runMigrations } from '../src/db/migrations.js';

describe('Social Features: Likes and Comments', () => {
  let eventId;
  let photoId;
  const user1 = `guest-user-1-${randomUUID()}`;
  const user2 = `guest-user-2-${randomUUID()}`;

  before(() => {
    runMigrations();
    eventId = `test-event-social-${randomUUID()}`;
    photoId = `test-photo-${randomUUID()}.jpg`;
  });

  test('user can like a photo', () => {
    const res1 = socialService.toggleLike(eventId, photoId, user1, 'Guest One');
    assert.equal(res1.liked, true);
    assert.equal(res1.likeCount, 1);

    const stats = socialService.getPhotoLikes(photoId, user1);
    assert.equal(stats.likeCount, 1);
    assert.equal(stats.hasLiked, true);
  });

  test('toggling like again unlikes the photo', () => {
    const res2 = socialService.toggleLike(eventId, photoId, user1, 'Guest One');
    assert.equal(res2.liked, false);
    assert.equal(res2.likeCount, 0);

    const stats = socialService.getPhotoLikes(photoId, user1);
    assert.equal(stats.likeCount, 0);
    assert.equal(stats.hasLiked, false);
  });

  test('multiple users can like the same photo and duplicates are prevented', () => {
    socialService.toggleLike(eventId, photoId, user1, 'Guest One');
    const res2 = socialService.toggleLike(eventId, photoId, user2, 'Guest Two');

    assert.equal(res2.liked, true);
    assert.equal(res2.likeCount, 2);

    const statsUser1 = socialService.getPhotoLikes(photoId, user1);
    const statsUser2 = socialService.getPhotoLikes(photoId, user2);
    assert.equal(statsUser1.likeCount, 2);
    assert.equal(statsUser1.hasLiked, true);
    assert.equal(statsUser2.hasLiked, true);
  });

  test('users can add comments with pagination', () => {
    const c1 = socialService.addComment(eventId, photoId, user1, 'Guest One', 'Great photo!');
    assert.ok(c1.id);
    assert.equal(c1.comment_text, 'Great photo!');

    const c2 = socialService.addComment(eventId, photoId, user2, 'Guest Two', 'Looking sharp!');
    assert.ok(c2.id);

    const page1 = socialService.getComments(photoId, 1, 1);
    assert.equal(page1.total, 2);
    assert.equal(page1.comments.length, 1);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.comments[0].comment_text, 'Great photo!');

    const page2 = socialService.getComments(photoId, 2, 1);
    assert.equal(page2.comments.length, 1);
    assert.equal(page2.hasMore, false);
    assert.equal(page2.comments[0].comment_text, 'Looking sharp!');
  });

  test('user can delete their own comment', () => {
    const c3 = socialService.addComment(eventId, photoId, user1, 'Guest One', 'Temporary comment');
    const delRes = socialService.deleteComment(eventId, c3.id, user1, 'viewer');
    assert.equal(delRes.success, true);

    const comments = socialService.getComments(photoId);
    assert.ok(!comments.comments.find(c => c.id === c3.id));
  });

  test('admin can moderate/delete any comment, but regular viewer cannot delete others comment', () => {
    const c4 = socialService.addComment(eventId, photoId, user1, 'Guest One', 'Inappropriate test');
    
    // Regular viewer trying to delete another user's comment
    assert.throws(() => {
      socialService.deleteComment(eventId, c4.id, user2, 'viewer');
    }, /Permission denied/);

    // Event admin moderating the comment
    const modRes = socialService.deleteComment(eventId, c4.id, 'admin-user', 'admin');
    assert.equal(modRes.success, true);
  });
});
