const path = require('path');

const ORIGINAL_ARGV = process.argv.slice();
const ORIGINAL_ENV_FILE = process.env.BACKEND_ENV_FILE;
const DEV_ENV = path.resolve(__dirname, '../../../.env.development');
const CUSTOM_ENV = path.resolve(__dirname, 'fixtures/custom-development.env');

const loadEcosystem = ({ argv = [], envFile, settings = {}, error } = {}) => {
  jest.resetModules();
  process.argv = ['node', 'ecosystem.config.js', ...argv];
  if (envFile === undefined) delete process.env.BACKEND_ENV_FILE;
  else process.env.BACKEND_ENV_FILE = envFile;

  const config = jest.fn(() => ({ parsed: settings, error }));
  jest.doMock('dotenv', () => ({ config }));

  const ecosystem = require('../../../ecosystem.config');
  return { ecosystem, config };
};

describe('PM2の環境ファイルの選択', () => {
  afterEach(() => {
    process.argv = ORIGINAL_ARGV.slice();
    if (ORIGINAL_ENV_FILE === undefined) delete process.env.BACKEND_ENV_FILE;
    else process.env.BACKEND_ENV_FILE = ORIGINAL_ENV_FILE;
    jest.dontMock('dotenv');
  });

  test.each([undefined, ''])('開発用ファイルの指定が空ならbackend直下の設定を読む: %s', (envFile) => {
    const { ecosystem, config } = loadEcosystem({
      argv: ['--env', 'development'], envFile, settings: { DEV_ONLY_FLAG: '1' },
    });

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({ path: DEV_ENV });
    expect(ecosystem.apps[0].env_development).toEqual({ DEV_ONLY_FLAG: '1', NODE_ENV: 'development' });
  });

  test('BACKEND_ENV_FILEで指定した開発用ファイルだけを読む', () => {
    const { ecosystem, config } = loadEcosystem({
      argv: ['--env=development'], envFile: CUSTOM_ENV, settings: { DEV_ONLY_FLAG: 'custom' },
    });

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({ path: CUSTOM_ENV });
    expect(ecosystem.apps[0].env_development.DEV_ONLY_FLAG).toBe('custom');
  });

  test('対象モードを省略した場合も開発用ファイルを読む', () => {
    const { config } = loadEcosystem();
    expect(config).toHaveBeenCalledWith({ path: DEV_ENV });
  });

  test.each([undefined, CUSTOM_ENV])('開発用ファイルを読めなければ別ファイルへ切り替えず停止する: %s', (envFile) => {
    const error = new Error('環境ファイルを読み込めません');
    expect(() => loadEcosystem({ envFile, error })).toThrow(error);
    expect(require('dotenv').config).toHaveBeenCalledTimes(1);
  });

  test.each(['staging', 'production'])('%sでは対象の環境ファイルと共通のログ保存先を使用する', (mode) => {
    const { ecosystem, config } = loadEcosystem({
      argv: ['--env', mode], envFile: CUSTOM_ENV, settings: { MODE_ONLY_FLAG: mode },
    });

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({ path: '/etc/iseeetl/.env.' + mode });
    expect(ecosystem.apps[0]['env_' + mode]).toEqual({ MODE_ONLY_FLAG: mode, NODE_ENV: 'production' });
    expect(ecosystem.apps[0]).toMatchObject({
      out_file: '/var/log/iseeetl/backend.out.log',
      error_file: '/var/log/iseeetl/backend.err.log',
    });
  });
});
