# Lighthouse Backend 🔦

A lab support API that connects recorded steps, student questions, and desktop guidance.

[Desktop app](https://github.com/LightHoouse/LightHouse-App) · [AI service](https://github.com/LightHoouse/LightHouse-AI) · [Live health](https://lighthouse-be.yanzz.dev/health) · [Organization](https://github.com/LightHoouse)

![CI/CD](https://github.com/LightHoouse/LightHosue-Backend/actions/workflows/ci.yml/badge.svg)

## What it includes

- MongoDB persistence for recorded steps, snapshots, commands, and acknowledgments.
- A guide-only MQTT gateway with TLS verification and per-student topics.
- Create/join groups with expiring member tokens; only the assistant can record or close a group.
- Scoped live recordings, AI step selection, and student resolution acknowledgments.
- Container builds and automatic Coolify deployment after verification.

The desktop group flow uses HTTPS and member tokens; no service credentials are embedded in installers. AI receives only steps from the authenticated member's selected recording. The legacy MQTT gateway remains available for service integrations.

## Group API

`POST /v1/groups` creates an assistant membership; `POST /v1/join` exchanges a group code for a student membership. Use the returned member token as a Bearer token on all other `/v1` routes.

- `GET /v1/group`: members and recordings in the current group.
- `POST /v1/recordings`: start a recording (assistant only).
- `POST /v1/recordings/:id/steps`: append an idempotent, validated native action; typed values are rejected.
- `POST /v1/recordings/:id/stop`: finish a recording.
- `GET /v1/recordings/:id/steps`: read steps within the member's group.
- `POST /v1/guide`: select a recorded step using AI for questions, or sequential playback without AI.
- `POST /v1/ack`: report whether the live target was resolved; this does not certify task completion.
- `POST /v1/group/close`: revoke access for the group (assistant only).

Groups, memberships, recordings, steps, and acknowledgments expire after seven days. AI questions are limited to 12 per member per minute. Requests never fall back to another group's recordings. Set `LAB_AI_URL` and the private `LAB_AI_TOKEN` to connect the AI service; without a configured service, name-based search remains available for local tests.

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

Coolify builds the Dockerfile at the commit selected by CI, listens on port 3000, and checks `/health`. The current service is limited to 512 MiB and one CPU. AI is a separate service and is not deployed with this repository.

GitHub Actions runs tests, publishes a commit-tagged image to GHCR, then triggers Coolify and checks the public endpoint. Set the repository secret `COOLIFY_TOKEN` and variables `COOLIFY_URL`, `COOLIFY_APP_UUID`, and `HEALTH_URL` to enable deployment. Application credentials are managed only in GitHub Actions secrets: `MONGODB_URI`, `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CA_CERT`, `API_TOKEN`, and `LAB_AI_TOKEN`. `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` provide restricted, host-verified configuration delivery; `DEPLOY_SSH_TARGET` is a repository variable. Optional `LAB_AI_URL` is also a variable. Actions uploads a private runtime JSON file to `/opt/lighthouse/runtime/runtime.json` before deploying the tested commit. Coolify mounts that directory at `/run/lighthouse`; no application credential values are stored in its environment settings or in the Docker image. The SSH key can only invoke `scripts/receive-runtime.py`, not an interactive shell.

Windows installers are published by [LightHouse-App](https://github.com/LightHoouse/LightHouse-App/releases); this repository deploys the API service.

