jest.mock('../../../utils/logger', () => ({ warn: jest.fn() }));
const logger = require('../../../utils/logger');
const { publishSocketEvent } = require('../../../socket/publication');

describe('Socket通知の失敗分離', () => {
  test.each(['同期例外', 'Promise拒否'])('%sを記録し呼出元には伝播しない', async (kind) => {
    const failure = new Error('通知本文を含むエラー');
    const publish = () => {
      if (kind === '同期例外') throw failure;
      return Promise.reject(failure);
    };
    await expect(publishSocketEvent('POST_CREATE', publish)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('[SOCKET] publication failed', { event: 'POST_CREATE' });
  });

  test('正常時は通知結果を返す', async () => {
    const publish = jest.fn().mockResolvedValue('published');
    await expect(publishSocketEvent('POST_CREATE', publish)).resolves.toBe('published');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
