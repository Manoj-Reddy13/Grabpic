import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { collaboratorService } from '../src/services/collaboratorService.js';
import { getEventRole } from '../src/middleware/auth.js';
import { runMigrations } from '../src/db/migrations.js';

describe('Collaborative Albums & Roles', () => {
  const eventId = 'test-collab-event-1';
  const ownerId = 'owner-alice';
  const photographerId = 'photographer-bob';
  const photographerEmail = 'bob@photographer.com';
  const viewerId = 'viewer-charlie';
  const viewerEmail = 'charlie@viewer.com';

  before(() => {
    runMigrations();
    collaboratorService.ensureEvent(eventId, ownerId, 'Annual Gala 2026');
  });

  test('event creator is automatically owner', () => {
    const role = getEventRole(eventId, ownerId);
    assert.equal(role, 'owner');
  });

  test('owner can invite photographer and update role', () => {
    const invite = collaboratorService.inviteCollaborator(eventId, photographerEmail, 'photographer', ownerId);
    assert.equal(invite.email, photographerEmail);
    assert.equal(invite.role, 'photographer');
    assert.equal(invite.status, 'pending');

    // Bob accepts
    const acceptRes = collaboratorService.respondInvitation(eventId, invite.user_id, true);
    assert.equal(acceptRes.success, true);
    assert.equal(acceptRes.role, 'photographer');

    const role = getEventRole(eventId, invite.user_id);
    assert.equal(role, 'photographer');

    // Update role to admin
    const updateRes = collaboratorService.updateRole(eventId, invite.user_id, 'admin', ownerId);
    assert.equal(updateRes.success, true);

    const updatedRole = getEventRole(eventId, invite.user_id);
    assert.equal(updatedRole, 'admin');
  });

  test('collaborators can be listed and removed', () => {
    const inviteViewer = collaboratorService.inviteCollaborator(eventId, viewerEmail, 'viewer', ownerId);
    collaboratorService.respondInvitation(eventId, inviteViewer.user_id, true);

    const list = collaboratorService.getCollaborators(eventId);
    assert.ok(list.length >= 2);

    // Remove viewer
    const removeRes = collaboratorService.removeCollaborator(eventId, inviteViewer.user_id, ownerId);
    assert.equal(removeRes.success, true);

    const afterRemoveList = collaboratorService.getCollaborators(eventId);
    assert.ok(!afterRemoveList.find(c => c.user_id === inviteViewer.user_id));
  });

  test('activity history records collaborator events', () => {
    const history = collaboratorService.getActivityHistory(eventId);
    assert.ok(history.length > 0);
    assert.ok(history.some(h => h.action.includes('collaborator') || h.action.includes('invitation')));
  });
});
