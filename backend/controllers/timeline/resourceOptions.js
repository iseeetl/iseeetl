module.exports = Object.freeze({
  errors: {
    user: { code: 'TOKEN_INVALID' },
    room: { code: 'NOT_FOUND' },
    floor: { code: 'NOT_FOUND' },
    kicked: { code: 'FORBIDDEN' },
    permission: { code: 'FORBIDDEN' },
    post: { code: 'NOT_FOUND' },
    reply: { code: 'NOT_FOUND' },
    conflict: { code: 'CONFLICT' },
  },
  requireContentOrMedia: true,
});
