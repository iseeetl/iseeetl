const defaultLogger = require('../utils/logger');

const pendingTasks = new Set();
const activeControllers = new Set();

const isExpectedAbort = (error, signal) =>
  signal.aborted &&
  (error === signal.reason || error?.name === 'AbortError');

const runBackgroundTask = (label, task, { logger = defaultLogger, context = {}, defer = true } = {}) => {
  if (typeof task !== 'function') throw new TypeError('background task must be a function');

  const controller = new AbortController();
  let resolvePending;
  const pending = new Promise((resolve) => {
    resolvePending = resolve;
  });
  pendingTasks.add(pending);
  activeControllers.add(controller);

  const execute = () => {
    if (controller.signal.aborted) {
      activeControllers.delete(controller);
      pendingTasks.delete(pending);
      resolvePending();
      return Promise.resolve();
    }
    let result;
    try {
      result = task({ signal: controller.signal });
    } catch (error) {
      result = Promise.reject(error);
    }
    const execution = Promise.resolve(result)
      .catch((error) => {
        if (isExpectedAbort(error, controller.signal)) return;
        logger.warn(`[background:${label}] failed`, {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        activeControllers.delete(controller);
        pendingTasks.delete(pending);
        resolvePending();
      });
    return execution;
  };

  if (defer) setImmediate(execute);
  else execute();

  return pending;
};

const waitForPendingTasks = async () => {
  while (pendingTasks.size > 0) {
    await Promise.all(Array.from(pendingTasks));
  }
};

const drainBackgroundTasks = async ({ timeoutMs = 10000 } = {}) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return waitForPendingTasks();

  let timeout;
  try {
    await Promise.race([
      waitForPendingTasks(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('background task drain timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const getPendingTaskCount = () => pendingTasks.size;

// 順序と終了時の追跡を維持し、一段階の失敗で後続処理を中止しない。
const runBackgroundSteps = (label, steps, { logger = defaultLogger, context = {}, ...options } = {}) =>
  runBackgroundTask(label, async ({ signal }) => {
    for (const [step, task] of Object.entries(steps)) {
      if (signal.aborted) break;
      try {
        await task({ signal });
      } catch (error) {
        if (isExpectedAbort(error, signal)) break;
        logger.warn(`[background:${label}.${step}] failed`, {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, { ...options, logger, context });

const abortBackgroundTasks = (
  reason = Object.assign(new Error('background task aborted during shutdown'), {
    name: 'AbortError',
  })
) => {
  let abortedCount = 0;
  activeControllers.forEach((controller) => {
    if (controller.signal.aborted) return;
    controller.abort(reason);
    abortedCount += 1;
  });
  return abortedCount;
};

module.exports = {
  abortBackgroundTasks,
  drainBackgroundTasks,
  getPendingTaskCount,
  runBackgroundTask,
  runBackgroundSteps,
};
