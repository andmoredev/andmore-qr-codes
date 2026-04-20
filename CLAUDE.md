# andmore-qr-codes

QR code generator + LinkTree-style public pages + analytics. Serverless on AWS.

## Layout

```
backend/                       AWS SAM app
├── template.yaml              Infrastructure (two REST APIs, two DynamoDB tables, S3, CloudFront)
├── openapi.yaml               API contract for both APIs
└── functions/                 Lambda handlers (one file per route group) — SAM CodeUri
    ├── <handler>.js
    └── shared/                Shared modules used by every handler (bundled with each fn)
        ├── cors.js            CORS header constant + respond() + redirect() helpers
        ├── ids.js             UUID + short-id helpers
        ├── types.ts           Canonical entity shapes (QrCode, LinkPage, events, versions)
        └── repo/              DynamoDB access helpers; handlers MUST use these
            ├── appTable.js
            └── eventsTable.js

frontend/                      React 18 + TS + Vite + Tailwind
└── src/
    ├── App.tsx                Routes
    ├── pages/                 One component per route
    ├── components/            Shared presentational pieces
    ├── contexts/              AuthContext
    ├── services/              Typed API clients — pages call these, never `fetch` directly
    └── types/                 Mirrors backend/shared/types.ts

.claude/agents/                Specialized subagent personas for parallel execution
```

## Architecture in one page

- Two REST APIs in API Gateway:
  - `QrRestApi` (Cognito-authorized, stage `v1`) for authenticated CRUD on QRs, Pages, and analytics reads.
  - `PublicApi` (no auth) for `/r/{qrId}` scan redirect, `/l/{clickId}` click redirect, `/public/pages/{slug}` public page data.
- Two DynamoDB tables:
  - `AppTable` — single-table for QRs, Pages, version snapshots, slug reservations.
  - `EventsTable` — append-only scan/click events.
- `StorageBucket` S3 bucket with prefixes `qrcodes/`, `logos/`, `avatars/` (versioned per entity).
- CloudFront serves the SPA from `FrontendBucket`; behaviors route `/r/*`, `/l/*`, `/public/*` to `PublicApi`.

## Key conventions

### Backend handlers

```js
const { CORS_HEADERS, respond } = require('./shared/cors');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub; // authed APIs only
  try {
    // ... work ...
    return respond(200, { ok: true });
  } catch (err) {
    console.error('route-name error:', err);
    return respond(500, { error: 'Something went wrong' });
  }
};
```

All responses include `CORS_HEADERS`. Env vars: `APP_TABLE_NAME`, `EVENTS_TABLE_NAME`, `STORAGE_BUCKET_NAME`.

### DynamoDB keys

| Entity            | pk                | sk           |
|-------------------|-------------------|--------------|
| QR code (owner)   | `USER#{userId}`   | `QR#{qrId}`  |
| QR lookup         | `QR#{qrId}`       | `META`       |
| QR version        | `QR#{qrId}`       | `V#{n}`      |
| Links Page        | `USER#{userId}`   | `PAGE#{id}`  |
| Page version      | `PAGE#{pageId}`   | `V#{n}`      |
| Slug reservation  | `SLUG#{slug}`     | `META`       |
| Scan event        | `QR#{qrId}`       | `S#{iso}#{eventId}` (EventsTable) |
| Click event       | `LINK#{qrId}#{k}` | `C#{iso}#{eventId}` (EventsTable) |

Always go through `backend/shared/repo/*.js` — do not hand-roll keys in handlers.

### Frontend data flow

Pages call typed service functions from `frontend/src/services/`. Services wrap `fetch` with `authHeaders()` for authenticated routes. Never call `fetch` directly from a page or component.

### Git workflow

See `~/.claude/CLAUDE.md` for the full workflow. Short version:
- One branch per task, `<type>/<short-desc>`.
- Conventional commit messages.
- Always branch from latest `main`.
- One PR per branch; user reviews and merges.

## Parallel execution with subagents

Four specialized personas live in `.claude/agents/`:
- `backend-engineer` — Lambda + DynamoDB + S3 work.
- `frontend-engineer` — React pages, components, services.
- `infra-architect` — `template.yaml` + `openapi.yaml` + IAM + CloudFront.
- `qa-engineer` — integration tests + smoke scripts.

Each feature slice is launched as an isolated worktree Agent invocation. The foundation PR sets up stable contracts (routes, tables, types, stubs) so feature agents can proceed without blocking each other.

## Local commands

```bash
# Backend
cd backend
sam validate --lint
sam build
sam deploy --guided          # first time only

# Frontend
cd frontend
npm install
npm run dev                  # http://localhost:5173
npm run build                # tsc + vite build
```
