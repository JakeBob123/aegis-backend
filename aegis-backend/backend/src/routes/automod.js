const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { requireGuildPermission } = require('../middleware/permissions');
const prisma = require('../db/client');
const { ACTIONS } = require('../../../shared/constants');

module.exports = function automodRouter(wsHub) {
  const router = express.Router({ mergeParams: true });

  router.get('/', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const { guildId } = req.params;
    const [config, rules] = await Promise.all([
      prisma.automodConfig.findUnique({ where: { guildId } }),
      prisma.automodRule.findMany({ where: { guildId } }),
    ]);
    res.json({ config, rules });
  });

  const configSchema = z
    .object({
      spamDetectionEnabled: z.boolean(),
      floodDetectionEnabled: z.boolean(),
      mentionSpamEnabled: z.boolean(),
      mentionSpamLimit: z.number().int().min(1),
      linkFilterEnabled: z.boolean(),
      inviteFilterEnabled: z.boolean(),
      wordFilterEnabled: z.boolean(),
      capsFilterEnabled: z.boolean(),
      capsPercentThreshold: z.number().int().min(1).max(100),
      emojiSpamEnabled: z.boolean(),
      emojiSpamLimit: z.number().int().min(1),
      duplicateMessageEnabled: z.boolean(),
    })
    .partial();

  router.patch('/', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid config', details: parsed.error.issues });

    const { guildId } = req.params;
    const config = await prisma.automodConfig.upsert({
      where: { guildId },
      update: parsed.data,
      create: { guildId, ...parsed.data },
    });

    await wsHub.sendAction(guildId, ACTIONS.CONFIG_UPDATE, { automodConfig: config }).catch((err) => {
      console.warn('Bot did not ack automod config push:', err.message);
    });

    await prisma.auditLog.create({
      data: { guildId, category: 'CONFIG', action: 'automod_config_update', actorId: req.user.id, actorType: 'USER', metadata: parsed.data },
    });
    wsHub.broadcastToGuild(guildId, 'config.automod_updated', config);
    res.json({ config });
  });

  const ruleSchema = z.object({
    type: z.enum(['WORD_FILTER', 'LINK_WHITELIST', 'LINK_BLACKLIST']),
    pattern: z.string().min(1).max(256),
    action: z.enum(['DELETE', 'WARN', 'TIMEOUT', 'KICK', 'BAN']),
    enabled: z.boolean().optional(),
  });

  router.post('/rules', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid rule', details: parsed.error.issues });

    const { guildId } = req.params;
    const rule = await prisma.automodRule.create({ data: { guildId, ...parsed.data } });
    await wsHub.sendAction(guildId, ACTIONS.AUTOMOD_RULE_UPDATE, { rule }).catch(() => {});
    await prisma.auditLog.create({
      data: { guildId, category: 'CONFIG', action: 'automod_rule_create', actorId: req.user.id, actorType: 'USER', metadata: rule },
    });
    wsHub.broadcastToGuild(guildId, 'config.automod_rule_created', rule);
    res.status(201).json({ rule });
  });

  router.delete('/rules/:ruleId', requireAuth, requireGuildPermission('ManageGuild'), async (req, res) => {
    const { guildId, ruleId } = req.params;
    await prisma.automodRule.deleteMany({ where: { id: ruleId, guildId } });
    await prisma.auditLog.create({
      data: { guildId, category: 'CONFIG', action: 'automod_rule_delete', actorId: req.user.id, actorType: 'USER', targetId: ruleId },
    });
    wsHub.broadcastToGuild(guildId, 'config.automod_rule_deleted', { ruleId });
    res.json({ ok: true });
  });

  return router;
};
