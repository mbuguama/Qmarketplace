const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/prisma');

async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const claims = verifyToken(token);
    if (process.env.DATABASE_URL) {
      const user = await prisma.user.findUnique({
        where: { id: claims.id },
        select: { id: true, email: true, role: true, status: true }
      });
      if (!user || user.status !== 'active') {
        return res.status(401).json({ message: 'This account is unavailable. Please sign in again.' });
      }
      req.user = { id: user.id, email: user.email, role: user.role };
    } else {
      req.user = claims;
    }
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
    return next(error);
  }
}

function adminRequired(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Administrator access is required.' });
  }
  return next();
}

module.exports = { adminRequired, authRequired };
