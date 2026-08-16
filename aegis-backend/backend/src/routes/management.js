const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireGuildPermission } = require('../middleware/permissions');
const discordApi = require('../services/discordApi');

module.exports = function managementRouter() {
  const router = express.Router({ mergeParams: true });

  // GET /api/servers/:guildId/management — live roles/channels/server info,
  // read directly from Discord (never cached/trusted from the frontend).
  router.get('/', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const { guildId } = req.params;
    try {
      const [guild, roles, channels] = await Promise.all([
        discordApi.getGuild(guildId),
        discordApi.getGuildRoles(guildId),
        discordApi.getGuildChannels(guildId),
      ]);

      res.json({
        guildId,
        name: guild.name,
        ownerId: guild.owner_id,
        memberCount: guild.approximate_member_count ?? null,
        roles: roles
          .filter((r) => r.name !== '@everyone')
          .sort((a, b) => b.position - a.position)
          .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions, managed: r.managed })),
        channels: channels
          .sort((a, b) => a.position - b.position)
          .map((c) => ({ id: c.id, name: c.name, type: c.type, position: c.position })),
      });
    } catch (err) {
      console.error('Failed to load management data:', err);
      res.status(502).json({ error: 'Could not load server data from Discord' });
    }
  });

  return router;
};
