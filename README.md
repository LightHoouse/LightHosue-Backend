# Lighthouse Backend 🔦

A lab support API that connects recorded steps, student questions, and desktop guidance.

[Desktop app](https://github.com/LightHoouse/LightHouse-App) · [AI service](https://github.com/LightHoouse/LightHouse-AI) · [Live health](https://lighthouse-api.198.185.150.122.sslip.io/health) · [Organization](https://github.com/LightHoouse)

![CI/CD](https://github.com/LightHoouse/LightHosue-Backend/actions/workflows/ci.yml/badge.svg)

## What it includes

- MongoDB persistence for recorded steps, snapshots, commands, and acknowledgments.
- A guide-only MQTT gateway with TLS verification and per-student topics.
- Bearer authentication on every endpoint except the public liveness check.
- An optional HTTP gateway to the Python AI service.
- Container builds and automatic Coolify deployment after verification.

**Prototype status:** the backend is deployed with MongoDB and MQTT connected. AI deployment is deferred. Per-student authorization, loading MongoDB recordings into AI retrieval, and automatic answer-to-command orchestration are not implemented. Use the API token as a service credential, not as a shared token embedded in student installers.

## Stack

Node.js 22+ · TypeScript · native Node HTTP · MongoDB · MQTT.js · Zod · Docker · Coolify

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | Liveness and connection flags |
| GET | `/health/detailed` | Bearer | MongoDB, MQTT, and AI availability |
| POST | `/steps` | Bearer | Store a recorded step |
| POST | `/snapshots` | Bearer | Store a snapshot |
| POST | `/answer` | Bearer | Forward a snapshot to the AI service |
| POST | `/commands` | Bearer | Validate, store, and publish a guide command |

Send `Authorization: Bearer <API_TOKEN>` on protected routes. Missing storage returns an error rather than reporting a successful write. With no `LAB_AI_URL`, `/answer` returns `503 ai_not_configured`. `/answer` does not publish its response automatically.

Typed-text fields are removed on step/snapshot storage, but this is not comprehensive personal-data redaction. Clients must redact screen text and screenshots before submission. AI inputs need redaction before forwarding too.

## Local setup

```powershell
npm ci
Copy-Item .env.example .env
# Fill .env with your development service configuration.
npm run build
node --env-file=.env dist/index.js
```

`npm run dev` watches TypeScript and reads the process environment; it does not automatically load `.env`.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to 3000 |
| `API_TOKEN` | Bearer credential; at least 32 characters in production |
| `MONGODB_URI` | MongoDB connection string including the database |
| `MQTT_URL` | Broker URL; production requires `mqtts://` |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | Broker credentials |
| `MQTT_CA_CERT` | Optional trusted PEM certificate for a private broker |
| `LAB_AI_URL` | Optional AI service URL; leave unset until available |
| `NODE_ENV` | Set to `production` in deployment |

Secrets belong in local environment files or runtime secret storage. The app creates indexes at startup, including snapshot retention on `_storedAt`. `mongo-setup.js` is an optional initial schema setup for a new database; it is not an idempotent migration tool.

## Verification

```powershell
npm run check
npm test
```

Tests cover bearer authentication, typed-text redaction, MQTT topic validation, and real HTTP failure responses when dependencies are absent.

## Deployment

Coolify builds the Dockerfile from `master`, listens on port 3000, and checks `/health`. The current service is limited to 512 MiB and one CPU. AI is a separate service and is not deployed with this repository.

GitHub Actions runs tests, publishes a commit-tagged image to GHCR, then triggers Coolify and checks the public endpoint. Set the repository secret `COOLIFY_TOKEN` and variables `COOLIFY_URL`, `COOLIFY_APP_UUID`, and `HEALTH_URL` to enable deployment. Application credentials are configured in Coolify as runtime environment variables, not build arguments.

Windows installers are published by [LightHouse-App](https://github.com/LightHoouse/LightHouse-App/releases); this repository deploys the API service.
