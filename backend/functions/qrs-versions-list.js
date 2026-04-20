const { respond } = require('./shared/cors');
const { getQrByUser, listQrVersions } = require('./shared/repo/appTable');

/**
 * GET /qrs/{qrId}/versions — list versions newest-first. Only the owner may
 * list. Soft-deleted QRs are still queryable so users can restore history.
 */
exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: 'Unauthorized' });

  const qrId = event.pathParameters?.qrId;
  if (!qrId) return respond(400, { error: '"qrId" path parameter is required' });

  try {
    const owner = await getQrByUser(userId, qrId);
    if (!owner) return respond(404, { error: 'QR code not found' });

    const versions = await listQrVersions(qrId, 100);
    const items = versions.map((v) => ({
      version: v.version,
      versionedAt: v.versionedAt,
      ...(v.note && { note: v.note }),
    }));

    return respond(200, { items });
  } catch (err) {
    console.error('qrs-versions-list error:', err);
    return respond(500, { error: 'Failed to list versions' });
  }
};
