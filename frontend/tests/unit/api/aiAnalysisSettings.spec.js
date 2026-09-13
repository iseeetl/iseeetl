import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import aiAnalysisSettingsApi, { buildCommonPaginateParams } from '@/api/aiAnalysisSettings';

describe('AI解析設定API', () => {
  let originalGet;
  let originalPost;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
  });

  it('初期ユーザは設定範囲ごとのAPIから取得する', async () => {
    const calls = [];
    apiClient.post = (url, payload) => { calls.push({ url, payload }); return Promise.resolve({ data: null }); };
    await aiAnalysisSettingsApi.common.defaultResultUser();
    await aiAnalysisSettingsApi.floor.defaultResultUser({ floor_id: 'floor-1' });
    await aiAnalysisSettingsApi.room.defaultResultUser({ floor_id: 'floor-1', room_id: 'room-1' });
    expect(calls).to.deep.equal([
      { url: '/api/aianalysissetting/management/default-result-user', payload: {} },
      { url: '/api/flooraianalysissetting/default-result-user', payload: { floor_id: 'floor-1' } },
      { url: '/api/roomaianalysissetting/default-result-user', payload: { floor_id: 'floor-1', room_id: 'room-1' } },
    ]);
  });

  it('一覧取得ではページと検索語だけをクエリへ渡す', async () => {
    const calls = [];
    apiClient.get = (url, config) => {
      calls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    await aiAnalysisSettingsApi.common.paginate({ page: 2, search: null });
    await aiAnalysisSettingsApi.common.paginate({ page: 3, search: 'speech', delete_flg: false });

    expect(calls).to.deep.equal([
      {
        url: '/api/aianalysissetting/management/paginate',
        config: { params: { page: 2, search: '' } },
      },
      {
        url: '/api/aianalysissetting/management/paginate',
        config: { params: { page: 3, search: 'speech' } },
      },
    ]);
  });

  it('共通設定の一覧・作成・更新とタグ取得は管理APIを使う', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await aiAnalysisSettingsApi.common.list();
    await aiAnalysisSettingsApi.common.create({ category_tag: 'tag-1' });
    await aiAnalysisSettingsApi.common.update({ _id: 'setting-1' });
    await aiAnalysisSettingsApi.common.remove({ _id: 'setting-1', revision: 4 });
    await aiAnalysisSettingsApi.categoryTags.list();

    expect(calls.map(({ url }) => url)).to.deep.equal([
      '/api/aianalysissetting/management',
      '/api/aianalysissetting/management/create',
      '/api/aianalysissetting/management/update',
      '/api/aianalysissetting/management/delete',
      '/api/categorytag/management',
    ]);
    expect(calls[0].payload).to.deep.equal({});
    expect(calls[3].payload).to.deep.equal({ _id: 'setting-1', revision: 4 });
    expect(calls[4].payload).to.deep.equal({});
  });

  it('フロア設定の一覧・作成・更新・削除と対象フロア内の投稿者検索を提供する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };
    const payload = { floor_id: 'floor-1' };

    await aiAnalysisSettingsApi.floor.list(payload);
    await aiAnalysisSettingsApi.floor.create(payload);
    await aiAnalysisSettingsApi.floor.update(payload);
    await aiAnalysisSettingsApi.floor.remove(payload);
    await aiAnalysisSettingsApi.floor.searchResultUsers({ ...payload, search: 'alice' });

    expect(calls.map(({ url }) => url)).to.deep.equal([
      '/api/flooraianalysissetting',
      '/api/flooraianalysissetting/create',
      '/api/flooraianalysissetting/update',
      '/api/flooraianalysissetting/delete',
      '/api/flooraianalysissetting/result-users/search',
    ]);
    expect(calls[4].payload).to.deep.equal({ floor_id: 'floor-1', search: 'alice' });
    expect(aiAnalysisSettingsApi.floor.restore).to.equal(undefined);
    expect(aiAnalysisSettingsApi.floor.parentPreview).to.equal(undefined);
  });

  it('ルーム設定と解析結果の投稿者検索は許可されたAPIを使う', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };
    const payload = { floor_id: 'floor-1', room_id: 'room-1' };

    await aiAnalysisSettingsApi.room.list(payload);
    await aiAnalysisSettingsApi.room.create(payload);
    await aiAnalysisSettingsApi.room.update(payload);
    await aiAnalysisSettingsApi.room.remove(payload);
    await aiAnalysisSettingsApi.room.searchResultUsers({ ...payload, search: 'alice' });
    await aiAnalysisSettingsApi.resultUsers.search({ search: 'alice' });

    expect(calls.map(({ url }) => url)).to.deep.equal([
      '/api/roomaianalysissetting',
      '/api/roomaianalysissetting/create',
      '/api/roomaianalysissetting/update',
      '/api/roomaianalysissetting/delete',
      '/api/roomaianalysissetting/result-users/search',
      '/api/user/ai-analysis-result-users/search',
    ]);
    expect(calls[4].payload).to.deep.equal({
      floor_id: 'floor-1',
      room_id: 'room-1',
      search: 'alice',
    });
    expect(calls[5].payload).to.deep.equal({ search: 'alice' });
    expect(aiAnalysisSettingsApi.room.restore).to.equal(undefined);
    expect(aiAnalysisSettingsApi.room.parentPreview).to.equal(undefined);
  });

  it('一覧取得では未指定の削除条件を送らない', () => {
    expect(buildCommonPaginateParams({ page: 1, search: ' x ' })).to.deep.equal({
      page: 1,
      search: ' x ',
    });
  });
});
