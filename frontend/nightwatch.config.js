const path = require('node:path');

const readCliOption = (name) => {
  const inlinePrefix = `${name}=`;
  const inlineOption = process.argv.find((argument) => argument.startsWith(inlinePrefix));
  if (inlineOption) {
    return inlineOption.slice(inlinePrefix.length);
  }

  const optionIndex = process.argv.indexOf(name);
  const separateValue = optionIndex >= 0 ? process.argv[optionIndex + 1] : undefined;
  return separateValue && !separateValue.startsWith('--') ? separateValue : undefined;
};

const resolveLaunchUrl = (rawUrl) => {
  const normalized = String(rawUrl || '').replace('://0.0.0.0', '://localhost');
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (_) {
    throw new Error('E2Eの起動URLには有効なURLを指定してください。');
  }

  const isDedicatedOrigin =
    parsed.protocol === 'http:' &&
    parsed.hostname === 'localhost' &&
    parsed.port === '3100' &&
    !parsed.username &&
    !parsed.password;
  if (!isDedicatedOrigin || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('E2Eの起動URLには専用オリジンhttp://localhost:3100を使用してください。');
  }
  return parsed.origin;
};

const rawLaunchUrl = readCliOption('--url') || process.env.VUE_DEV_SERVER_URL || 'http://localhost:3100';
const launchUrl = resolveLaunchUrl(rawLaunchUrl);
const helperExclude = ['**/helpers/**', '**/*-helpers.js'];

module.exports = {
  src_folders: ['tests/e2e/specs/flows', 'tests/e2e/specs/screens'],
  exclude: helperExclude,
  output_folder: path.resolve(__dirname, '../.e2e-runtime/reports/nightwatch'),
  detailed_output: false,
  globals: {
    asyncHookTimeout: 120000,
  },
  test_settings: {
    default: {
      launch_url: launchUrl,
      exclude: helperExclude,
      webdriver: {
        start_process: true,
        server_path: process.env.E2E_CHROMEDRIVER_PATH?.trim() || '/usr/bin/chromedriver',
        host: '127.0.0.1',
        port: 9515,
        log_path: path.resolve(
          __dirname,
          '../.e2e-runtime/reports/nightwatch/chromedriver'
        ),
      },
    },
    chrome: {
      exclude: helperExclude,
      desiredCapabilities: {
        browserName: 'chrome',
        javascriptEnabled: true,
        acceptInsecureCerts: true,
        'goog:chromeOptions': {
          binary: process.env.E2E_CHROME_BINARY?.trim() || '/usr/bin/chromium-browser',
          prefs: {
            'profile.default_content_setting_values.notifications': 1,
            'intl.accept_languages': 'ja',
          },
          args: [
            '--headless',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-popup-blocking',
            '--lang=ja',
            '--window-size=1280,800',
          ],
        },
      },
    },
  },
};
