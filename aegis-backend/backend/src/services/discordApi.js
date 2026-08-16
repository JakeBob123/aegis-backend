const fetch = require('node-fetch');

const API_BASE = 'https://discord.com/api/v10';

/**
 * All of these hit Discord directly with the bot token (server-to-server).
 * The frontend's claims about "which servers I manage" or "what my
 * permissions are" are NEVER trusted — this module is the only source of
 * truth the backend acts on.
 */

async function botRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Discord API ${path} failed: ${res.status} ${body}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Exchange an OAuth2 code for a user access token (used only during login). */
async function exchangeOAuthCode(code) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.DISCORD_OAUTH_REDIRECT_URI,
  });
  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) throw new Error(`OAuth2 exchange failed: ${res.status}`);
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

/** Get the logged-in user's own profile, using THEIR token (not the bot's). */
async function getUserProfile(userAccessToken) {
  const res = await fetch(`${API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch user profile: ${res.status}`);
  return res.json();
}

/** Get the guilds the logged-in user belongs to, using THEIR token. */
async function getUserGuilds(userAccessToken) {
  const res = await fetch(`${API_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch user guilds: ${res.status}`);
  return res.json(); // includes `permissions` bitfield per guild
}

/**
 * Server-side re-verification: is the bot actually in this guild, and does
 * this member actually have this permission RIGHT NOW? Called on every
 * privileged action — never relies on a cached/claimed permission.
 */
async function getGuildMember(guildId, userId) {
  return botRequest(`/guilds/${guildId}/members/${userId}`);
}

async function getGuildRoles(guildId) {
  return botRequest(`/guilds/${guildId}/roles`);
}

async function banMember(guildId, userId, reason, deleteMessageSeconds = 0) {
  return botRequest(`/guilds/${guildId}/bans/${userId}`, {
    method: 'PUT',
    headers: { 'X-Audit-Log-Reason': reason || 'No reason provided' },
    body: JSON.stringify({ delete_message_seconds: deleteMessageSeconds }),
  });
}

async function getGuild(guildId) {
  return botRequest(`/guilds/${guildId}?with_counts=true`);
}

async function getGuildChannels(guildId) {
  return botRequest(`/guilds/${guildId}/channels`);
}

module.exports = {
  botRequest,
  exchangeOAuthCode,
  getUserProfile,
  getUserGuilds,
  getGuildMember,
  getGuildRoles,
  getGuild,
  getGuildChannels,
  banMember,
};
