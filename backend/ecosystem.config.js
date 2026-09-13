const path = require('path');
const dotenv = require('dotenv');
const PROD_OUT_FILE = '/var/log/iseeetl/backend.out.log';
const PROD_ERROR_FILE = '/var/log/iseeetl/backend.err.log';

function loadEnv(path) {
  const r = dotenv.config({ path });
  if (r.error) throw r.error;
  return r.parsed || {};
}

function resolvePm2Env() {
  const args = process.argv || [];
  const inline = args.find((arg) => arg.startsWith('--env='));
  if (inline) return inline.slice('--env='.length);

  const idx = args.findIndex((arg) => arg === '--env');
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];

  return null;
}

const STAGING_ENV = '/etc/iseeetl/.env.staging';
const PROD_ENV = '/etc/iseeetl/.env.production';
const DEV_ENV = process.env.BACKEND_ENV_FILE || path.join(__dirname, '.env.development');
const targetEnv = resolvePm2Env() || 'development';
const developmentVars = targetEnv === 'development' ? loadEnv(DEV_ENV) : {};
const stagingVars = targetEnv === 'staging' ? loadEnv(STAGING_ENV) : {};
const productionVars = targetEnv === 'production' ? loadEnv(PROD_ENV) : {};

const getLogPathsForEnv = () => ({
  outFile: PROD_OUT_FILE,
  errorFile: PROD_ERROR_FILE,
});

const logPaths = getLogPathsForEnv();

module.exports = {
  apps: [
    {
      name: 'iseeetl',
      script: 'app.js',
      instances: 1,
      exec_mode: 'fork',
      merge_logs: true,
      time: true,
      out_file: logPaths.outFile,
      error_file: logPaths.errorFile,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_development: {
        ...developmentVars,
        NODE_ENV: 'development',
      },
      env_staging: {
        ...stagingVars,
        NODE_ENV: 'production',
      },
      env_production: {
        ...productionVars,
        NODE_ENV: 'production',
      },
    },
  ],
};
