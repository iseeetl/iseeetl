const { drainOnce } = require('./materialize');
const { deliverOnce } = require('./push');
function startActivityWorker({ server, logger = console } = {}) {
  if (process.env.ACTIVITY_NOTIFICATIONS_ENABLED !== 'true') return () => {};
  let busy = false, stopped = false;
  const tick = async () => {
    if (busy || stopped) return; busy = true;
    try { await drainOnce(); if (!stopped) await deliverOnce(); }
    catch { logger.warn('[ACTIVITY] retryable processing failure; pending records retained'); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, 2000); timer.unref(); void tick();
  const stop = () => { stopped = true; clearInterval(timer); };
  server?.once('close', stop);
  return stop;
}
module.exports = { startActivityWorker };
