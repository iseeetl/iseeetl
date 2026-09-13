const fs = require('fs');
const path = require('path');

function validateStaticRoot(config, filesystem = fs) {
  if (config.nodeEnv !== 'production') return;
  if (!config.distRoot) throw new Error('DIST_PATH is required in production');
  try {
    if (!filesystem.statSync(config.distRoot).isDirectory()) throw new Error('not a directory');
    filesystem.accessSync(config.distRoot, fs.constants.R_OK | fs.constants.X_OK);
    const entry = path.join(config.distRoot, 'index.html');
    if (!filesystem.statSync(entry).isFile()) throw new Error('not a file');
    filesystem.accessSync(entry, fs.constants.R_OK);
  } catch (_error) {
    throw new Error('DIST_PATH must be a readable directory containing a readable index.html');
  }
}

module.exports = { validateStaticRoot };
