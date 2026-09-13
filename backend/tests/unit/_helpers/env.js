const snapshotEnv = (keys, environment = process.env) =>
  keys.reduce((snapshot, key) => {
    snapshot[key] = {
      exists: Object.prototype.hasOwnProperty.call(environment, key),
      value: environment[key],
    };
    return snapshot;
  }, {});

const restoreEnv = (snapshot, environment = process.env) => {
  Object.entries(snapshot).forEach(([key, entry]) => {
    if (!entry.exists) {
      delete environment[key];
      return;
    }
    environment[key] = entry.value;
  });
};

module.exports = {
  snapshotEnv,
  restoreEnv,
};
