const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const { EVENTS } = require('../../../shared/constants');

/**
 * Both WebSocket endpoints now live on the SAME HTTP server as the REST
 * API, distinguished by path — /internal-ws for the bot, /public-ws for
 * dashboard clients. This is required for single-port hosts (Render,
 * Railway, Fly, most PaaS free tiers all expose exactly one public port
 * per service) but it's the right design regardless of host: one process,
 * one listening socket, path-based routing.
 *
 * The trust boundary between the two is unchanged — internal connections
 * still require the shared-secret header and should still be treated as a
 * private channel (see docs/ARCHITECTURE.md); putting them on one port
 * doesn't blur that, `noServer: true` + manual routing keeps them fully
 * separate WebSocketServer instances with independent auth.
 */
function createWsHub({ prisma, httpServer }) {
  let botSocket = null;
  const pendingRequests = new Map();
  const dashboardSubscriptions = new Map();

  const internalWss = new WebSocketServer({ noServer: true });
  const publicWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://internal');

    if (pathname === '/internal-ws') {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_WS_SHARED_SECRET) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      internalWss.handleUpgrade(req, socket, head, (ws) => internalWss.emit('connection', ws, req));
      return;
    }

    if (pathname === '/public-ws') {
      publicWss.handleUpgrade(req, socket, head, (ws) => publicWss.emit('connection', ws, req));
      return;
    }

    socket.destroy();
  });

  internalWss.on('connection', (ws) => {
    console.log('[internal-ws] bot connected');
    botSocket = ws;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'response' && msg.requestId && pendingRequests.has(msg.requestId)) {
        const { resolve, timeout } = pendingRequests.get(msg.requestId);
        clearTimeout(timeout);
        pendingRequests.delete(msg.requestId);
        resolve(msg.payload);
        return;
      }

      if (msg.type === 'event') {
        handleBotEvent(msg.event, msg.guildId, msg.payload);
      }
    });

    ws.on('close', () => {
      console.log('[internal-ws] bot disconnected');
      botSocket = null;
    });
  });

  publicWss.on('connection', (ws) => {
    dashboardSubscriptions.set(ws, new Set());

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'subscribe' && msg.guildId && msg.authorizedGuildIds?.includes(msg.guildId)) {
        dashboardSubscriptions.get(ws).add(msg.guildId);
      }
      if (msg.type === 'unsubscribe' && msg.guildId) {
        dashboardSubscriptions.get(ws).delete(msg.guildId);
      }
    });

    ws.on('close', () => dashboardSubscriptions.delete(ws));
  });

  function broadcastToGuild(guildId, event, payload) {
    for (const [ws, guildIds] of dashboardSubscriptions.entries()) {
      if (guildIds.has(guildId) && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'event', event, guildId, payload }));
      }
    }
  }

  function sendAction(guildId, action, payload, { timeoutMs = 8000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!botSocket || botSocket.readyState !== botSocket.OPEN) {
        return reject(new Error('Bot is not connected'));
      }
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Bot did not respond in time'));
      }, timeoutMs);
      pendingRequests.set(requestId, { resolve, reject, timeout });
      botSocket.send(JSON.stringify({ type: 'action', requestId, guildId, action, payload }));
    });
  }

  async function handleBotEvent(event, guildId, payload) {
    if (event === EVENTS.RAID_DETECTED || event === EVENTS.NUKE_ATTEMPT_BLOCKED) {
      await prisma.auditLog.create({
        data: {
          guildId,
          category: 'SECURITY',
          action: event,
          actorType: 'BOT',
          metadata: payload,
        },
      });
    }
    broadcastToGuild(guildId, event, payload);
  }

  return { sendAction, broadcastToGuild, isBotConnected: () => !!botSocket };
}

module.exports = { createWsHub };
