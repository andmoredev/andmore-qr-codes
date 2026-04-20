const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

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

module.exports = { CORS_HEADERS, respond, redirect };
