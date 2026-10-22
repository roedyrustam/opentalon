# OpenTalon Docker Deployment

Run OpenTalon as an isolated local daemon or containerized service.

## Quick Start

```bash
# 1. Set environment variables
export GEMINI_API_KEY="your-gemini-key"

# 2. Build and launch
docker compose up -d

# 3. Check health
curl http://localhost:3100/health

# 4. Send chat turn
curl -X POST http://localhost:3100/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "Calculate 25 * 40"}'
```
