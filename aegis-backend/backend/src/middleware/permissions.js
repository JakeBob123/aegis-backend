const discordApi = require('../services/discordApi');
const { computeEffectivePermissions, hasPermission } = require('../services/permissions');

/**
 * Re-verifies, against LIVE Discord data, that req.user actually has
 * `flagName` in the guild named by req.params.guildId. This runs on every
 * privileged request — a valid login session is not enough on its own,
 * because guild roles/membership can change between requests and we never
 * want to act on a stale or forged claim from the frontend.
 *
 * On success, attaches req.guildContext = { guildId, member, effectivePerms }
 * so route handlers don't need to re-fetch it.
 */
function requireGuildPermission(flagName) {
  return async function (req, res, next) {
    const { guildId } = req.params;
    if (!guildId) return res.status(400).json({ error: 'Missing guildId' });

    try {
      // 1. Is the bot even in this guild, and is this user actually a member?
      const member = await discordApi.getGuildMember(guildId, req.user.id).catch((err) => {
        if (err.status === 404) return null;
        throw err;
      });
      if (!member) {
        return res.status(403).json({ error: 'You are not a member of this server' });
      }

      // 2. Compute effective permissions from LIVE role data — never from
      //    anything the client sent us.
      const roles = await discordApi.getGuildRoles(guildId);
      const guild = await discordApi.getGuild(guildId).catch(() => null);
      const isOwner = guild ? guild.owner_id === req.user.id : false;

      const effectivePerms = computeEffectivePermissions(member.roles, roles, isOwner);

      if (!hasPermission(effectivePerms, flagName)) {
        return res.status(403).json({ error: `Missing required permission: ${flagName}` });
      }

      req.guildContext = { guildId, member, effectivePerms };
      next();
    } catch (err) {
      console.error('Permission check failed:', err);
      return res.status(502).json({ error: 'Could not verify permissions with Discord' });
    }
  };
}

module.exports = { requireGuildPermission };
