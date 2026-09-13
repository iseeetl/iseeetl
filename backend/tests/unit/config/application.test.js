const {
  resolveApplicationConfig,
} = require('../../../config/application');

describe('アプリの公開URL設定', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('フロントエンド URLをtrimして起動時設定へ固定できる', () => {
    const config = resolveApplicationConfig({
      VUE_APP_APPURL: '  https://app.example.invalid  ',
    });

    expect(config).toEqual({ appUrl: 'https://app.example.invalid' });
    expect(Object.isFrozen(config)).toBe(true);
  });

  test.each(['', 'not-a-url', 'ftp://app.example.invalid'])(
    '不正なフロントエンド URL %sは値を出さず拒否する',
    (value) => {
      expect.assertions(3);
      try {
        resolveApplicationConfig({ VUE_APP_APPURL: value });
      } catch (error) {
        expect(error.code).toBe('APPLICATION_CONFIG_INVALID');
        expect(error.envNames).toEqual(['VUE_APP_APPURL']);
        if (value) expect(error.message).not.toContain(value);
        else expect(error.message).toContain('VUE_APP_APPURL');
      }
    }
  );

  test('起動時初期化後はprocess.env変更後もフロントエンド URLのスナップショットを維持する', () => {
    jest.isolateModules(() => {
      process.env = {
        ...ORIGINAL_ENV,
        VUE_APP_APPURL: 'https://initial.example.invalid',
      };
      const application = require('../../../config/application');
      const initialized = application.initializeApplicationConfig();

      process.env.VUE_APP_APPURL = 'https://changed.example.invalid';

      expect(application.getApplicationConfig()).toBe(initialized);
      expect(application.getApplicationConfig().appUrl).toBe(
        'https://initial.example.invalid'
      );
    });
  });
});
