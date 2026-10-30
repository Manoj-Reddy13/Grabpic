import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { notificationService } from '../src/services/notificationService.js';
import { runMigrations } from '../src/db/migrations.js';

describe('Biometric Face Profiles & In-App Notifications', () => {
  let eventId;
  let userId;
  const dummyEmbedding = Array(512).fill(0.05);

  before(() => {
    runMigrations();
    eventId = `test-notif-event-${randomUUID()}`;
    userId = `guest-dan-${randomUUID()}`;
  });

  test('requires explicit biometric consent to register guest profile', () => {
    assert.throws(() => {
      notificationService.registerGuestProfile(eventId, userId, 'Dan', 'dan@test.com', dummyEmbedding, false);
    }, /Explicit biometric consent is required/);

    const reg = notificationService.registerGuestProfile(eventId, userId, 'Dan', 'dan@test.com', dummyEmbedding, true);
    assert.equal(reg.registered, true);
    assert.equal(reg.userId, userId);
  });

  test('creates match notification and prevents duplicates', () => {
    const notif1 = notificationService.createNotification(
      userId,
      eventId,
      'New Photos of You Available',
      'We found 2 new photos from Tech Fest 2026',
      { type: 'new_photo_matches', matchedPhotos: ['photo-1.jpg', 'photo-2.jpg'] }
    );
    assert.ok(notif1.id);

    // Unread count is 1
    assert.equal(notificationService.getUnreadCount(userId), 1);

    // Second upload discovers photo-2 and photo-3 -> merges into existing notification rather than spamming
    const notif2 = notificationService.createNotification(
      userId,
      eventId,
      'New Photos of You Available',
      'We found 3 new photos from Tech Fest 2026',
      { type: 'new_photo_matches', matchedPhotos: ['photo-2.jpg', 'photo-3.jpg'] }
    );
    assert.equal(notif2.updated, true);
    assert.equal(notificationService.getUnreadCount(userId), 1);

    const list = notificationService.getNotifications(userId);
    assert.equal(list.notifications.length, 1);
    assert.equal(list.notifications[0].data.matchedPhotos.length, 3);
  });

  test('mark as read and preferences management', () => {
    const list = notificationService.getNotifications(userId);
    const notifId = list.notifications[0].id;

    notificationService.markAsRead(notifId, userId);
    assert.equal(notificationService.getUnreadCount(userId), 0);

    // Update preferences
    const prefs = notificationService.updatePreferences(userId, { matchesEnabled: false });
    assert.equal(prefs.matchesEnabled, false);

    // Should respect preference
    const skipped = notificationService.createNotification(userId, eventId, 'Test', 'Msg', { type: 'new_photo_matches' });
    assert.equal(skipped, null);
  });

  test('guest can delete their registered face profile', () => {
    const delRes = notificationService.deleteGuestProfile(eventId, userId);
    assert.equal(delRes.success, true);

    const profiles = notificationService.getRegisteredProfilesForEvent(eventId);
    assert.ok(!profiles.find(p => p.userId === userId));
  });
});
