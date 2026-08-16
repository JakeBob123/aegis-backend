// Minimal subset of Discord's permission flags, as BigInts, for computing a
// member's *effective* permissions in a guild from their roles. We do this
// ourselves server-side rather than trusting any permission value the
// frontend sends us.
const FLAGS = {
  Administrator: 1n << 3n,
  BanMembers: 1n << 2n,
  KickMembers: 1n << 1n,
  ManageGuild: 1n << 5n,
  ManageMessages: 1n << 13n,
  ModerateMembers: 1n << 40n,
};

/**
 * @param {string[]} memberRoleIds
 * @param {Array<{id: string, permissions: string}>} guildRoles
 * @param {boolean} isOwner
 * @returns {bigint} effective permission bitfield
 */
function computeEffectivePermissions(memberRoleIds, guildRoles, isOwner) {
  if (isOwner) {
    // Owner bypasses role permissions entirely, same as Discord does.
    return Object.values(FLAGS).reduce((acc, f) => acc | f, 0n);
  }
  const roleMap = new Map(guildRoles.map((r) => [r.id, BigInt(r.permissions)]));
  let perms = 0n;
  for (const roleId of memberRoleIds) {
    perms |= roleMap.get(roleId) || 0n;
  }
  return perms;
}

function hasPermission(effectivePerms, flagName) {
  if (effectivePerms & FLAGS.Administrator) return true; // admin implies all
  const flag = FLAGS[flagName];
  if (flag === undefined) throw new Error(`Unknown permission flag: ${flagName}`);
  return (effectivePerms & flag) === flag;
}

module.exports = { FLAGS, computeEffectivePermissions, hasPermission };
