const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const discordApi = require('../services/discordApi');
const prisma = require('../db/client');

const router = express.Router();

// Step 1: frontend redirects the browser here (or builds this URL itself
// from the public DISCORD_CLIENT_ID — either is fine, nothing secret here).
router.get('/discord/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// Step 2: Discord redirects back here with a one-time code.
router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const tokenResponse = await discordApi.exchangeOAuthCode(code);
    const profile = await discordApi.getUserProfile(tokenResponse.access_token);

    // The backend-issued JWT is what the frontend actually uses from here
    // on. It carries the Discord access token internally (short-lived) so
    // we can re-query "which guilds does this user belong to" live, without
    // ever handing that token to the frontend.
    const sessionJwt = jwt.sign(
      { sub: profile.id, dat: tokenResponse.access_token },
      process.env.JWT_SIGNING_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '15m' }
    );

    const refreshToken = crypto.randomBytes(48).toString('hex');
    await prisma.session.create({
      data: {
        userId: profile.id,
        refreshToken,
        expiresAt: new Date(
          Date.now() + Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS || 30) * 86400000
        ),
      },
    });

    await prisma.auditLog.create({
      data: {
        guildId: 'GLOBAL',
        category: 'AUTH',
        action: 'login',
        actorId: profile.id,
        actorType: 'USER',
      },
    }).catch(() => {}); // GLOBAL guild row may not exist — fine to skip logging that edge case here

    // Hand both tokens to the frontend via a redirect with a short-lived
    // fragment, or set httpOnly cookies — cookies are the safer default.
    res.cookie('session', sessionJwt, { httpOnly: true, secure: true, sameSite: 'lax' });
    res.cookie('refresh', refreshToken, { httpOnly: true, secure: true, sameSite: 'lax' });
    res.redirect(process.env.FRONTEND_ORIGIN);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    res.status(502).json({ error: 'Discord authentication failed' });
  }
});

// Which servers can this user manage? Frontend calls this to build its
// server picker. Filtered live — "MANAGE_GUILD" or ownership required.
router.get('/discord/manageable-guilds', async (req, res) => {
  const sessionJwt = req.cookies?.session;
  if (!sessionJwt) return res.status(401).json({ error: 'Not logged in' });

  try {
    const payload = jwt.verify(sessionJwt, process.env.JWT_SIGNING_SECRET);
    const guilds = await discordApi.getUserGuilds(payload.dat);
    const MANAGE_GUILD = 0x20;
    const manageable = guilds.filter(
      (g) => g.owner || (BigInt(g.permissions) & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD)
    );
    res.json({ guilds: manageable.map((g) => ({ id: g.id, name: g.name, icon: g.icon })) });
  } catch (err) {
    res.status(401).json({ error: 'Session invalid or expired' });
  }
});

router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies?.refresh;
  if (refreshToken) {
    await prisma.session.deleteMany({ where: { refreshToken } }).catch(() => {});
  }
  res.clearCookie('session');
  res.clearCookie('refresh');
  res.json({ ok: true });
});

module.exports = router;
