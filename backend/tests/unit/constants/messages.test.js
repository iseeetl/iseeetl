const Messages = require('../../../constants/messages');

describe('利用者向けメッセージの定義', () => {
  test('主要メッセージが文字列で定義されている', () => {
    const keys = [
      'INVALID_PARAMS',
      'INVALID_PERMISSION',
      'INTERNAL_SERVER_ERROR',
      'NOT_FOUND',
      'FILE_REQUIRED',
    ];

    keys.forEach((key) => {
      expect(typeof Messages[key]).toBe('string');
      expect(Messages[key].length).toBeGreaterThan(0);
    });
  });

  test('利用者向けメッセージに内部実装用語を含めない', () => {
    expect(Messages.INVALID_PARAMS).toBe('入力内容が正しくありません');
    expect(Messages.FILE_UPLOAD_ERROR).toBe('ファイルをアップロードできませんでした');
    expect(Messages.ALREADY_FLOOR_MEMBER).toBe('既にフロアメンバーです');
    expect(Messages.CANT_KICK).toBe('このユーザーのアクセスを制限することはできません');
    expect(Messages.TOKEN_INVALID).toBe('認証情報が無効です');
  });
});
