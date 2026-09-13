#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');
const { BACKEND_ROOT, resolveIntegrationGroup } = require('../tests/integration/manifest');

const printUsage = () => {
  console.log('使い方: node ./scripts/run-integration-group.js <external-mocked|remaining> [Jestオプション]');
};

const main = () => {
  const [groupName, ...jestOptions] = process.argv.slice(2);
  if (!groupName || groupName === '--help' || groupName === '-h') {
    printUsage();
    return;
  }

  let testPaths;
  try {
    testPaths = resolveIntegrationGroup(groupName);
  } catch (error) {
    console.error(error.message);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const jestBin = require.resolve('jest/bin/jest');
  const result = spawnSync(
    process.execPath,
    [jestBin, '-c', path.join(BACKEND_ROOT, 'jest.integration.config.js'), '--runInBand', ...jestOptions, ...testPaths],
    {
      cwd: BACKEND_ROOT,
      stdio: 'inherit',
    }
  );

  if (result.error) throw result.error;
  process.exitCode = typeof result.status === 'number' ? result.status : 1;
};

if (require.main === module) {
  main();
}

module.exports = {
  main,
  printUsage,
};
