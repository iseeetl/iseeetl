const { SHUTDOWN_SIGNALS, registerShutdownHandlers } = require('../../../bootstrap/shutdown');

describe('終了シグナルの登録', () => {
  test('すべての終了シグナルに同じ1回限りの処理を登録する', async () => {
    const processRef = { once: jest.fn() };
    const connection = { close: jest.fn().mockResolvedValue() };
    const server = { close: jest.fn((callback) => callback()) };
    const io = { close: jest.fn((callback) => callback()) };
    const abortTasks = jest.fn().mockResolvedValue();
    const drainTasks = jest.fn().mockResolvedValue();
    const cleanupMedia = jest.fn().mockResolvedValue();
    const exit = jest.fn();
    const logger = { log: jest.fn(), error: jest.fn() };

    const handler = registerShutdownHandlers({
      connection,
      server,
      io,
      abortTasks,
      drainTasks,
      cleanupMedia,
      processRef,
      exit,
      logger,
    });

    expect(processRef.once.mock.calls.map(([signal]) => signal)).toEqual(SHUTDOWN_SIGNALS);
    processRef.once.mock.calls.forEach(([, registered]) => expect(registered).toBe(handler));

    await handler();
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(io.close).toHaveBeenCalledTimes(1);
    expect(abortTasks).toHaveBeenCalledTimes(1);
    expect(drainTasks).toHaveBeenCalledTimes(1);
    expect(cleanupMedia).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('DB接続がなければ終了処理を登録しない', () => {
    expect(() => registerShutdownHandlers()).toThrow('registerShutdownHandlers requires connection');
  });
});
