const { withKeyedLock, withKeyedLocks } = require('../../../utils/keyedLock');

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('キー単位の排他制御', () => {
  test('正規化後のキーが同じ処理を逐次実行する', async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const events = [];

    const first = withKeyedLock(42, async () => {
      events.push('first:start');
      firstStarted.resolve();
      await releaseFirst.promise;
      events.push('first:end');
      return 'first';
    });
    await firstStarted.promise;

    const second = withKeyedLock('42', async () => {
      events.push('second:start');
      return 'second';
    });
    await flushPromises();
    expect(events).toEqual(['first:start']);

    releaseFirst.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  test('処理が失敗してもキーを解放して次の待機処理へ渡す', async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const failure = new Error('expected failure');

    const first = withKeyedLock('rejecting-key', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      throw failure;
    });
    const observedFirst = first.catch((error) => error);
    await firstStarted.promise;
    const second = withKeyedLock('rejecting-key', async () => 'continued');

    releaseFirst.resolve();

    await expect(observedFirst).resolves.toBe(failure);
    await expect(second).resolves.toBe('continued');
  });

  test('異なるキーの処理は並行して実行できる', async () => {
    const firstStarted = deferred();
    const secondStarted = deferred();
    const release = deferred();

    const first = withKeyedLock('parallel-a', async () => {
      firstStarted.resolve();
      await release.promise;
    });
    const second = withKeyedLock('parallel-b', async () => {
      secondStarted.resolve();
      await release.promise;
    });

    await Promise.all([firstStarted.promise, secondStarted.promise]);
    release.resolve();
    await Promise.all([first, second]);
  });

  test('複数キーを並べ替えて重複を除き、逆順の要求でもデッドロックを防ぐ', async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const events = [];

    const first = withKeyedLocks(['b', 'a', 'a'], async () => {
      events.push('first:start');
      firstStarted.resolve();
      await releaseFirst.promise;
      events.push('first:end');
    });
    await firstStarted.promise;

    const second = withKeyedLocks(['a', 'b'], async () => {
      events.push('second:start');
    });
    await flushPromises();
    expect(events).toEqual(['first:start']);

    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });
});
