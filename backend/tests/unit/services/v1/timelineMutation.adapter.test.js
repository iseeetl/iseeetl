const mongoose = require('mongoose');

const adapter = require('../../../../services/v1/timelineMutation.adapter');

const id = () => new mongoose.Types.ObjectId().toString();

describe('v1のタイムライン変更データの変換', () => {
  let floorId;
  let roomId;
  let postId;
  let replyId;
  let supplementId;

  beforeEach(() => {
    floorId = id();
    roomId = id();
    postId = id();
    replyId = id();
    supplementId = id();
  });

  test('投稿作成を通常APIDTOへ変換し、クライアントの言語指定を渡さない', () => {
    const result = adapter.adaptPostCreate({
      floor_id: floorId,
      room_id: roomId,
      content: '本文',
      lang: 'en',
      target_langs: ['en'],
      room_tags: null,
    });

    expect(result).toEqual({
      floor_id: floorId,
      room_id: roomId,
      content: '本文',
      lang: 'ja',
      room_tags: [],
      animation: null,
    });
    expect(result).not.toHaveProperty('target_langs');
  });

  test('投稿更新には親の情報を必須とし、省略した項目を未指定のまま保持する', () => {
    expect(adapter.adaptPostUpdate({ room_id: roomId, post_id: postId, content: '更新' }))
      .toEqual({ room_id: roomId, _id: postId, content: '更新', lang: 'ja' });
  });

  test('返信更新ではnullのルームタグとアニメーションを「維持」として転送しない', () => {
    expect(adapter.adaptReplyUpdate({
      room_id: roomId,
      post_id: postId,
      reply_id: replyId,
      content: '更新',
      room_tags: null,
      animation: null,
    })).toEqual({
      room_id: roomId,
      post_id: postId,
      _id: replyId,
      content: '更新',
      lang: 'ja',
      notify_all: false,
    });
  });

  test('投稿更新のアニメーション:nullは明示解除として転送する', () => {
    expect(adapter.adaptPostUpdate({
      room_id: roomId,
      post_id: postId,
      content: '更新',
      animation: null,
    })).toHaveProperty('animation', null);
  });

  test('投稿・返信作成でアニメーション省略時は通知絞り込み条件用にnullを補完する', () => {
    expect(adapter.adaptPostCreate({
      floor_id: floorId,
      room_id: roomId,
      content: 'post',
    })).toHaveProperty('animation', null);
    expect(adapter.adaptReplyCreate({
      room_id: roomId,
      post_id: postId,
      content: 'reply',
    })).toHaveProperty('animation', null);
  });

  test('画像指定ではサムネイルを要求し、他メディアを暗黙に解除しない', () => {
    const userId = id();
    const base = `123_${userId}`;
    const result = adapter.adaptReplyUpdate({
      room_id: roomId,
      post_id: postId,
      reply_id: replyId,
      content: '画像',
      image_name: `${base}.jpg`,
      image_thumbnail_name: `${base}_thumbnail.jpg`,
    });

    expect(result).toMatchObject({
      image_name: `${base}.jpg`,
      image_thumbnail_name: `${base}_thumbnail.jpg`,
    });
    expect(result).not.toHaveProperty('video_name');
    expect(result).not.toHaveProperty('audio_name');
  });

  test('付随項目だけの更新は現在値と統合できるように省略項目を未指定のまま保持する', () => {
    const result = adapter.adaptPostUpdate({
      room_id: roomId,
      post_id: postId,
      content: '本文',
      image_caption: '更新後caption',
    });
    expect(result).toHaveProperty('image_caption', '更新後caption');
    expect(result).not.toHaveProperty('image_name');
  });

  test('更新でメディア本体を指定しても、省略した同グループの項目を暗黙にnull化しない', () => {
    const result = adapter.adaptPostUpdate({
      room_id: roomId,
      post_id: postId,
      content: '本文',
      image_name: 'image.jpg',
      image_thumbnail_name: 'image_thumbnail.jpg',
    });
    expect(result).not.toHaveProperty('image_caption');
  });

  test.each([
    ['Post削除', () => adapter.adaptPostDelete({ room_id: roomId, post_id: postId })],
    ['Post付加情報作成', () => adapter.adaptPostSupplementCreate({ room_id: roomId, post_id: postId, content: 'x' })],
    ['Post付加情報更新', () => adapter.adaptPostSupplementUpdate({ room_id: roomId, post_id: postId, supplement_id: supplementId, content: 'x' })],
    ['Post付加情報削除', () => adapter.adaptPostSupplementDelete({ room_id: roomId, post_id: postId, supplement_id: supplementId })],
    ['Reply作成', () => adapter.adaptReplyCreate({ room_id: roomId, post_id: postId, content: 'x' })],
    ['Reply削除', () => adapter.adaptReplyDelete({ room_id: roomId, post_id: postId, reply_id: replyId })],
    ['Reply付加情報作成', () => adapter.adaptReplySupplementCreate({ room_id: roomId, post_id: postId, reply_id: replyId, content: 'x' })],
    ['Reply付加情報更新', () => adapter.adaptReplySupplementUpdate({ room_id: roomId, post_id: postId, reply_id: replyId, supplement_id: supplementId, content: 'x' })],
    ['Reply付加情報削除', () => adapter.adaptReplySupplementDelete({ room_id: roomId, post_id: postId, reply_id: replyId, supplement_id: supplementId })],
  ])('%sのDTOを構築できる', (_label, operation) => {
    expect(operation()).toMatchObject({ room_id: roomId });
  });

  test('12 更新処理は全親子IDを小文字の正規形へ変換する', () => {
    const floor = floorId.toUpperCase();
    const room = roomId.toUpperCase();
    const post = postId.toUpperCase();
    const reply = replyId.toUpperCase();
    const supplement = supplementId.toUpperCase();
    const cases = [
      [adapter.adaptPostCreate, { floor_id: floor, room_id: room, content: 'x' }, { floor_id: floorId, room_id: roomId }],
      [adapter.adaptPostUpdate, { room_id: room, post_id: post, content: 'x' }, { room_id: roomId, _id: postId }],
      [adapter.adaptPostDelete, { room_id: room, post_id: post }, { room_id: roomId, _id: postId }],
      [adapter.adaptPostSupplementCreate, { room_id: room, post_id: post, content: 'x' }, { room_id: roomId, post_id: postId }],
      [adapter.adaptPostSupplementUpdate, { room_id: room, post_id: post, supplement_id: supplement, content: 'x' }, { room_id: roomId, post_id: postId, _id: supplementId }],
      [adapter.adaptPostSupplementDelete, { room_id: room, post_id: post, supplement_id: supplement }, { room_id: roomId, post_id: postId, _id: supplementId }],
      [adapter.adaptReplyCreate, { room_id: room, post_id: post, content: 'x' }, { room_id: roomId, post_id: postId }],
      [adapter.adaptReplyUpdate, { room_id: room, post_id: post, reply_id: reply, content: 'x' }, { room_id: roomId, post_id: postId, _id: replyId }],
      [adapter.adaptReplyDelete, { room_id: room, post_id: post, reply_id: reply }, { room_id: roomId, post_id: postId, _id: replyId }],
      [adapter.adaptReplySupplementCreate, { room_id: room, post_id: post, reply_id: reply, content: 'x' }, { room_id: roomId, post_id: postId, reply_id: replyId }],
      [adapter.adaptReplySupplementUpdate, { room_id: room, post_id: post, reply_id: reply, supplement_id: supplement, content: 'x' }, { room_id: roomId, post_id: postId, reply_id: replyId, _id: supplementId }],
      [adapter.adaptReplySupplementDelete, { room_id: room, post_id: post, reply_id: reply, supplement_id: supplement }, { room_id: roomId, post_id: postId, reply_id: replyId, _id: supplementId }],
    ];

    for (const [operation, body, expected] of cases) {
      expect(operation(body)).toEqual(expect.objectContaining(expected));
    }
  });

  test.each([
    ['room_id', { room_id: 'abcdefghijkl', post_id: postId, content: 'x' }],
    ['post_id', { room_id: roomId, post_id: 'abcdefghijkl', content: 'x' }],
  ])('12文字非16進の%sを拒否する', (_field, body) => {
    expect(() => adapter.adaptPostUpdate(body)).toThrow(expect.objectContaining({ code: 'INVALID_PARAMS' }));
  });

  test('複数メディアグループを同時指定すると拒否する', () => {
    expect(() => adapter.adaptPostCreate({
      floor_id: floorId,
      room_id: roomId,
      content: 'x',
      image_name: 'image.jpg',
      image_thumbnail_name: 'image_thumbnail.jpg',
      audio_name: 'audio.mp3',
    })).toThrow(expect.objectContaining({ code: 'INVALID_PARAMS' }));
  });

  test('作成時の付随メディアだけの指定を拒否する', () => {
    expect(() => adapter.adaptReplyCreate({
      room_id: roomId,
      post_id: postId,
      content: 'x',
      video_thumbnail_name: 'thumbnail.png',
    })).toThrow(expect.objectContaining({ code: 'INVALID_PARAMS' }));
  });

  test.each([
    ['字幕元ファイル名だけ', { video_subtitle_originalname: 'subtitle.vtt' }],
    ['字幕保存名だけ', { video_subtitle_name: '1700000000000_507f1f77bcf86cd799439011.vtt' }],
  ])('動画で%sを指定すると拒否する', (_label, subtitle) => {
    expect(() => adapter.adaptPostCreate({
      floor_id: floorId,
      room_id: roomId,
      content: 'x',
      video_name: 'video.mp4',
      video_thumbnail_name: 'video_thumbnail.png',
      ...subtitle,
    })).toThrow(expect.objectContaining({ code: 'INVALID_PARAMS' }));
  });

  test('本体メディアの解除と矛盾する空でない付随項目を拒否する', () => {
    expect(() => adapter.adaptReplyUpdate({
      room_id: roomId,
      post_id: postId,
      reply_id: replyId,
      content: 'x',
      image_name: null,
      image_caption: 'still present',
    })).toThrow(expect.objectContaining({ code: 'INVALID_PARAMS' }));
  });

  test('作成時の空の付随メディア項目だけならメディアなしとして扱う', () => {
    expect(adapter.adaptPostSupplementCreate({
      room_id: roomId,
      post_id: postId,
      content: 'x',
      audio_title: '',
      audio_description: null,
    })).toEqual(expect.not.objectContaining({ audio_title: expect.anything() }));
  });

  test.each([null, 1, {}, 'x'.repeat(401)])('不正な内容を拒否する: %p', (content) => {
    expect(() => adapter.adaptPostCreate({ floor_id: floorId, room_id: roomId, content }))
      .toThrow(expect.objectContaining({ code: 'INVALID_PARAMS' }));
  });

  test.each([
    ['image_caption', 200, { image_name: 'image.png', image_thumbnail_name: 'image_thumbnail.png' }],
    ['video_subtitle_originalname', 100, {
      video_name: 'video.mp4',
      video_thumbnail_name: 'video_thumbnail.png',
      video_subtitle_name: 'subtitle.vtt',
    }],
    ['audio_title', 200, { audio_name: 'audio.mp3' }],
    ['audio_description', 200, { audio_name: 'audio.mp3' }],
  ])('%sは通常APIと同じ最大%d文字まで受理する', (field, limit, media) => {
    expect(() => adapter.adaptPostCreate({
      floor_id: floorId,
      room_id: roomId,
      content: 'x',
      ...media,
      [field]: 'x'.repeat(limit),
    })).not.toThrow();

    expect(() => adapter.adaptPostCreate({
      floor_id: floorId,
      room_id: roomId,
      content: 'x',
      ...media,
      [field]: 'x'.repeat(limit + 1),
    })).toThrow(expect.objectContaining({ code: 'INVALID_PARAMS' }));
  });
});
