import { expect } from 'vitest';
const { buildScopedTagRequest } = require('../../e2e/specs/helpers/management-tag-fixture');

describe('E2Eの管理用タグデータ', () => {
  it('フロアタグ作成用の製品API リクエストを構築する', () => {
    expect(
      buildScopedTagRequest({ scope: 'floor', scopeId: 'floor-1', name: 'floor-tag', order: 12 })
    ).to.deep.equal({
      path: '/api/floortag/create',
      body: { floor_id: 'floor-1', order: 12, name: 'floor-tag', lang: 'ja' },
    });
  });

  it('ルームタグ作成用の製品API リクエストを構築する', () => {
    expect(buildScopedTagRequest({ scope: 'room', scopeId: 'room-1', name: 'room-tag' })).to.deep.equal({
      path: '/api/roomtag/create',
      body: { room_id: 'room-1', order: 10, name: 'room-tag', lang: 'ja' },
    });
  });

  it('未対応対象範囲と空の対象範囲 IDを拒否する', () => {
    expect(() => buildScopedTagRequest({ scope: 'post', scopeId: 'id', name: 'tag' })).to.throw(
      'タグのテストデータの範囲はfloorまたはroomにしてください。'
    );
    expect(() => buildScopedTagRequest({ scope: 'floor', scopeId: '', name: 'tag' })).to.throw(
      'タグのテストデータの対象範囲のIDが必要です。'
    );
  });
});
