import { describe, it, expect } from 'vitest';
import { buildPostCreate, buildPostPatch } from '@/api/postPayload';

describe('投稿の送信データ', () => {
  it('createは画面情報、未使用メディア、空の任意項目を送らない', () => {
    expect(buildPostCreate({ content: 'hello', lang: 'en', room_tags: [], animation: null,
      floor_title: 'floor', user_id: 'user', keyup: ['h'], target_langs: ['ja'], image_name: null }))
      .toEqual({ content: 'hello', lang: 'en' });
  });
  it('PATCHは本文だけの編集で言語・メディア・タグを送らない', () => {
    const initial = { content: 'before', lang: 'en', room_tags: ['b', 'a'], image_name: 'image.png', image_caption: 'caption' };
    expect(buildPostPatch({ ...initial, content: 'after', room_tags: ['a', 'b'] }, initial))
      .toEqual({ content: 'after' });
  });
  it('PATCHは解除、空配列、メディア種類切替を明示する', () => {
    const initial = { content: 'text', room_tags: ['tag'], image_name: 'old.png', image_thumbnail_name: 'thumb.png' };
    expect(buildPostPatch({ ...initial, content: null, room_tags: [], image_name: null, audio_name: 'new.mp3' }, initial))
      .toEqual({ content: null, room_tags: [], media: { image: null, audio: { file_name: 'new.mp3', title: null, description: null } } });
  });
  it('キャプションだけを変更し、変更がなければ空のPATCHにする', () => {
    const initial = { image_name: 'old.png', image_thumbnail_name: 'thumb.png', image_caption: 'old' };
    expect(buildPostPatch({ ...initial, image_caption: null }, initial)).toEqual({ media: { image: { caption: null } } });
    expect(buildPostPatch(initial, initial)).toEqual({});
  });
});
