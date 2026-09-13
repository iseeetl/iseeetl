const locks = new Map();

const withKeyedLock = async (key, task) => {
  const normalizedKey = String(key);
  const previous = locks.get(normalizedKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(normalizedKey, current);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (locks.get(normalizedKey) === current) locks.delete(normalizedKey);
  }
};

const withKeyedLocks = async (keys, task) => {
  const normalizedKeys = [...new Set(keys.map(String))].sort();
  const acquire = (index) =>
    index >= normalizedKeys.length
      ? task()
      : withKeyedLock(normalizedKeys[index], () => acquire(index + 1));
  return acquire(0);
};

module.exports = {
  withKeyedLock,
  withKeyedLocks,
};
