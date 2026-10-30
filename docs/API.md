# GrabPic API

## Overview

Base URLs:
- Backend: `http://localhost:8080`
- AI service: `http://localhost:8000`

---

## Backend API

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| POST | `/events` | Create event | Public / Organizer |
| GET | `/events/{eventId}` | Get event details | Public / Viewer |
| POST | `/events/{eventId}/upload` | Upload event photos | Owner / Admin / Photographer |
| POST | `/events/{eventId}/search` | Face search with selfies | Public / Viewer |
| GET | `/events/{eventId}/download` | Download all photos as ZIP | Public / Viewer |
| POST | `/events/{eventId}/photos/{photoId}/like` | Toggle like on a photo | Authenticated / Guest |
| GET | `/events/{eventId}/photos/{photoId}/likes` | Get photo like count | Public / Viewer |
| GET | `/events/{eventId}/likes-summary` | Bulk likes summary for event | Public / Viewer |
| GET | `/events/{eventId}/photos/{photoId}/comments` | Get paginated comments | Public / Viewer |
| POST | `/events/{eventId}/photos/{photoId}/comments` | Add comment to photo | Authenticated / Guest |
| DELETE | `/events/{eventId}/comments/{commentId}` | Delete comment | Author or Event Admin/Owner |
| GET | `/events/{eventId}/collaborators` | List collaborators | Collaborator / Viewer |
| POST | `/events/{eventId}/collaborators/invite` | Invite collaborator by email | Owner / Admin |
| POST | `/events/{eventId}/collaborators/respond` | Accept / decline invite | Invitee |
| PATCH | `/events/{eventId}/collaborators/{userId}/role`| Change collaborator role | Owner / Admin |
| DELETE | `/events/{eventId}/collaborators/{userId}` | Remove collaborator | Owner / Admin |
| GET | `/events/{eventId}/collaborators/activity` | Event activity history | Collaborator / Viewer |
| POST | `/events/{eventId}/register-profile` | Register selfie for match alerts | Authenticated / Guest (with Consent) |
| DELETE | `/events/{eventId}/register-profile` | Delete registered face data | Authenticated / Guest |
| GET | `/notifications` | Get user notifications | Authenticated / Guest |
| GET | `/notifications/unread-count` | Get unread notification count | Authenticated / Guest |
| PATCH | `/notifications/{id}/read` | Mark notification as read | Recipient |
| PATCH | `/notifications/read-all` | Mark all notifications read | Recipient |
| GET/PUT | `/notifications/preferences` | Get/update notification preferences | Recipient |
| GET | `/events/{eventId}/stats` | AI photo classification stats | Collaborator / Viewer |
| GET | `/events/{eventId}/photos/{photoId}/analysis` | Face bounding box & emotion analysis | Collaborator / Viewer |
| POST | `/events/{eventId}/filter` | Filter photos by scene, expr, group | Collaborator / Viewer |
| POST | `/events/{eventId}/nl-search` | Natural language query photo search | Collaborator / Viewer |

---

### Example Requests

#### Like / Unlike Photo
```bash
curl -X POST http://localhost:8080/events/{eventId}/photos/{photoId}/like \
  -H "x-user-id: guest_123" \
  -H "x-user-name: Alice"
```
Response:
```json
{ "photoId": "abc.jpg", "liked": true, "likeCount": 5 }
```

#### Add Comment
```bash
curl -X POST http://localhost:8080/events/{eventId}/photos/{photoId}/comments \
  -H "x-user-id: guest_123" \
  -H "x-user-name: Alice" \
  -H "Content-Type: application/json" \
  -d '{"text": "Amazing shot!"}'
```

#### Natural Language Photo Search
```bash
curl -X POST http://localhost:8080/events/{eventId}/nl-search \
  -H "Content-Type: application/json" \
  -d '{"query": "find smiling group photos from the stage"}'
```
Response:
```json
{
  "query": "find smiling group photos from the stage",
  "parsedFilters": {
    "scene": "Stage",
    "expression": "Happy / Smiling",
    "is_group": true,
    "min_faces": 2
  },
  "total": 3,
  "matches": [...]
}
```

#### Register for Face Match Notifications
```bash
curl -X POST http://localhost:8080/events/{eventId}/register-profile \
  -H "x-user-id: guest_123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice",
    "email": "alice@example.com",
    "embedding": [...],
    "consentGiven": true
  }'
```

---

## AI Service API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/process/{event_id}` | Process images, detect faces, emotions, and scenes |
| GET | `/status/{event_id}` | Check processing status |
| POST | `/search/{event_id}` | Search indexed images by selfie |
| GET | `/images/{event_id}/images/{filename}` | Fetch image securely |
| GET | `/events/{event_id}/photos-metadata` | Get photos metadata & distribution stats |
| GET | `/events/{event_id}/photos/{filename}/analysis` | Get face bounding boxes & emotion scores |
| POST | `/events/{event_id}/filter` | Filter photos by scene, expression, face count |
| POST | `/events/{event_id}/nl-search` | Natural language query search |
| POST | `/events/{event_id}/match-profiles` | Match registered guest profiles for notifications |
| GET | `/events/{event_id}/download` | Download all event images as ZIP |
| GET | `/download/{blob_name}` | Generate SAS download URL |
