const jwt = require('jsonwebtoken');

/**
 * Verifies the backend-issued JWT (set after a successful Discord OAuth2
 * login). This proves who the caller is; it does NOT by itself prove they
 * can manage any particular guild — that's a separate, per-request check
 * in requireGuildPermission below, because permissions can change at any
 * time and a stale session shouldn't grant stale access.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  // Accept either an Authorization header (mobile/native clients) or the
  // httpOnly session cookie set at login (default for the web dashboard).
  const token = bearer || req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Missing session token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SIGNING_SECRET);
    req.user = { id: payload.sub, discordAccessToken: payload.dat };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { requireAuth };
