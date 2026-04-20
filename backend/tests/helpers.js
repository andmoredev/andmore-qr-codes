/**
 * Shared test helpers.
 *
 * - `assertCors(response)` — verifies the standard CORS headers are present
 *   on a handler's response. Every Lambda response in this codebase (success
 *   or error) is required to carry these.
 * - `authEvent({ userId, body, pathParameters, queryStringParameters, headers })`
 *   — builds a fake API Gateway event with a Cognito authorizer claim. Useful
 *   for authenticated handlers.
 * - `publicEvent({ pathParameters, queryStringParameters, headers })` —
 *   builds a fake API Gateway event with no authorizer. Useful for /r/*, /l/*,
 *   and /public/* handlers.
 * - `setEnv(overrides)` / `restoreEnv()` — scope process.env changes to a test.
 */

const assert = require('node:assert/strict');

function assertCors(response) {
  assert.ok(response && response.headers, 'response must include headers');
  const h = response.headers;
  assert.equal(h['Access-Control-Allow-Origin'], '*', 'missing CORS allow-origin');
  assert.equal(
    h['Access-Control-Allow-Headers'],
    'Content-Type,Authorization',
    'missing CORS allow-headers',
  );
  assert.equal(
    h['Access-Control-Allow-Methods'],
    'GET,POST,PATCH,DELETE,OPTIONS',
    'missing CORS allow-methods',
  );
}

function authEvent({
  userId = 'user-123',
  body,
  pathParameters,
  queryStringParameters,
  headers,
} = {}) {
  return {
    requestContext: { authorizer: { claims: { sub: userId } } },
    body: body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body)),
    pathParameters: pathParameters ?? null,
    queryStringParameters: queryStringParameters ?? null,
    headers: headers ?? {},
  };
}

function publicEvent({
  pathParameters,
  queryStringParameters,
  headers,
  sourceIp,
} = {}) {
  return {
    body: null,
    pathParameters: pathParameters ?? null,
    queryStringParameters: queryStringParameters ?? null,
    headers: headers ?? {},
    requestContext: { identity: { sourceIp: sourceIp ?? '127.0.0.1' } },
  };
}

const _originalEnv = { ...process.env };

function setEnv(overrides) {
  Object.assign(process.env, overrides);
}

function restoreEnv() {
  // Reset env to the snapshot taken when the module loaded, removing any keys
  // the test added.
  for (const key of Object.keys(process.env)) {
    if (!(key in _originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, _originalEnv);
}

module.exports = { assertCors, authEvent, publicEvent, setEnv, restoreEnv };
