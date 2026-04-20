/**
 * Require-cache stubs for modules that do heavy work at load time or need to
 * be swapped out deterministically across tests (QR rendering, avatar upload,
 * signed-URL generation, ID generation).
 *
 * Usage:
 *   const { preloadStubs } = require('./stubs');
 *   preloadStubs({ ids: { newQrId: () => 'qr-fixed' } });
 *   // must require the handler AFTER preloadStubs.
 *   const { handler } = require('../functions/qrs-create');
 *
 * The helper mutates require.cache directly so every subsequent `require`
 * from inside the handler resolves to the stub export. Call `resetStubs()`
 * between tests to clear cached handler modules.
 */

const path = require('node:path');
const Module = require('node:module');

const FUNCTIONS_DIR = path.resolve(__dirname, '..', 'functions');

const stubPaths = {
  qrRender: path.join(FUNCTIONS_DIR, 'shared', 'qrRender.js'),
  ids: path.join(FUNCTIONS_DIR, 'shared', 'ids.js'),
  avatar: path.join(FUNCTIONS_DIR, 'shared', 'avatar.js'),
  presigner: require.resolve('@aws-sdk/s3-request-presigner'),
};

function installCache(stubPath, exportsObj) {
  const mod = new Module(stubPath);
  mod.filename = stubPath;
  mod.loaded = true;
  mod.exports = exportsObj;
  require.cache[stubPath] = mod;
}

function clearCache() {
  // Purge everything under functions/ so handlers re-require with fresh stubs.
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(FUNCTIONS_DIR)) delete require.cache[key];
  }
  for (const p of Object.values(stubPaths)) {
    delete require.cache[p];
  }
}

/**
 * Preload stub modules into require.cache.
 *
 * Recognized keys on `overrides`:
 *   qrRender   — { renderQrPng?, QrRenderValidationError? }
 *   ids        — { newQrId?, newPageId?, newEventId?, shortId? }
 *   avatar     — { uploadAvatar? }
 *   presigner  — { getSignedUrl? } — stubs @aws-sdk/s3-request-presigner
 */
function preloadStubs(overrides = {}) {
  clearCache();

  const qrRenderDefault = {
    renderQrPng: async () => Buffer.from('PNGBYTES'),
    QrRenderValidationError: class QrRenderValidationError extends Error {
      constructor(msg) {
        super(msg);
        this.name = 'QrRenderValidationError';
      }
    },
  };
  installCache(stubPaths.qrRender, { ...qrRenderDefault, ...(overrides.qrRender ?? {}) });

  const idsDefault = {
    shortId: (len = 8) => 'a'.repeat(len),
    newQrId: () => 'qr-fixed00',
    newPageId: () => 'pg-fixed00',
    newEventId: () => '00000000-0000-0000-0000-000000000000',
  };
  installCache(stubPaths.ids, { ...idsDefault, ...(overrides.ids ?? {}) });

  const avatarDefault = {
    uploadAvatar: async ({ userId, pageId, version }) =>
      `avatars/${userId}/${pageId}/v${version}.png`,
  };
  installCache(stubPaths.avatar, { ...avatarDefault, ...(overrides.avatar ?? {}) });

  const presignerDefault = {
    getSignedUrl: async (_client, command) => {
      const key = command?.input?.Key ?? 'unknown';
      return `https://signed.example/${key}`;
    },
  };
  installCache(stubPaths.presigner, { ...presignerDefault, ...(overrides.presigner ?? {}) });
}

function resetStubs() {
  clearCache();
}

module.exports = { preloadStubs, resetStubs, stubPaths };
