const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production'
    ? null
    : 'qmarketplace-local-development-secret'
);

if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
  throw new Error('JWT_SECRET must contain at least 32 characters in production.');
}

function signToken(payload) {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, secret);
}

module.exports = { signToken, verifyToken };
