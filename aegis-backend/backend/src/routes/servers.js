const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireGuildPermission } = require('../middleware/permissions');
const prisma = require('../db/client');

module.exports = function serversRouter(wsHub) {
  const router = express.Router();

  // Full manageable-guild list lives at /api/auth/discord/manageable-guilds
  // (it needs the user's Discord OAuth token, not just a guildId param).
  // This route gives the overview panel data for ONE already-selected guild.
  router.get('/:guildId/overview', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const { guildId } = req.params;
    const [recentEvents, activePunishments, securityConfig] = await Promise.all([
      prisma.auditLog.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.punishment.count({ where: { guildId, active: true } }),
      prisma.securityConfig.findUnique({ where: { guildId } }),
    ]);

    res.json({
      guildId,
      botConnected: wsHub.isBotConnected(),
      lockdownActive: securityConfig?.lockdownActive ?? false,
      activePunishments,
      recentEvents,
    });
  });

  return router;
};
