const { buildDeleteFlagUpdate } = require('../../../../services/_shared/updateHelpers');

describe('更新項目の共通処理', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('削除フラグがtrueなら削除日時を設定する', () => {
    jest.spyOn(Date, 'now').mockReturnValue(123);
    const result = buildDeleteFlagUpdate({ deleteFlg: true });
    expect(result).toEqual({ delete_flg: true, deleted_at: 123 });
  });

  test('削除フラグがfalseなら削除日時をnullにする', () => {
    jest.spyOn(Date, 'now').mockReturnValue(456);
    const result = buildDeleteFlagUpdate({ deleteFlg: false });
    expect(result).toEqual({ delete_flg: false, deleted_at: null });
  });

  test('削除フラグが真偽値でなければ削除日時を含めない', () => {
    const result = buildDeleteFlagUpdate({ deleteFlg: undefined });
    expect(result).toEqual({ delete_flg: undefined });
  });

  test('明示指定により削除フラグが真偽値でなくても削除日時を設定できる', () => {
    const result = buildDeleteFlagUpdate({ deleteFlg: undefined, alwaysSetDeletedAt: true });
    expect(result).toEqual({ delete_flg: undefined, deleted_at: null });
  });
});
