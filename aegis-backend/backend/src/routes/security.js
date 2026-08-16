const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { requireGuildPermission } = require('../middleware/permissions');
const prisma = require('../db/client');
const { ACTIONS } = require('../../../shared/constants');

module.exports = function securityRouter(wsHub) {
  const router = express.Router({ mergeParams: true });

  router.get('/', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const config = await prisma.securityConfig.findUnique({ where: { guildId: req.params.guildId } });
    res.json({ config });
  });

  const updateSchema = z
    .object({
      antiNukeEnabled: z.boolean(),
      antiRaidEnabled: z.boolean(),
      antiMassBanEnabled: z.boolean(),
      antiMassKickEnabled: z.boolean(),
      antiChannelDeleteEnabled: z.boolean(),
      antiChannelCreateEnabled: z.boolean(),
      antiRoleDeleteEnabled: z.boolean(),
      antiRoleCreateEnabled: z.boolean(),
      antiPermissionAbuseEnabled: z.boolean(),
      antiWebhookAbuseEnabled: z.boolean(),
      antiBotAbuseEnabled: z.boolean(),
      joinProtectionEnabled: z.boolean(),
      minAccountAgeMinutes: z.number().int().min(0),
      massActionThreshold: z.number().int().min(1),
      massActionWindowSeconds: z.number().int().min(1),
      raidJoinThreshold: z.number().int().min(1),
      raidJoinWindowSeconds: z.number().int().min(1),
      punishmentAction: z.enum(['QUARANTINE', 'KICK', 'BAN', 'STRIP_ROLES']),
    })
    .partial();

  router.patch('/', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid config', details: parsed.error.issues });

    const { guildId } = req.params;
    const config = await prisma.securityConfig.upsert({
      where: { guildId },
      update: parsed.data,
      create: { guildId, ...parsed.data },
    });

    // Push the live config down to the bot so it takes effect immediately,
    // without waiting for the bot to poll.
    await wsHub.sendAction(guildId, ACTIONS.CONFIG_UPDATE, { securityConfig: config }).catch((err) => {
      console.warn('Bot did not ack config push (it will pick it up on reconnect):', err.message);
    });

    await prisma.auditLog.create({
      data: { guildId, category: 'CONFIG', action: 'security_config_update', actorId: req.user.id, actorType: 'USER', metadata: parsed.data },
    });

    wsHub.broadcastToGuild(guildId, 'config.security_updated', config);
    res.json({ config });
  });

  router.post('/lockdown/enable', requireAuth, requireGuildPermission('Administrator'), async (req, res) => {
    const { guildId } = req.params;
    const result = await wsHub.sendAction(guildId, ACTIONS.LOCKDOWN_ENABLE, { issuedBy: req.user.id });
    await prisma.securityConfig.update({ where: { guildId }, data: { lockdownActive: true } }).catch(() => {});
    await prisma.auditLog.create({
      data: { guildId, category: 'SECURITY', action: 'lockdown_enable', actorId: req.user.id, actorType: 'USER' },
    });
    wsHub.broadcastToGuild(guildId, 'security.lockdown_enabled', {});
    res.json({ ok: true, result });
  });

  router.post('/lockdown/disable', requireAuth, requireGuildPermission('Administrator'), async (req, res) => {
    const { guildId } = req.params;
    const result = await wsHub.sendAction(guildId, ACTIONS.LOCKDOWN_DISABLE, { issuedBy: req.user.id });
    await prisma.securityConfig.update({ where: { guildId }, data: { lockdownActive: false } }).catch(() => {});
    await prisma.auditLog.create({
      data: { guildId, category: 'SECURITY', action: 'lockdown_disable', actorId: req.user.id, actorType: 'USER' },
    });
    wsHub.broadcastToGuild(guildId, 'security.lockdown_disabled', {});
    res.json({ ok: true, result });
  });

  return router;
};
