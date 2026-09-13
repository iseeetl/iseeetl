const ORIGINAL_ENV = process.env;

const loadLogger = () => {
  // 読込時に実行環境が確定するため、キャッシュを消してロガーを読み直す。
  jest.resetModules();
  return require('../../../utils/logger');
};

describe('loggerの検証', () => {
  let logSpy, warnSpy, errorSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = ORIGINAL_ENV;
  });

  describe('本番環境以外のログ出力', () => {
    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
    });

    test('info / warn / エラーが console.xxx を呼ぶ', () => {
      const logger = loadLogger();

      logger.info('hello');
      logger.warn('warn msg');
      logger.error('err');

      expect(logSpy).toHaveBeenCalledWith('[INFO]', 'hello');
      expect(warnSpy).toHaveBeenCalledWith('[WARN]', 'warn msg');
      expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'err');
    });
  });

  describe('本番環境のログ出力', () => {
    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' };
    });

    test('info / warn は出力せず、エラーは出力する', () => {
      const logger = loadLogger();

      logger.info('ignore');
      logger.warn('ignore');
      logger.error('ignore');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'ignore');
    });
  });
});
