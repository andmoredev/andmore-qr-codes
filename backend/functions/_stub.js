/**
 * Stub handler for foundation routes. Every new route in the SAM template
 * points here until a feature PR replaces it with a real handler.
 *
 * Feature PRs: remove the relevant Event from AuthStubFunction or PublicStubFunction
 * in template.yaml and add a new AWS::Serverless::Function with your real handler.
 */
const { respond } = require('./shared/cors');

exports.handler = async (event) => {
  return respond(501, {
    error: 'Not implemented',
    route: `${event.httpMethod ?? 'UNKNOWN'} ${event.resource ?? event.path ?? '?'}`,
    message: 'This route is scaffolded but has no implementation yet.',
  });
};
