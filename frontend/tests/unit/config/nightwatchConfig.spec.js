import { createRequire } from 'node:module';
import path from 'node:path';
import { expect } from 'vitest';

const require = createRequire(import.meta.url);
const loadConfig = ({ url, chromeBinary, chromeDriverPath } = {}) => {
  const configPath = require.resolve('../../../nightwatch.config.js');
  const originalArgv = process.argv;
  const settings = {
    E2E_CHROME_BINARY: chromeBinary,
    E2E_CHROMEDRIVER_PATH: chromeDriverPath,
    VUE_DEV_SERVER_URL: undefined,
  };
  const originalEnvironment = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  try {
    process.argv = originalArgv.slice(0, 2).concat(url ? ['--url', url] : []);
    Object.entries(settings).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    delete require.cache[configPath];
    return require(configPath);
  } finally {
    process.argv = originalArgv;
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    delete require.cache[configPath];
  }
};

const loadConfigWithUrl = (url) => loadConfig({ url });
const nightwatchConfig = loadConfig();
const defaultSettings = nightwatchConfig.test_settings.default;

describe('Nightwatchの設定', () => {
  it('環境変数で指定したブラウザとChromeDriverを使用する', () => {
    const chromeBinary = path.resolve(process.cwd(), 'test-browser/chrome binary');
    const chromeDriverPath = path.resolve(process.cwd(), 'test-browser/chromedriver');
    const config = loadConfig({ chromeBinary, chromeDriverPath });
    expect(config.test_settings.default.webdriver.server_path).to.equal(chromeDriverPath);
    expect(config.test_settings.chrome.desiredCapabilities['goog:chromeOptions'].binary).to.equal(chromeBinary);
  });

  it.each(['', '   '])('ブラウザのパス指定が空なら既存の配置を使用する: %s', (value) => {
    const config = loadConfig({ chromeBinary: value, chromeDriverPath: value });
    expect(config.test_settings.default.webdriver.server_path).to.equal('/usr/bin/chromedriver');
    expect(config.test_settings.chrome.desiredCapabilities['goog:chromeOptions'].binary).to.equal('/usr/bin/chromium-browser');
  });

  it('E2E専用フロントエンドを接続先とし、共通の復旧処理を読み込まない', () => {
    expect(defaultSettings.launch_url).to.equal('http://localhost:3100');
    expect(nightwatchConfig.output_folder).to.equal(
      path.resolve(process.cwd(), '../.e2e-runtime/reports/nightwatch')
    );
    expect(nightwatchConfig.detailed_output).to.equal(false);
    expect(nightwatchConfig).to.not.have.own.property('globals_path');
    expect(nightwatchConfig.globals).to.deep.equal({ asyncHookTimeout: 120000 });
  });

  it('localhostのE2E専用オリジンだけを受け入れる', () => {
    expect(loadConfigWithUrl('http://localhost:3100').test_settings.default.launch_url).to.equal(
      'http://localhost:3100'
    );
    expect(loadConfigWithUrl('http://0.0.0.0:3100').test_settings.default.launch_url).to.equal(
      'http://localhost:3100'
    );
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3100',
    'http://127.0.0.1:5000',
    'https://localhost:3100',
    'http://example.test:3100',
    'http://localhost:3100/help',
  ])('通常開発・バックエンド直指定・外部・パス付きURLを拒否する: %s', (url) => {
    expect(() => loadConfigWithUrl(url)).to.throw(
      'E2Eの起動URLには専用オリジンhttp://localhost:3100を使用してください。'
    );
  });

  it('導入済みChromeDriverをNightwatchが自動起動する', () => {
    const chromeDriverLogPath = path.resolve(
      process.cwd(),
      '../.e2e-runtime/reports/nightwatch/chromedriver'
    );
    const frontendLogsPath = path.resolve(process.cwd(), 'logs');

    expect(defaultSettings).to.not.have.own.property('selenium');
    expect(defaultSettings.webdriver).to.deep.equal({
      start_process: true,
      server_path: '/usr/bin/chromedriver',
      host: '127.0.0.1',
      port: 9515,
      log_path: chromeDriverLogPath,
    });
    expect(
      chromeDriverLogPath === frontendLogsPath ||
        chromeDriverLogPath.startsWith(`${frontendLogsPath}${path.sep}`)
    ).to.equal(false);
  });

  it('Chromiumをヘッドレスで使用する', () => {
    const chromeOptions = nightwatchConfig.test_settings.chrome.desiredCapabilities['goog:chromeOptions'];
    expect(chromeOptions.binary).to.equal('/usr/bin/chromium-browser');
    expect(chromeOptions.args).to.include('--headless');
    expect(chromeOptions.args).to.include('--lang=ja');
    expect(chromeOptions.args).to.not.include('--disable-dev-shm-usage');
    expect(chromeOptions.prefs['intl.accept_languages']).to.equal('ja');
  });
});
