const jwt = require('jsonwebtoken');
const { dbQuery } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'JWT_SUPER_SECRET_KEY_123';
// C-1 FIX: In production always set JWT_SECRET as an environment variable.
// The fallback string is acceptable for local dev but will log a warning.
if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY WARNING] JWT_SECRET is not set as an environment variable. Using default dev secret. Set JWT_SECRET in production!');
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch user details to verify if still approved and not blocked
    const user = await dbQuery.get('SELECT id, username, role, status, is_blocked, branch_name FROM users WHERE id = ?', [decoded.id]);
    
    if (!user) {
      return res.status(403).json({ error: 'User no longer exists' });
    }

    if (user.is_blocked === 1) {
      return res.status(403).json({ error: 'Your account has been blocked by the admin' });
    }

    if (user.status !== 'approved') {
      return res.status(403).json({ error: `Account is inactive. Current status: ${user.status}` });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Administrators only' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  JWT_SECRET
};
