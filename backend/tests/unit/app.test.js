jest.mock('../../bootstrap/startServer', () => ({
  runServer: jest.fn(),
}));

describe('バックエンドのエントリ', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('moduleとして読み込んでもサーバを起動しない', () => {
    const startServer = require('../../bootstrap/startServer');
    const appEntry = require('../../app');

    expect(appEntry).toEqual({ runServer: startServer.runServer });
    expect(startServer.runServer).not.toHaveBeenCalled();
  });
});
