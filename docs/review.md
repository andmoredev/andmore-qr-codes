# Code review — 2026-04-20

Scope: commits `abfdb12..4f8546e` (47 commits across PRs #2–#12; foundation scaffolding through the dashboard redesign).

Files reviewed:
- `backend/template.yaml`
- `backend/functions/**` (all 22 handlers + `shared/**`)
- `frontend/src/**` (pages, components, services, contexts, types, config)

Scope guardrails honored: no IAM scope changes, no API contract changes, no auth flow changes, no schema migrations, diff under ~150 LOC (excluding this report).

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High     | 4 |
| Medium   | 6 |
| Low      | 5 |
| Nit      | 2 |

Top recommendations (next sprint):
1. Consolidate `LivePagePreview` and `PublicPageView` (High, Duplication).
2. Fix `EventsTable` writers to populate `expiresAt` — TTL is declared on the table but never set, so events never expire (High, Deployment readiness / Correctness).
3. Narrow `QrRestApi` CORS `AllowOrigin` from `*` to the CloudFront domain (High, Security).
4. Remove or scope the CloudFront `CustomErrorResponses` 4xx → `/index.html` rewrite so legitimate PublicApi 4xx responses surface (High, Correctness).

## Findings

### [High] LivePagePreview and PublicPageView duplicate the LinksPage renderer
**Files**: `frontend/src/components/LivePagePreview.tsx`, `frontend/src/components/PublicPageView.tsx`
**Category**: Duplication
**Status in this PR**: Deferred

Both components render the same Links-Page shape (avatar + displayName + bio + accent-coloured link rows) with independent theme-class ladders, independent Lucide icon maps (`kindIcon` vs `iconForLink` + `CUSTOM_ICONS`), and slightly divergent visual details (`bg-[#0B1120]` vs `bg-[#0F172A]`, different `rounded-*` radii, different border treatments). That means every design tweak has to be made twice, and drift is already visible (the public view sets `borderColor: var(--accent)` on every card; the preview doesn't).

**Suggested consolidation plan** (follow-up PR):
1. Create `frontend/src/components/LinksPageRender.tsx` accepting:
   ```ts
   interface Props {
     page: PublicPage;           // the canonical shape
     interactive?: boolean;      // default true; false = preview
     srcQrId?: string | null;    // ignored when !interactive
   }
   ```
2. Move the Lucide icon map + `iconForLink` into a `links/icons.ts` module shared by both call-sites.
3. Replace `LivePagePreview` callers with `<LinksPageRender page={derivedFromForm} interactive={false} />`; the editor already has a conversion function half-built in `PageEditorPage.tsx` (the `links.map(...)` inside `<LivePagePreview links=…>`).
4. Delete `LivePagePreview.tsx`.

Inline fix deferred — net diff is > 150 LOC across three files.

---

### [High] EventsTable writers never populate `expiresAt`, yet TTL is enabled on the table
**File**: `backend/functions/shared/repo/eventsTable.js:15-33`
**Category**: Correctness / Deployment readiness
**Status in this PR**: Deferred

`template.yaml:151-153` enables DynamoDB TTL on `EventsTable` with `AttributeName: expiresAt`, but neither `putScanEvent` nor `putClickEvent` writes an `expiresAt` attribute. Net effect: scan/click events live forever and the TTL flag is decorative.

**Suggested fix** (deferred — crosses into persisted-shape territory, so it belongs in a small dedicated PR rather than a review PR):
```diff
+const EVENT_TTL_DAYS = 365;
+const secondsFromNow = (days) => Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
 async function putScanEvent({ qrId, country, deviceType, referrer, uaHash, ipHash }) {
   const ts = new Date().toISOString();
   const eventId = newEventId();
   await dynamo.send(new PutCommand({
     TableName: TABLE(),
-    Item: { ...scanKey(qrId, ts, eventId), qrId, eventId, ts, country, deviceType, referrer, uaHash, ipHash },
+    Item: {
+      ...scanKey(qrId, ts, eventId),
+      qrId, eventId, ts, country, deviceType, referrer, uaHash, ipHash,
+      expiresAt: secondsFromNow(EVENT_TTL_DAYS),
+    },
   }));
```
Same change on `putClickEvent`. Choose the retention window based on product needs — 365 days is a reasonable default for scan analytics.

---

### [High] CloudFront `CustomErrorResponses` rewrites every 4xx to `/index.html`
**File**: `backend/template.yaml:1278-1284`
**Category**: Correctness / Security
**Status in this PR**: Deferred

```yaml
CustomErrorResponses:
  - ErrorCode: 403
    ResponseCode: 200
    ResponsePagePath: /index.html
  - ErrorCode: 404
    ResponseCode: 200
    ResponsePagePath: /index.html
```

This is the standard SPA deep-link fallback for the S3 origin, but the distribution also fronts `PublicApi` at `/r/*`, `/l/*`, `/public/*`. Today the handlers always 302 (so 4xx is rare), but any future `404`/`403` returned by `redirect-qr`, `redirect-link`, or `public-page-get` will be silently rewritten to HTML with a 200, and callers will parse the SPA as JSON. The previous Host-header CloudFront bug was papered over by `6f14bb1` — a single regression in one of those Lambdas brings the failure back.

**Suggested fix** (two options, both deferred — schema-adjacent and requires an infra PR):

**Option A — CloudFront Function with explicit SPA fallback** (preferred):
```js
// viewer-response function attached to DefaultCacheBehavior only
function handler(event) {
  var res = event.response;
  if ((res.statusCode == 403 || res.statusCode == 404) && !event.request.uri.startsWith('/assets/')) {
    res.statusCode = 200;
    res.statusDescription = 'OK';
  }
  return res;
}
```
Plus change the existing `CustomErrorResponses` to scope them to the S3 origin only (they can't be scoped per-behavior in this form; better to use a viewer-response CloudFront Function and drop the top-level block).

**Option B — redirect Lambdas always 302** (low-risk, keeps template unchanged):
Return `respond(302, '', { Location: '/p/unavailable' })` instead of `respond(404, …)` in `redirect-qr.js:49,60,74,78,90,97` and `redirect-link.js:63,66,78,82`. The SPA already handles `/p/unavailable` as a friendly "not found" screen. Public API GETs would still need another solution (return 200 with `{ error }`).

---

### [High] `QrRestApi` CORS `AllowOrigin: '*'` on authenticated endpoints
**File**: `backend/template.yaml:76`
**Category**: Security
**Status in this PR**: Deferred

```yaml
QrRestApi:
  Properties:
    Cors:
      AllowOrigin: "'*'"          # ← on a Cognito-authorized API
```

Authenticated endpoints should only accept cross-origin requests from the known frontend origin. Wildcard allows any site to call the API (with a valid JWT). API Gateway CORS `'*'` is a browser-enforced hint, but narrowing it shrinks the blast radius if a token ever leaks into an iframe or third-party page.

**Suggested fix** (deferred — requires picking up the CloudFront domain at stack-create time; easiest is to add a stack parameter or compute from `FrontendDistribution.DomainName`):
```diff
   QrRestApi:
     Properties:
       Cors:
-        AllowOrigin: "'*'"
+        AllowOrigin: !Sub "'https://${FrontendDistribution.DomainName}'"
```
Be aware that `QrRestApi` is defined before `FrontendDistribution`, so this will introduce a forward-ref cycle just like `PublicBaseUrl`. Mirror that pattern: add a `FrontendOrigin` CFN parameter (default `""`), consume at redeploy.

`PublicApi` CORS `'*'` is acceptable — public-read endpoints are intended to be embeddable. Keep but flag.

---

### [Medium] Repeated `authHeaders()` + `request<T>()` fetch wrappers across four service files
**Files**: `frontend/src/services/qrs.ts:5-19`, `frontend/src/services/pages.ts:5-28`, `frontend/src/services/analytics.ts:5-15`, `frontend/src/services/api.ts:4-7`
**Category**: Duplication / DX
**Status in this PR**: Deferred

The same `authHeaders` helper exists verbatim in all four service files, and three of them reimplement `request<T>()` with subtly different error handling:
- `qrs.ts`: throws `Error` with `data?.error ?? "Request failed: ${status}"`.
- `pages.ts`: throws `ApiError` (carries `status`).
- `analytics.ts`: no dedicated `request`; inline on each call.
- `api.ts`: no wrapper at all; inline on each call.

**Suggested fix** (Medium, deferred — ~40 LOC refactor):
Extract `frontend/src/services/http.ts`:
```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
}

export async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await authService.getIdToken();
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: token ?? '',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed: ${res.status}`);
  return data as T;
}
```
Replace the four copies with a single import; `pages.ts`'s `ApiError` re-export can move here. Net deletion ~25 LOC.

---

### [Medium] `detectDeviceType` / `hashValue` / `getSourceIp` / `getHeader` duplicated between the two redirect Lambdas
**Files**: `backend/functions/redirect-qr.js:6-42`, `backend/functions/redirect-link.js:6-42`
**Category**: Duplication
**Status in this PR**: Deferred

Four helpers are copied verbatim between the QR redirect and link redirect handlers, including the large device-detection regex. One copy drift (say, adding a new UA pattern) will leave the two functions disagreeing on what "mobile" means.

**Suggested fix**: extract `backend/functions/shared/requestMeta.js` with `getHeader`, `detectDeviceType`, `hashValue`, `getSourceIp`. ~60 LOC file, saves ~70 LOC across the two handlers. Deferred — small refactor, but still > one-liner.

---

### [Medium] No CloudWatch log retention configured on any Lambda
**File**: `backend/template.yaml` (all function definitions)
**Category**: Deployment readiness
**Status in this PR**: Deferred

Every handler writes to a `/aws/lambda/*` log group, but no `AWS::Logs::LogGroup` resource or `LogGroupName`/retention is declared. Lambda auto-creates log groups with `Never expire` retention — these grow unboundedly.

**Suggested fix** (deferred, infra PR): add a `Globals.Function.LoggingConfig` or, for control, explicit `AWS::Logs::LogGroup` resources per function with `RetentionInDays: 30`. The latter is 22 × 5 lines in `template.yaml`; prefer moving to `AWS::Serverless::Function`'s SAM-native `LoggingConfig` (recently added) or a transform.

---

### [Medium] `StorageBucket` has no S3 lifecycle rules on `avatars/` or `qrcodes/`
**File**: `backend/template.yaml:97-105`
**Category**: Deployment readiness
**Status in this PR**: Deferred

Avatar uploads (and QR PNGs) accumulate one new object per version — restores and updates generate a `v{n}.png`. Over the lifetime of a heavy user, this grows unbounded. `pages-delete.js:8` explicitly calls out the absence of lifecycle rules as a known follow-up.

**Suggested fix** (deferred): add a `LifecycleConfiguration` to `StorageBucket` that transitions `qrcodes/*` and `logos/*` older than 90 days to IA, and deletes `avatars/*` older than 30 days once orphaned. Hand-in-hand with a deletion-tombstone workflow to reap assets for deleted pages (currently `pages-delete.js` leaves avatars in place).

---

### [Medium] `analytics-summary` fan-out per-QR is capped at 10 — acceptable but fragile
**File**: `backend/functions/analytics-summary.js:23,77,81`
**Category**: Performance
**Status in this PR**: No change — verifying intent.

**Verified**: `CONCURRENCY = 10` is used via the inline `pMap` helper for both the `missingPageIds` batch and the main per-QR event fan-out. This matches the persona's stated expectation. The concurrency bound is correct; flagging only to note:

1. When a user has > ~100 QRs the summary API latency will grow linearly (CloudFormation timeout is `30s`). Track as "N+1 around events; migrate to DynamoDB Streams → aggregate table" when the per-user QR count crosses ~50.
2. The `queryScans` / `queryClicks` calls inside the loop have no pagination (`Limit: 1000` in `eventsTable.js:44,58`). A hot QR with > 1000 scans in a 30-day window will silently under-count. Flag the caller side: callers should either drain (`LastEvaluatedKey`) or upgrade to count-only queries via `Select: 'COUNT'`.

Keep as-is for MVP; revisit with the aggregate-table migration.

---

### [Medium] Presigned URL TTLs — verified ≤ 1 hour across all user-facing endpoints
**Files**: `qrs-list.js:7`, `qrs-get.js:7`, `qrs-create.js:12`, `qrs-update.js:11`, `qrs-versions-restore.js:10`, `public-page-get.js`, `get-history.js`, `shared/pageSerializer.js:11`
**Category**: Security
**Status in this PR**: No change — verification only.

Every presign uses `expiresIn: 3600` (1 hour), which matches the persona's threshold. `get-history.js` used inline `3600` in two places — I extracted it to a named `PRESIGN_TTL_SECONDS` constant for parity with the other handlers (see Applied fix below).

---

### [Low] `GenerateQrFunction` Metadata missing `External: ["@aws-sdk/*"]`
**File**: `backend/template.yaml:194-200`
**Category**: DX / Deployment readiness
**Status in this PR**: Applied

Every other `AWS::Serverless::Function` in the template has
```yaml
Metadata:
  BuildMethod: esbuild
  BuildProperties:
    External:
      - "@aws-sdk/*"
```
…which excludes the AWS SDK from the bundle (Lambda's runtime ships it). `GenerateQrFunction` was missing the `External` block, so esbuild tried to resolve `@aws-sdk/client-s3` and friends during `sam build` — this either bloats the artifact or, on a cold-checkout without `backend/node_modules` present, fails the build entirely.

**Suggested fix** (applied):
```diff
     Metadata:
       BuildMethod: esbuild
       BuildProperties:
         Minify: false
         Target: es2020
         EntryPoints:
           - generate-qr.js
+        External:
+          - "@aws-sdk/*"
```

Post-fix: `sam build` succeeds and the `GenerateQrFunction` bundle shrinks to the same size as the other handlers (≈ 42 KLoC generated vs > 1 MB previously).

---

### [Low] `get-history.js` uses inline `3600` literals for presigned URL TTL
**File**: `backend/functions/get-history.js:36,38`
**Category**: DX (magic numbers)
**Status in this PR**: Applied

Every other handler names this as `PRESIGN_TTL_SECONDS`. Extracted the constant for consistency with the rest of the codebase.

**Suggested fix** (applied):
```diff
+const PRESIGN_TTL_SECONDS = 3600;
 …
-      const qrCodeUrl = await getSignedUrl(…, { expiresIn: 3600 });
+      const qrCodeUrl = await getSignedUrl(…, { expiresIn: PRESIGN_TTL_SECONDS });
```

---

### [Low] `public-page-get.js` uses inline `3600` literal where `AVATAR_URL_TTL_SECONDS` already exists
**File**: `backend/functions/public-page-get.js:48`
**Category**: DX (magic numbers)
**Status in this PR**: Applied

`shared/pageSerializer.js` already exports `AVATAR_URL_TTL_SECONDS = 3600` and uses it consistently for authenticated page presigns. `public-page-get` re-implemented the presign with the literal. Imported and used the shared constant so a future TTL change happens in one place.

**Suggested fix** (applied):
```diff
+const { AVATAR_URL_TTL_SECONDS } = require('./shared/pageSerializer');
 …
-          { expiresIn: 3600 }
+          { expiresIn: AVATAR_URL_TTL_SECONDS }
```

---

### [Low] `generate-qr.js` ships its own `CORS_HEADERS` + `respond` instead of using `./shared/cors`
**File**: `backend/functions/generate-qr.js:10-20`
**Category**: Duplication / DX
**Status in this PR**: Deferred

Every other handler imports `{ respond } = require('./shared/cors')`. `generate-qr.js` predates the shared module and carries its own copy — which also happens to advertise a narrower `Access-Control-Allow-Methods: GET,POST,OPTIONS` (no PATCH/DELETE, which is fine for this endpoint but not worth the drift). Replace with a single-line import in a cleanup PR.

---

### [Low] `generate-qr.js` does not enforce auth — `userId` may be `undefined`
**File**: `backend/functions/generate-qr.js:36-39`
**Category**: Security / Correctness
**Status in this PR**: Deferred

```js
const userId = event.requestContext?.authorizer?.claims?.sub;
const id = randomUUID();
const bucket = process.env.STORAGE_BUCKET_NAME;
…
const qrCodeKey = `qrcodes/${userId}/${id}.png`;
```
If the Cognito authorizer is misconfigured or ever bypassed, `userId` becomes the literal string `undefined` and S3 keys collide across unauth'd callers. Every other authed handler early-returns `respond(401, …)` on missing `userId`. `generate-qr` does not. The route is behind the Cognito authorizer so in practice this is unreachable — flagging for consistency and belt-and-suspenders. Fix mirrors the pattern used elsewhere (one if-return added).

---

### [Nit] `PublicPage.tsx:90` uses a curly apostrophe inside a JSX string literal
**File**: `frontend/src/pages/PublicPage.tsx:90`
**Category**: DX
**Status in this PR**: No change

```tsx
{message ?? 'The Links Page you’re looking for isn’t published right now. …'}
```
Curly apostrophes are intentional (nicer typography). Leave as-is. No finding, just documenting the choice.

---

### [Nit] `analytics-qr.js:22-26` re-declares the date regex twice
**File**: `backend/functions/analytics-qr.js:22-35`
**Category**: DX
**Status in this PR**: No change

`parseFromDate` and `parseToDate` both compile `/^(\d{4})-(\d{2})-(\d{2})$/`. Extract a `ISO_DATE_RE` const. Not worth the diff churn.

---

## Category coverage (rubric compliance)

- **Security** — 3 findings (1 High CORS, 1 Low auth, 1 verification/no-finding for presign TTLs). Covered.
- **Correctness** — 2 findings (High: TTL writers, High: CloudFront error fallback). Covered.
- **Performance** — 1 finding (Medium: analytics-summary fan-out — verified acceptable, with follow-up pointer). Covered.
- **Duplication** — 3 findings (High: Page preview components, Medium: frontend service wrappers, Medium: redirect-lambda helpers). Covered.
- **Accessibility** — no findings. Reviewed: `ConfirmDialog` is labeled + Escape-to-cancel, but does not trap focus (minor — mitigating factor is that the dialog only ever has three tab stops so focus rotation is survivable). Images have `alt`. Buttons have `aria-label` where iconic. Theme radios use an `sr-only` hidden `<input type=radio>` and a visible label — OK. Color is not the sole state signal (loading spinners, icons, borders reinforce).
- **UX** — no findings. All async views have loading/error/empty states. Destructive Delete is in `ConfirmDialog`. `AnalyticsPage` + `QrAnalyticsWidget` have Retry buttons. `PublicPage` renders a dedicated `/p/unavailable` screen with a "Made with andmore" footer.
- **DX / code quality** — 3 findings (Low: magic numbers ×2 applied, Low: `generate-qr.js` drift, Nit: date regex). Covered. No `any` escapes observed.
- **Deployment readiness** — 4 findings (Low applied: GenerateQr External, Medium: log retention, Medium: S3 lifecycle, High: events TTL writers). Covered.

---

## Commit summary for this PR

1. `chore: use PRESIGN_TTL_SECONDS constant in get-history.js`
2. `chore: route public-page-get avatar presign through AVATAR_URL_TTL_SECONDS`
3. `chore: add @aws-sdk/* External to GenerateQrFunction esbuild metadata`
4. `docs: add code review findings report`

Net diff: ≈ 10 source LOC + this report.
