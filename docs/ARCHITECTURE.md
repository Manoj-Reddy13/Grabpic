# GrabPic Architecture

## Overview

GrabPic follows a three-tier microservices architecture:
- **Frontend**: React 19 + Vite (Retro Cyberpunk Photo Lab design)
- **Backend**: Node.js (Express 4) + SQLite persistence with relational constraints & WAL mode
- **AI Service**: FastAPI / Python 3.12 (InsightFace, FAISS, EmotionDetector, SceneClassifier, NLQueryParser)

Images are stored in Azure Blob Storage (or local storage), and served via signed tokens or Azure Blob SAS URLs.

## System Map

```text
User → Frontend (React 19 + Vite)
         │
         ▼
       Backend (Node.js Express + SQLite)
         │                    │
         │                    ├─ SQLite Relational DB (Users, Events, Likes, Comments,
         │                    │                       Collaborators, Notifications, Audit)
         │                    │
         ▼                    ▼
    AI Service (FastAPI) ─── Azure Blob Storage (Original Event Photos)
         │
         ├─ Face Detection (InsightFace Buffalo_L)
         ├─ Group Photo Detection & Bounding Boxes
         ├─ Facial Expression Classifier (5 categories)
         ├─ Scene Recognition (10 categories)
         ├─ Natural Language Query Parser
         └─ FAISS Vector Similarity Indexes
```

## Service Responsibilities

### Frontend (`grabpic-frontend`)
- Event creation and sharing
- Multi-selfie upload and face fusion search
- Natural language photo search and preset query chips
- Multi-facet filters (Scene, Expression, Group/Solo)
- In-App Notifications Center (with unread badge & preferences)
- Collaborative album management (invite by email, role assignments)
- Real-time photo likes and interactive comments drawer
- AI Insights dashboard (group photo counts, scene & expression distributions)
- Biometric privacy consent controls

### Backend (`backend`)
- Event lifecycle and access control
- Role-Based Access Control (RBAC): `owner`, `admin`, `photographer`, `viewer`
- Social layer: Likes (with unique constraint per user/photo) and comments (with moderation)
- Collaborative album management & activity audit logs
- In-app notification center & deduplication engine
- Biometric profile registration & consent records
- Orchestration with AI Service and Azure Blob Storage
- Secure signed token generation & URL signing

### AI Service (`ai-service`)
- Face detection (InsightFace) supporting group photos with bounding box extraction
- Multi-face embedding extraction (512-dim ArcFace vectors)
- Facial expression classification:
  - *Happy / Smiling*, *Neutral*, *Surprised*, *Sad*, *Angry*
- Scene recognition:
  - *Stage*, *Audience*, *Group Photo*, *Outdoor*, *Indoor*, *Food*, *Ceremony*, *Sports*, *Decoration*, *Selfie*
- Natural language query parser converting human text into structured filter conditions
- FAISS cosine similarity vector search
- Guest face profile matching for automated notifications

---

## Database Schema (SQLite Migrations)

- **`users`**: `id`, `email`, `name`, `avatar_url`, `created_at`
- **`events`**: `id`, `title`, `description`, `owner_id`, `created_at`, `expires_at`
- **`event_collaborators`**: `id`, `event_id`, `user_id`, `user_email`, `role`, `status`, `created_at`
- **`photos`**: `id`, `event_id`, `uploaded_by`, `face_count`, `scenes_json`, `expressions_json`, `metadata_json`, `created_at`
- **`photo_likes`**: `id`, `photo_id`, `event_id`, `user_id`, `created_at`, `UNIQUE(photo_id, user_id)`
- **`photo_comments`**: `id`, `photo_id`, `event_id`, `user_id`, `user_name`, `comment_text`, `created_at`, `updated_at`
- **`activity_logs`**: `id`, `event_id`, `user_id`, `user_name`, `action`, `details_json`, `created_at`
- **`guest_profiles`**: `id`, `event_id`, `user_id`, `name`, `email`, `embedding_json`, `consent_given`, `created_at`
- **`notifications`**: `id`, `user_id`, `event_id`, `title`, `message`, `data_json`, `is_read`, `created_at`
- **`user_preferences`**: `user_id`, `preferences_json`, `updated_at`

---

## Security & Biometric Privacy

1. **Explicit Biometric Consent**: Guests must provide consent before facial features/selfies are processed.
2. **Data Erasure**: Guests can delete registered selfies and face embeddings at any time (`DELETE /events/:eventId/register-profile`).
3. **Role-Based Access Control**:
   - `owner` / `admin`: Full album management, collaborator invitation, comment moderation.
   - `photographer`: Can upload event photos.
   - `viewer`: Can search, view, like, and comment on photos.
4. **Link Expiration & Access**:
   - Azure Blob SAS URLs valid for 10 minutes.
   - Fallback AI service signed tokens valid for 24 hours.
   - Events and local image indexes auto-expire after 24 hours.
