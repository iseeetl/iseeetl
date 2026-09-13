const { createGracefulExit } = require('../../../bootstrap/gracefulExit');

describe('サーバの正常終了処理', () => {
  test('MongoDB接続をPromise形式で閉じて終了コード0で終了する', async () => {
    const connection = { close: jest.fn().mockResolvedValue() };
    const server = { close: jest.fn((callback) => callback()) };
    const io = { close: jest.fn((callback) => callback()) };
    const abortBackgroundTasks = jest.fn().mockResolvedValue();
    const drainBackgroundTasks = jest.fn().mockResolvedValue();
    const cleanupBackgroundMedia = jest.fn().mockResolvedValue();
    const exit = jest.fn();
    const logger = { log: jest.fn(), error: jest.fn() };
    const gracefulExit = createGracefulExit({
      connection,
      server,
      io,
      abortBackgroundTasks,
      drainBackgroundTasks,
      cleanupBackgroundMedia,
      exit,
      logger,
    });

    await gracefulExit();

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(abortBackgroundTasks).toHaveBeenCalledTimes(1);
    expect(drainBackgroundTasks).toHaveBeenCalledWith({ timeoutMs: 10000 });
    expect(cleanupBackgroundMedia).not.toHaveBeenCalled();
    expect(io.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledWith();
    expect(logger.log).toHaveBeenCalledWith('MongoDB connection closed');
    expect(logger.error).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('MongoDB接続の終了に失敗した場合は終了コード1で終了する', async () => {
    const error = new Error('close failed');
    const connection = { close: jest.fn().mockRejectedValue(error) };
    const exit = jest.fn();
    const logger = { log: jest.fn(), error: jest.fn() };
    const gracefulExit = createGracefulExit({ connection, exit, logger });

    await gracefulExit();

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'MongoDB connection close failed:',
      error
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  test('終了処理を複数回呼んでもMongoDB接続は一度だけ閉じる', async () => {
    let resolveClose;
    const connection = {
      close: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveClose = resolve;
          })
      ),
    };
    const exit = jest.fn();
    const logger = { log: jest.fn(), error: jest.fn() };
    const gracefulExit = createGracefulExit({ connection, exit, logger });

    const firstExit = gracefulExit();
    const secondExit = gracefulExit();

    expect(secondExit).toBe(firstExit);
    await new Promise((resolve) => setImmediate(resolve));
    resolveClose();
    await Promise.all([firstExit, secondExit]);

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('背景処理の終了待ちに失敗してもDBを閉じ、終了コード1にする', async () => {
    const error = new Error('drain failed');
    const connection = { close: jest.fn().mockResolvedValue() };
    const drainBackgroundTasks = jest.fn().mockRejectedValue(error);
    const cleanupBackgroundMedia = jest.fn().mockResolvedValue();
    const exit = jest.fn();
    const logger = { log: jest.fn(), error: jest.fn() };
    const gracefulExit = createGracefulExit({
      connection,
      drainBackgroundTasks,
      cleanupBackgroundMedia,
      exit,
      logger,
    });

    await gracefulExit();

    expect(logger.error).toHaveBeenCalledWith('Application shutdown failed:', error);
    expect(cleanupBackgroundMedia).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  test('HTTP受付を止め、背景処理を中断・終了してからSocketとDBを閉じる', async () => {
    const order = [];
    const connection = {
      close: jest.fn(async () => {
        order.push('database');
      }),
    };
    const server = {
      close: jest.fn((callback) => {
        order.push('server');
        callback();
      }),
    };
    const io = {
      close: jest.fn((callback) => {
        order.push('socket');
        callback();
      }),
    };
    const abortBackgroundTasks = jest.fn(async () => {
      order.push('abort');
    });
    const drainBackgroundTasks = jest.fn(async () => {
      order.push('drain');
    });
    const cleanupBackgroundMedia = jest.fn(async () => {
      order.push('media-cleanup');
    });
    const gracefulExit = createGracefulExit({
      connection,
      server,
      io,
      abortBackgroundTasks,
      drainBackgroundTasks,
      cleanupBackgroundMedia,
      exit: jest.fn(),
      logger: { log: jest.fn(), error: jest.fn() },
    });

    await gracefulExit();

    expect(order).toEqual(['server', 'abort', 'drain', 'socket', 'database']);
    expect(cleanupBackgroundMedia).not.toHaveBeenCalled();
  });

  test('背景処理の終了待ちに失敗した場合はメディアの代替処理後にDBを閉じる', async () => {
    const order = [];
    const connection = {
      close: jest.fn(async () => {
        order.push('database');
      }),
    };
    const cleanupBackgroundMedia = jest.fn(async () => {
      order.push('media-cleanup');
    });
    const gracefulExit = createGracefulExit({
      connection,
      drainBackgroundTasks: jest.fn().mockRejectedValue(new Error('drain failed')),
      cleanupBackgroundMedia,
      exit: jest.fn(),
      logger: { log: jest.fn(), error: jest.fn() },
    });

    await gracefulExit();

    expect(order).toEqual(['media-cleanup', 'database']);
  });
});
