import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import chatApi from '@/api/chat';

describe('タイムラインAPI', () => {
  let originalPost;
  let originalPut;
  let originalPatch;
  let originalDelete;
  let originalGet;

  beforeEach(() => {
    originalPost = apiClient.post;
    originalPut = apiClient.put;
    originalPatch = apiClient.patch;
    originalDelete = apiClient.delete;
    originalGet = apiClient.get;
  });

  afterEach(() => {
    apiClient.post = originalPost;
    apiClient.put = originalPut;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
    apiClient.get = originalGet;
  });

  it('詳細取得は登録ユーザ用のGETとゲスト用のPOSTを使い分ける', async () => {
    const calls = [];
    apiClient.get = (...args) => { calls.push(['get', ...args]); return Promise.resolve({ data: {} }); };
    apiClient.post = (...args) => { calls.push(['post', ...args]); return Promise.resolve({ data: {} }); };
    await chatApi.fetchDetail({ room_id: 'room', post_id: 'post', isGuest: false });
    await chatApi.fetchDetail({ post_id: 'post', isGuest: true });
    expect(calls).to.deep.equal([
      ['get', '/api/rooms/room/timeline/posts/post'],
      ['post', '/api/chat/guest/detail', { post_id: 'post' }],
    ]);
  });

  it('通常一覧はGETで日時だけをクエリへ渡す', async () => {
    const calls = [];
    apiClient.get = (...args) => { calls.push(args); return Promise.resolve({ data: {} }); };
    await chatApi.fetchPosts({ floor_id: 'floor', room_id: 'room', isGuest: false });
    await chatApi.fetchPosts({ room_id: 'room', from: '2026-09-05T00:00:00Z', isGuest: false });
    expect(calls).to.deep.equal([
      ['/api/rooms/room/timeline/posts', { params: {} }],
      ['/api/rooms/room/timeline/posts', { params: { from: '2026-09-05T00:00:00Z' } }],
    ]);
  });

  it('fetchPosts はグローバル条件とカラム条件を分けて送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload) => {
      calls.push({ url, payload });
      return Promise.resolve({ data: {} });
    };

    const globalServerQuery = { tags: ['tag-1'] };
    const serverQuery = { keywordArray: ['important'] };
    await chatApi.fetchPosts({
      floor_id: 'floor',
      room_id: 'room',
      globalServerQuery,
      serverQuery,
      isGuest: false,
    });

    expect(calls[0].url).to.equal('/api/rooms/room/timeline/posts/search');
    expect(calls[0].payload).not.to.have.property('floor_id');
    expect(calls[0].payload.globalServerQuery).to.deep.equal(globalServerQuery);
    expect(calls[0].payload.serverQuery).to.deep.equal(serverQuery);
  });

  it('fetchPosts はゲスト分岐でエンドポイントが切り替わる', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await chatApi.fetchPosts({ floor_id: 'floor', room_id: 'room', isGuest: true });

    expect(calls[0].url).to.equal('/api/chat/guest');
    expect(calls[0].payload).to.deep.equal({
      floor_id: 'floor',
      room_id: 'room',
      from: null,
      to: null,
      globalServerQuery: null,
      serverQuery: null,
    });
  });

  it('タグ更新は対象URLへのPUTでタグ配列だけを送る', async () => {
    const calls = [];
    apiClient.put = (...args) => { calls.push(args); return Promise.resolve({ data: {} }); };
    await chatApi.tagPost({ room_id: 'room', _id: 'post', room_tags: ['tag'], floor_id: 'unused' });
    await chatApi.tagReply({ room_id: 'room', post_id: 'post', _id: 'reply', room_tags: [] });
    expect(calls).to.deep.equal([
      ['/api/rooms/room/timeline/posts/post/tags', { room_tags: ['tag'] }, {}],
      ['/api/rooms/room/timeline/posts/post/replies/reply/tags', { room_tags: [] }, {}],
    ]);
  });

  it('投稿作成時にアップロードの進捗通知を設定できる', async () => {
    const calls = [];
    const onUploadProgress = () => {};
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await chatApi.createPost({ room_id: 'room', content: 'hi', lang: 'en' }, { onUploadProgress });

    expect(calls[0].url).to.equal('/api/rooms/room/timeline/posts');
    expect(calls[0].payload).to.deep.equal({ content: 'hi', lang: 'en' });
    expect(calls[0].config).to.deep.equal({ onUploadProgress });
  });

  it('投稿更新はPATCHで変更項目だけ、削除はbodyなしDELETEで送る', async () => {
    const calls = [];
    apiClient.patch = (...args) => { calls.push(['patch', ...args]); return Promise.resolve(); };
    apiClient.delete = (...args) => { calls.push(['delete', ...args]); return Promise.resolve(); };
    await chatApi.updatePost({ room_id: 'room', _id: 'post', content: 'changed' });
    await chatApi.deletePost({ room_id: 'room', _id: 'post' });
    expect(calls).to.deep.equal([
      ['patch', '/api/rooms/room/timeline/posts/post', { content: 'changed' }, {}],
      ['delete', '/api/rooms/room/timeline/posts/post', {}],
    ]);
  });

  it.each([
    ['Reply', '/api/rooms/room/timeline/posts/post/replies', { room_id: 'room', post_id: 'post' }],
    ['Supplement', '/api/rooms/room/timeline/posts/post/supplements', { room_id: 'room', post_id: 'post' }],
    ['ReplySupplement', '/api/rooms/room/timeline/posts/post/replies/reply/supplements', { room_id: 'room', post_id: 'post', reply_id: 'reply' }],
  ])('%sの作成・取得・更新・削除では親IDをURLに、保存値だけを本文に含める', async (kind, path, scope) => {
    const calls = [];
    apiClient.post = (...args) => { calls.push(['post', ...args]); return Promise.resolve(); };
    apiClient.patch = (...args) => { calls.push(['patch', ...args]); return Promise.resolve(); };
    apiClient.delete = (...args) => { calls.push(['delete', ...args]); return Promise.resolve(); };
    await chatApi[`create${kind}`]({ ...scope, content: 'new', lang: 'en' });
    await chatApi[`update${kind}`]({ ...scope, _id: 'item', content: 'changed' });
    await chatApi[`delete${kind}`]({ ...scope, _id: 'item' });
    expect(calls).to.deep.equal([
      ['post', path, { content: 'new', lang: 'en' }, {}],
      ['patch', `${path}/item`, { content: 'changed' }, {}],
      ['delete', `${path}/item`, {}],
    ]);
  });

  it('updatePushFilter は PUT、deletePushFilter は DELETE を使う', async () => {
    const calls = [];
    apiClient.put = (url, payload, config) => {
      calls.push({ method: 'put', url, payload, config });
      return Promise.resolve({ data: {} });
    };
    apiClient.delete = (url, config) => {
      calls.push({ method: 'delete', url, config });
      return Promise.resolve({ data: {} });
    };

    await chatApi.updatePushFilter({ id: '1', name: 'x' });
    await chatApi.deletePushFilter({ id: '2' });

    expect(calls[0].method).to.equal('put');
    expect(calls[0].url).to.equal('/api/chat/pushfilter/1');
    expect(calls[0].payload).to.deep.equal({ name: 'x' });
    expect(calls[1].method).to.equal('delete');
    expect(calls[1].url).to.equal('/api/chat/pushfilter/2');
  });

  it('addReaction はユーザ用リアクションに POST する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await chatApi.addReaction({
      postId: 'post',
      reactionType: 'like',
      isUser: true,
    });

    expect(calls[0].url).to.equal('/api/chat/reaction');
    expect(calls[0].payload).to.deep.equal({ post_id: 'post', type: 'like' });
    expect(calls[0].config).to.equal(undefined);
  });

  it('toggleReaction は delete のとき reaction_id を送る', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await chatApi.toggleReaction({
      postId: 'post',
      reactionType: 'like',
      isUser: true,
      isDelete: true,
      reactionId: 'rid',
    });

    expect(calls[0].url).to.equal('/api/chat/reaction/delete');
    expect(calls[0].payload).to.deep.equal({ post_id: 'post', reaction_id: 'rid' });
  });

  it('ゲストのリアクション追加はCookie付きのPOSTで送信する', async () => {
    const calls = { post: [] };
    apiClient.post = (url, payload, config) => {
      calls.post.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await chatApi.addReaction({
      postId: 'post',
      reactionType: 'like',
      isUser: false,
      guestName: 'Guest',
    });

    expect(calls.post[0].url).to.equal('/api/chat/guest/reaction');
    expect(calls.post[0].payload).to.deep.equal({
      post_id: 'post',
      type: 'like',
      guest_name: 'Guest',
    });
    expect(calls.post[0].config).to.deep.equal({ withCredentials: true });
  });

  it('ゲストのリアクション解除はCookie付きでreaction_idを送信する', async () => {
    const calls = { post: [] };
    apiClient.post = (url, payload, config) => {
      calls.post.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await chatApi.toggleReaction({
      postId: 'post',
      reactionType: 'like',
      isUser: false,
      isDelete: true,
      reactionId: 'rid',
      guestName: 'Guest',
    });

    expect(calls.post[0].url).to.equal('/api/chat/guest/reaction/delete');
    expect(calls.post[0].payload).to.deep.equal({
      post_id: 'post',
      reaction_id: 'rid',
      guest_name: 'Guest',
    });
    expect(calls.post[0].config).to.deep.equal({ withCredentials: true });
  });

  it('managementTimelineMedia は responseType を渡す', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await chatApi.managementTimelineMedia({ room_id: 'room' }, { responseType: 'blob' });

    expect(calls[0].url).to.equal('/api/chat/management/timeline/media');
    expect(calls[0].config).to.deep.equal({ responseType: 'blob' });
  });
});
