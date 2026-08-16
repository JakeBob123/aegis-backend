const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireGuildPermission } = require('../middleware/permissions');
const prisma = require('../db/client');

module.exports = function logsRouter() {
  const router = express.Router({ mergeParams: true });

  // GET /api/servers/:guildId/logs?category=MODERATION&actorId=...&targetId=...&since=...&cursor=...
  router.get('/', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const { guildId } = req.params;
    const { category, actorId, targetId, since, until, cursor, limit } = req.query;

    const where = {
      guildId,
      ...(category ? { category: String(category) } : {}),
      ...(actorId ? { actorId: String(actorId) } : {}),
      ...(targetId ? { targetId: String(targetId) } : {}),
      ...(since || until
        ? {
            createdAt: {
              ...(since ? { gte: new Date(String(since)) } : {}),
              ...(until ? { lte: new Date(String(until)) } : {}),
            },
          }
        : {}),
    };

    const take = Math.min(Number(limit) || 50, 200);
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: String(cursor) } } : {}),
    });

    res.json({
      logs,
      nextCursor: logs.length === take ? logs[logs.length - 1].id : null,
    });
  });

  return router;
};
