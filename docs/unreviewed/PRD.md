# PRD: Storage Service

## Overview
The **Storage Service** (`services/storage`) is a lightweight Go microservice that provides S3-compatible object storage with presigned URL management and automatic garbage collection. It abstracts cloud storage operations behind a simple API.

| Property | Value |
|---|---|
| **Language** | Go (Gin framework) |
| **Port** | Configurable via `PORT` env |
| **Database** | MongoDB (file metadata) |
| **Storage Backend** | S3-compatible (AWS S3, MinIO, GCS) |
| **Package** | `github.com/Rupali59/Motherboard-storage-service` |
| **Files** | 8 internal files |

---

## Core Capabilities

### 1. Presigned URL Management
**Handler**: `internal/handlers/presigned.go`

| Operation | Endpoint | Description |
|---|---|---|
| **Upload** | `POST /upload` | Generate presigned PUT URL (15-min TTL) |
| **Download** | `GET /download/:id` | Generate presigned GET URL or return public URL |

**Upload Flow**:
1. Client sends `{ workspaceId, filename, mimeType, access }` 
2. Service generates storage key: `ws_{workspaceId}/assets/{uuid}_{filename}`
3. Creates file metadata record in MongoDB (status: `pending`)
4. Returns `{ fileId, uploadUrl, storageKey }`
5. Client uploads directly to S3 via presigned URL

**Download Flow**:
1. Client requests file by `id` + `workspaceId`
2. If file is public → return cached public URL
3. If file is private → generate presigned GET URL (15-min TTL)
4. Deleted files return 404

### 2. File Metadata
**Model**: `internal/models/file.go`

| Field | Type | Description |
|---|---|---|
| `ID` | ObjectID | Unique file identifier |
| `WorkspaceID` | ObjectID | Owning workspace |
| `Filename` | String | Original filename |
| `MimeType` | String | Content type |
| `StorageKey` | String | S3 object key |
| `Access` | String | `private` \| `public` |
| `Status` | String | `pending` \| `uploaded` \| `marked_deleted` |
| `URL` | String | Public URL (if access=public) |

### 3. S3 Provider
**Implementation**: `internal/storage/s3.go`

- `PresignedPut()` — Generate upload URL
- `PresignedGet()` — Generate download URL
- `PublicURL()` — Construct public CDN URL
- `Delete()` — Remove object from storage

### 4. Garbage Collection
**Module**: `internal/gc/gc.go`

Periodically cleans up:
- Orphaned files (status `pending` for > 24 hours — upload never completed)
- Soft-deleted files past retention period

---

## Environment Variables
| Variable | Purpose |
|---|---|
| `MONGODB_URI` | File metadata storage |
| `S3_BUCKET` | Storage bucket name |
| `S3_REGION` | AWS region |
| `S3_ENDPOINT` | Custom endpoint (MinIO/GCS) |
| `AWS_ACCESS_KEY_ID` | S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `CDN_BASE_URL` | Public file CDN URL |

---

## Status & Roadmap
| Feature | Status |
|---|---|
| Presigned upload/download | ✅ Implemented |
| Public/private access control | ✅ Implemented |
| File metadata in MongoDB | ✅ Implemented |
| Garbage collection | ✅ Implemented |
| Image transformations (resize) | 🔲 Planned |
| Chunked/resumable uploads | 🔲 Planned |
| Virus scanning | 🔲 Planned |
