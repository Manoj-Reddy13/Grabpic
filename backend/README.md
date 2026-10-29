# GrabPic Backend (Node.js)

REST API and business logic service for GrabPic face-matching photo sharing platform.

## Features
- **Event Creation**: Generates unique UUIDs for photo events.
- **Photo Processing & AI Forwarding**: Streams multipart uploads to the AI Service for face detection and embedding indexing.
- **Selfie Search with Pagination**: Forwards selfie photos, maps matches to secure signed URLs, and returns paginated tiered results (`strongMatches` and `weakMatches`).
- **Secure Image Access**: Base64url HMAC-SHA256 signed tokens and Azure Blob Storage SAS URLs.
- **Bulk Photo Download**: Proxies zip download of event photos.
- **Health Checks**: `/health` and `/actuator/health` endpoints.

## Tech Stack
- **Node.js** (v20+)
- **Express 4**
- **Multer** (Memory storage, 200MB file limit)
- **Axios & FormData**
- **@azure/storage-blob**
- **Native Node Test Runner** (`node:test`)

## Getting Started

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Installation
```bash
npm install
```

### Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `8080` |
| `AI_INTERNAL_BASE_URL` | AI service URL for internal API calls | `http://localhost:8000` |
| `AI_PUBLIC_BASE_URL` | AI service public URL for image token URLs | `http://localhost:8000` |
| `USE_BLOB_STORAGE` | Enable Azure Blob SAS token generation | `false` |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage connection string | (empty) |
| `AZURE_CONTAINER_NAME` | Container name for event images | `events` |
| `IMAGE_TOKEN_SECRET` | Secret key for signing image access tokens | `defaultSecretKeyForTokensIfEnvMissing` |

### Running Locally
```bash
# Production mode
npm start

# Development mode (with auto-reload on file change)
npm run dev
```

### Running Tests
```bash
npm test
```

## Docker
Build and run the backend container:
```bash
docker build -t grabpic-backend .
docker run -p 8080:8080 grabpic-backend
```
