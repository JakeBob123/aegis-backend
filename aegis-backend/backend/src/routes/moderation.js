const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { requireGuildPermission } = require('../middleware/permissions');
const prisma = require('../db/client');
const { ACTIONS } = require('../../../shared/constants');

module.exports = function moderationRouter(wsHub) {
  const router = express.Router({ mergeParams: true });

  const banSchema = z.object({
    userId: z.string().min(1),
    reason: z.string().max(512).optional(),
    deleteMessageSeconds: z.number().int().min(0).max(604800).optional(),
  });

  // POST /api/servers/:guildId/moderation/ban
  // Reference implementation — see README for the full 8-step trace.
  router.post(
    '/ban',
    requireAuth,
    requireGuildPermission('BanMembers'),
    async (req, res) => {
      const parsed = banSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }
      const { userId, reason, deleteMessageSeconds } = parsed.data;
      const { guildId } = req.params;

      try {
        // Forward to the bot over the internal WS and wait for it to
        // actually execute the ban and report back.
        const result = await wsHub.sendAction(guildId, ACTIONS.BAN, {
          userId,
          reason,
          deleteMessageSeconds,
          issuedBy: req.user.id,
        });

        if (!result.success) {
          return res.status(502).json({ error: result.error || 'Bot failed to execute ban' });
        }

        await prisma.$transaction([
          prisma.punishment.create({
            data: {
              guildId,
              userId,
              type: 'BAN',
              reason: reason || null,
              issuedBy: req.user.id,
            },
          }),
          prisma.auditLog.create({
            data: {
              guildId,
              category: 'MODERATION',
              action: 'ban',
              actorId: req.user.id,
              actorType: 'USER',
              targetId: userId,
              reason: reason || null,
            },
          }),
        ]);

        wsHub.broadcastToGuild(guildId, 'moderation.action', {
          type: 'BAN',
          userId,
          issuedBy: req.user.id,
          reason,
        });

        res.json({ ok: true, userId, action: 'BAN' });
      } catch (err) {
        console.error('Ban action failed:', err);
        res.status(502).json({ error: err.message || 'Failed to reach bot' });
      }
    }
  );

  // The remaining actions follow the exact same shape as /ban above:
  // validate -> requireGuildPermission -> wsHub.sendAction -> persist ->
  // broadcast. Stubbed here so the API surface matches the spec; wire each
  // one up the same way as /ban when you're ready for it.
  const stub = (action, permission) => (req, res) =>
    res.status(501).json({
      error: `${action} not yet wired — follow the /ban implementation as a template`,
    });

  router.post('/unban', requireAuth, requireGuildPermission('BanMembers'), stub('unban'));
  router.post('/kick', requireAuth, requireGuildPermission('KickMembers'), stub('kick'));
  router.post('/timeout', requireAuth, requireGuildPermission('ModerateMembers'), stub('timeout'));
  router.post('/warn', requireAuth, requireGuildPermission('ModerateMembers'), stub('warn'));
  router.post('/purge', requireAuth, requireGuildPermission('ManageMessages'), stub('purge'));
  router.post('/softban', requireAuth, requireGuildPermission('BanMembers'), stub('softban'));

  // GET /api/servers/:guildId/moderation/history?userId=...
  router.get('/history', requireAuth, requireGuildPermission('ModerateMembers'), async (req, res) => {
    const { guildId } = req.params;
    const { userId } = req.query;
    const punishments = await prisma.punishment.findMany({
      where: { guildId, ...(userId ? { userId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ punishments });
  });

  return router;
};
