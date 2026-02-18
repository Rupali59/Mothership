# PRD: Cloud Adapter Service

## Overview
The **Cloud Adapter Service** (`services/cloud-adapter`) abstracts multi-cloud deployment operations behind a unified API. It supports deploying container images to both AWS and GCP.

| Property | Value |
|---|---|
| **Language** | Go |
| **Port** | 8081 (default) |
| **Providers** | AWS (ECS/ECR), GCP (Cloud Run) |

---

## Core Capabilities

### Unified Deploy API
**Endpoint**: `POST /deploy`

**Request**:
```json
{
  "provider": "aws|gcp",
  "service_name": "my-service",
  "image": "gcr.io/project/image:tag",
  "env": { "KEY": "VALUE" },
  "region": "us-east-1",
  "project_id": "gcp-project",
  "location": "us-central1"
}
```

### Provider Implementations
| Provider | Directory | Factory |
|---|---|---|
| **AWS** | `aws/` | ECS/Fargate deployment |
| **GCP** | `gcp/` | Cloud Run deployment |

Common interface: `provider/` — `CloudProvider.Deploy(ctx, serviceName, image, env) → DeployStatus`

### Health
`GET /health` → `"Cloud Adapter Service Running"`

---

## Status & Roadmap
| Feature | Status |
|---|---|
| AWS deployment | ✅ Implemented |
| GCP Cloud Run deployment | ✅ Implemented |
| Multi-region deploy | 🔲 Planned |
| Blue/green deployments | 🔲 Planned |
| Rollback support | 🔲 Planned |
