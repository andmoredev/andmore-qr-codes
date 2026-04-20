const { randomUUID, randomBytes } = require('crypto');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const shortId = (length = 8) => {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
};

const newQrId = () => shortId(10);
const newPageId = () => shortId(10);
const newEventId = () => randomUUID();

module.exports = { shortId, newQrId, newPageId, newEventId };
