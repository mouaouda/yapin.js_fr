const e = encodeURIComponent;

/** Every Bot API path, so nothing is spelled by hand. `rest.get(Routes.server(id))`. */
export const Routes = Object.freeze({
  me: () => '/me',
  meAvatar: () => '/me/avatar',
  meBanner: () => '/me/banner',
  meStatus: () => '/me/status',
  events: () => '/events',
  commands: () => '/commands',

  servers: () => '/servers',
  server: (id) => `/servers/${e(id)}`,
  serverChannels: (id) => `/servers/${e(id)}/channels`,
  serverCategories: (id) => `/servers/${e(id)}/categories`,
  serverCategory: (id, categoryId) => `/servers/${e(id)}/categories/${e(categoryId)}`,
  serverRoles: (id) => `/servers/${e(id)}/roles`,
  serverMembers: (id) => `/servers/${e(id)}/members`,
  serverMember: (id, userId) => `/servers/${e(id)}/members/${e(userId)}`,
  serverMemberRole: (id, userId, roleId) => `/servers/${e(id)}/members/${e(userId)}/roles/${e(roleId)}`,
  serverKick: (id) => `/servers/${e(id)}/kick`,
  serverBans: (id) => `/servers/${e(id)}/bans`,
  serverBan: (id, userId) => `/servers/${e(id)}/bans/${e(userId)}`,
  serverTimeouts: (id) => `/servers/${e(id)}/timeouts`,
  serverVoice: (id) => `/servers/${e(id)}/voice`,
  serverVoiceMove: (id) => `/servers/${e(id)}/voice/move`,
  serverVoiceDisconnect: (id) => `/servers/${e(id)}/voice/disconnect`,
  serverVoiceJoin: (id) => `/servers/${e(id)}/voice/join`,
  serverVoiceLeave: (id) => `/servers/${e(id)}/voice/leave`,

  channels: () => '/channels',
  channel: (id) => `/channels/${e(id)}`,
  channelMessages: (id) => `/channels/${e(id)}/messages`,
  channelBulkDelete: (id) => `/channels/${e(id)}/messages/bulk-delete`,
  channelMessage: (id, messageId) => `/channels/${e(id)}/messages/${e(messageId)}`,
  channelMessagePin: (id, messageId) => `/channels/${e(id)}/messages/${e(messageId)}/pin`,
  channelMessageReactions: (id, messageId) => `/channels/${e(id)}/messages/${e(messageId)}/reactions`,
  channelMessageReaction: (id, messageId, emoji) => `/channels/${e(id)}/messages/${e(messageId)}/reactions/${e(emoji)}`,

  interactionCallback: (id, token) => `/interactions/${e(id)}/${e(token)}/callback`,

  user: (id) => `/users/${e(id)}`,
  userDM: (id) => `/users/${e(id)}/dm`,
});
