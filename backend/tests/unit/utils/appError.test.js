const Messages = require('../../../constants/messages');
const AppError = require('../../../utils/appError');

describe('appErrorの検証', () => {
  test('コード指定で message/status が正しくセットされ、Error を継承している', () => {
    const err = new AppError({ code: 'INVALID_PARAMS' });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);

    expect(err.message).toBe(Messages.INVALID_PARAMS);
    expect(err.status).toBe(400);
    expect(err.code).toBe('INVALID_PARAMS');

    expect(typeof err.stack).toBe('string');
    expect(err.stack).toEqual(expect.stringContaining(Messages.INVALID_PARAMS));
  });

  test('未知のコードは INTERNAL_SERVER_ERROR にフォールバックする', () => {
    const err = new AppError({ code: 'UNKNOWN_CODE' });
    expect(err.code).toBe('INTERNAL_SERVER_ERROR');
    expect(err.message).toBe(Messages.INTERNAL_SERVER_ERROR);
    expect(err.status).toBe(500);
  });
});
