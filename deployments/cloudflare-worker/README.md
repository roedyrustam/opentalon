# OpenTalon Cloudflare Worker Deployment

Scale-to-zero serverless AI agent powered by OpenTalon.

## Architecture
- **In-Process Control Plane**: Zero cold-start latency with `@opentalon/core` router.
- **Unified Remote Storage**: Powered by Turso / libSQL Edge Database via HTTP protocol.
- **Dual Gateway**:
  - `POST /v1/chat` -> Standard JSON response (`ServerlessEdgeAdapter`)
  - `POST /v1/stream` -> Server-Sent Events real-time streaming (`SseStreamAdapter`)
  - `GET /health` -> Liveness check

## Quick Start

```bash
# 1. Set secrets
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN

# 2. Local preview
pnpm dev

# 3. Deploy to Edge
pnpm deploy
```
