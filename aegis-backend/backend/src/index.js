require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const prisma = require('./db/client');
const { createWsHub } = require('./ws/server');

const authRoutes = require('./routes/auth');
const serversRoutes = require('./routes/servers');
const securityRoutes = require('./routes/security');
const automodRoutes = require('./routes/automod');
const moderationRoutes = require('./routes/moderation');
const logsRoutes = require('./routes/logs');
const managementRoutes = require('./routes/management');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  })
);

// Blanket rate limit; tighten further per-route (esp. moderation actions)
// if needed once you have real traffic patterns.
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// A single HTTP server carries the REST API AND both WebSocket endpoints
// (see ws/server.js) — required for single-port hosts like Render, and
// simpler to run anywhere regardless.
const httpServer = http.createServer(app);
const wsHub = createWsHub({ prisma, httpServer });

app.use('/api/auth', authRoutes);
app.use('/api/servers', serversRoutes(wsHub));
app.use('/api/servers/:guildId/security', securityRoutes(wsHub));
app.use('/api/servers/:guildId/automod', automodRoutes(wsHub));
app.use('/api/servers/:guildId/moderation', moderationRoutes(wsHub));
app.use('/api/servers/:guildId/logs', logsRoutes(wsHub));
app.use('/api/servers/:guildId/management', managementRoutes());

// Used by Render's health checks AND by an uptime pinger if you choose to
// run one — see docs/DEPLOY_RENDER.md for the tradeoffs of that approach.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, botConnected: wsHub.isBotConnected() });
});

// Central error handler — never leak stack traces to the frontend.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Render (and most PaaS hosts) inject PORT — always bind to it rather than
// a hardcoded value, and fall back to 8080 for local dev.
const port = process.env.PORT || 8080;
httpServer.listen(port, () => {
  console.log(`[backend] listening on :${port} (REST + /internal-ws + /public-ws)`);
});
