const { publishSocketEvent } = require('./publication');
const logger = require('../utils/logger');

async function notifyAndDisconnect({ event, notify, disconnect, propagateDisconnectError = false }) {
  await publishSocketEvent(event, notify);
  try {
    await disconnect();
  } catch (error) {
    logger.error('[SOCKET] revocation disconnect failed', { event });
    if (propagateDisconnectError) throw error;
  }
}

module.exports = { notifyAndDisconnect };
