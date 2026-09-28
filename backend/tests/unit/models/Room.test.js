const Room = require('../../../models/Room');

describe('ルームの案内文のモデル制約', () => {
  const create = (empty_message) => new Room({
    user: '507f1f77bcf86cd799439011', floor: '507f1f77bcf86cd799439012', title: 'ルーム', empty_message,
  });
  test('案内文を指定しなければ空文字と空の翻訳配列になる', () => {
    const room = create();
    expect(room.empty_message).toBe('');
    expect(room.empty_message_translations).toHaveLength(0);
    expect(room.validateSync()).toBeUndefined();
  });
  test('200文字まで保存でき、201文字は拒否する', () => {
    expect(create('あ'.repeat(200)).validateSync()).toBeUndefined();
    expect(create('あ'.repeat(201)).validateSync().errors).toHaveProperty('empty_message');
  });
  test.each([['末尾の改行', '案内\n'], ['途中の改行', '案\r内'], ['行区切り', '案\u2028内']])(
    '改行を含む案内文は保存できない（%s）', (_label, message) => {
      expect(create(message).validateSync().errors).toHaveProperty('empty_message');
    }
  );
});
