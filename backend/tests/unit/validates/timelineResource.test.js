const { mapPostRequest, mapTimelineRequest } = require('../../../validates/timelineResource');
const params = { room_id: '1'.repeat(24), post_id: '2'.repeat(24) };

describe('投稿データの入力検証', () => {
  test('子対象は親IDをパスから取得し、付加情報のタグ・通知入力を拒否する', () => {
    const scope = { ...params, reply_id: '3'.repeat(24), supplement_id: '4'.repeat(24) };
    expect(mapTimelineRequest(scope, { content: 'text', lang: 'en' }, 'create', 'replySupplement'))
      .toEqual({ room_id: params.room_id, post_id: params.post_id, reply_id: scope.reply_id, content: 'text', lang: 'en' });
    for (const body of [{ room_tags: [] }, { animation: null }, { notify_all: false }]) {
      expect(() => mapTimelineRequest(scope, body, 'update', 'postSupplement')).toThrow();
    }
    expect(() => mapTimelineRequest(scope, { notify_all: 'true' }, 'update', 'reply')).toThrow();
  });
  test('最小createはIDと保存値だけを作る', () => {
    expect(mapPostRequest(params, { content: 'hello', lang: 'en' }, 'create'))
      .toEqual({ room_id: params.room_id, content: 'hello', lang: 'en' });
  });
  test('PATCHは省略と解除を区別する', () => {
    expect(mapPostRequest(params, { content: null, room_tags: [] }, 'update'))
      .toEqual({ room_id: params.room_id, _id: params.post_id, content: null, room_tags: [] });
    expect(mapPostRequest(params, {}, 'update'))
      .toEqual({ room_id: params.room_id, _id: params.post_id });
  });
  test('メディアキャプションだけの変更とグループ解除', () => {
    expect(mapPostRequest(params, { media: { image: { caption: null } } }, 'update'))
      .toEqual({ room_id: params.room_id, _id: params.post_id, image_caption: null });
    const input = mapPostRequest(params, { media: { image: null, audio: { file_name: 'audio.mp3' } } }, 'update');
    expect(input).toMatchObject({ image_name: null, image_thumbnail_name: null, image_caption: null, audio_name: 'audio.mp3' });
    expect(input).not.toHaveProperty('video_name');
  });
  test('DELETEにbody IDを持ち込まない', () => {
    expect(mapPostRequest(params, {}, 'delete')).toEqual({ room_id: params.room_id, _id: params.post_id });
    expect(() => mapPostRequest(params, { _id: params.post_id }, 'delete')).toThrow();
  });
  test.each([
    { user_id: 'actor' }, { floor_id: params.room_id }, { floor_title: 'title' },
    { keyup: [] }, { target_langs: [] }, { translations: [] }, { content: ' ' },
    { lang: null }, { lang: 'invalid' }, { room_tags: null }, { room_tags: ['bad'] },
    { animation: true }, { media: [] }, { media: { unknown: {} } },
    { media: { image: { caption: 1 } } }, { media: { image: { injected: true } } },
    { media: { video: { subtitle: { path: '../bad' } } } },
  ])('不正入力を拒否する: %j', (body) => {
    expect(() => mapPostRequest(params, body, 'update')).toThrow();
  });
  test.each([{ lang: 'en' }, { content: 'hello' }, { content: '', lang: 'en' }])('不完全createを拒否する: %j', (body) => {
    expect(() => mapPostRequest(params, body, 'create')).toThrow();
  });
  test('パス ObjectIdを厳格検証する', () => {
    expect(() => mapPostRequest({ ...params, room_id: 'abcdefghijkl' }, {}, 'delete')).toThrow();
  });
});
