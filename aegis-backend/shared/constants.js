/**
 * Shared between bot and backend so the two sides can never drift apart on
 * action names, event names, or payload shapes. Both packages import this
 * file directly (via a workspace/symlink, or just copy-sync it in CI).
 */

// ---- Actions the backend can send to the bot ----------------------------
const ACTIONS = {
  BAN: 'moderation.ban',
  UNBAN: 'moderation.unban',
  KICK: 'moderation.kick',
  TIMEOUT: 'moderation.timeout',
  REMOVE_TIMEOUT: 'moderation.remove_timeout',
  WARN: 'moderation.warn',
  PURGE: 'moderation.purge',
  SOFTBAN: 'moderation.softban',
  LOCKDOWN_ENABLE: 'security.lockdown_enable',
  LOCKDOWN_DISABLE: 'security.lockdown_disable',
  CONFIG_UPDATE: 'config.update',
  AUTOMOD_RULE_UPDATE: 'automod.rule_update',
};

// ---- Events the bot pushes to the backend (fanned out to dashboards) ----
const EVENTS = {
  ACTION_RESULT: 'action.result',
  RAID_DETECTED: 'security.raid_detected',
  NUKE_ATTEMPT_BLOCKED: 'security.nuke_attempt_blocked',
  MEMBER_JOIN: 'member.join',
  MEMBER_LEAVE: 'member.leave',
  MESSAGE_DELETE: 'log.message_delete',
  MESSAGE_EDIT: 'log.message_edit',
  ROLE_CHANGE: 'log.role_change',
  CHANNEL_CHANGE: 'log.channel_change',
  PERMISSION_CHANGE: 'log.permission_change',
  AUTOMOD_TRIGGER: 'automod.trigger',
  BOT_READY: 'bot.ready',
  BOT_STATUS: 'bot.status',
};

// Discord permission bit flags relevant to gating dashboard actions.
// (Subset — full list lives on discord.js PermissionsBitField.Flags)
const REQUIRED_PERMISSIONS = {
  [ACTIONS.BAN]: 'BanMembers',
  [ACTIONS.UNBAN]: 'BanMembers',
  [ACTIONS.KICK]: 'KickMembers',
  [ACTIONS.TIMEOUT]: 'ModerateMembers',
  [ACTIONS.REMOVE_TIMEOUT]: 'ModerateMembers',
  [ACTIONS.WARN]: 'ModerateMembers',
  [ACTIONS.PURGE]: 'ManageMessages',
  [ACTIONS.SOFTBAN]: 'BanMembers',
  [ACTIONS.LOCKDOWN_ENABLE]: 'Administrator',
  [ACTIONS.LOCKDOWN_DISABLE]: 'Administrator',
  [ACTIONS.CONFIG_UPDATE]: 'ManageGuild',
  [ACTIONS.AUTOMOD_RULE_UPDATE]: 'ManageGuild',
};

module.exports = { ACTIONS, EVENTS, REQUIRED_PERMISSIONS };
