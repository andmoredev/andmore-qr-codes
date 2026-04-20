/**
 * Shared CORS helper.
 *
 * The authenticated `QrRestApi` is tightened via the `AllowedOrigin` CFN
 * parameter (default `"*"`, expected to be set to the CloudFront domain in
 * production). The `PublicApi` intentionally stays wildcard. Each handler's
 * response echoes whatever `ALLOWED_ORIGIN` the Lambda was configured with,
 * falling back to `*` when the env var is unset (which covers legacy or
 * locally-run handlers).
 *
 * `CORS_HEADERS` is retained as a getter so existing `...CORS_HEADERS`
 * spreads in handlers keep working without changes. Each spread re-reads
 * `process.env.ALLOWED_ORIGIN`, so setting it in tests takes effect
 * immediately.
 */

const allowedOrigin = () => process.env.ALLOWED_ORIGIN || '*';

const buildCorsHeaders = () => ({
  'Access-Control-Allow-Origin': allowedOrigin(),
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
});

// Proxy so that `...CORS_HEADERS` in handler code re-evaluates the origin
// at spread time (every response), without any handler edits.
const CORS_HEADERS = new Proxy(
  {},
  {
    ownKeys: () => Reflect.ownKeys(buildCorsHeaders()),
    getOwnPropertyDescriptor: (_target, key) => {
      const headers = buildCorsHeaders();
      if (!(key in headers)) return undefined;
      return {
        value: headers[key],
        enumerable: true,
        configurable: true,
        writable: false,
      };
    },
    get: (_target, key) => buildCorsHeaders()[key],
    has: (_target, key) => key in buildCorsHeaders(),
  },
);

const respond = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extraHeaders },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const redirect = (location, extraHeaders = {}) => ({
  statusCode: 302,
  headers: { Location: location, ...CORS_HEADERS, ...extraHeaders },
  body: '',
});

module.exports = { CORS_HEADERS, respond, redirect, allowedOrigin, buildCorsHeaders };
