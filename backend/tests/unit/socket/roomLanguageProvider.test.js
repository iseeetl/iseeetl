const { createRoomLanguageProvider } = require('../../../socket/roomLanguageProvider');

describe('ルームの接続言語取得', () => {
  test('ルーム内の全Socket言語を重複なく返す', () => {
    const participants = new Map([
      ['room-1', new Map([
        ['user-1', { languages: new Map([['socket-1', 'ja'], ['socket-2', 'en']]) }],
        ['user-2', { lang: 'en' }],
      ])],
    ]);
    expect(createRoomLanguageProvider(participants).getLanguages('room-1')).toEqual(['ja', 'en']);
  });

  test('存在しないルームは空配列を返す', () => {
    expect(createRoomLanguageProvider(new Map()).getLanguages('room-1')).toEqual([]);
  });
});
