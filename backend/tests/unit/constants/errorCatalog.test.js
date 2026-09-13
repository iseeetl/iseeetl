const Messages = require('../../../constants/messages');
const { ERROR_CATALOG, getErrorEntry } = require('../../../constants/errorCatalog');

describe('エラーコードの定義', () => {
  test('主要コードの status と message を保持する', () => {
    expect(ERROR_CATALOG.INVALID_PARAMS).toEqual({ status: 400, message: Messages.INVALID_PARAMS });
    expect(ERROR_CATALOG.INVALID_PERMISSION).toEqual({ status: 401, message: Messages.INVALID_PERMISSION });
    expect(ERROR_CATALOG.NOT_FOUND).toEqual({ status: 404, message: Messages.NOT_FOUND });
    expect(ERROR_CATALOG.EXTERNAL_FEATURE_DISABLED).toEqual({
      status: 503,
      message: Messages.EXTERNAL_FEATURE_DISABLED,
    });
  });

  test('getErrorEntry は未知コードで null を返す', () => {
    expect(getErrorEntry()).toBeNull();
    expect(getErrorEntry('UNKNOWN')).toBeNull();
  });

  test('getErrorEntry は既知コードの参照を返す', () => {
    const entry = getErrorEntry('TOKEN_EXPIRED');
    expect(entry).toEqual({ status: 401, message: Messages.TOKEN_EXPIRED });
  });
});
