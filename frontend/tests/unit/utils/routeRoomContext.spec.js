import { expect } from 'vitest';
import { buildRoomContextQuery, resolveRoomContextIds, withRoomContextQuery } from '@/utils/routeRoomContext';

describe('ルートからのフロア・ルーム情報の取得', () => {
  it('resolveRoomContextIdsはパラメータをクエリより優先する', () => {
    const result = resolveRoomContextIds({
      params: { floor_id: 'params-floor', room_id: 'params-room' },
      query: { floor_id: 'query-floor', room_id: 'query-room' },
    });

    expect(result).to.deep.equal({ floorId: 'params-floor', roomId: 'params-room' });
  });

  it('resolveRoomContextIdsは取得元とtrimを指定できる', () => {
    const result = resolveRoomContextIds(
      {
        params: { floor_id: 'params-floor', room_id: 'params-room' },
        query: { floor_id: ' query-floor ', room_id: ' query-room ' },
      },
      { source: 'query', trim: true }
    );

    expect(result).to.deep.equal({ floorId: 'query-floor', roomId: 'query-room' });
  });

  it('buildRoomContextQueryは存在する外部クエリキーだけを返す', () => {
    expect(buildRoomContextQuery({ params: { floor_id: 1 } }, { source: 'params' })).to.deep.equal({
      floor_id: '1',
    });
  });

  it('withRoomContextQueryはパラメータ、クエリ、パスの順で補完し既存クエリを優先する', () => {
    const result = withRoomContextQuery(
      { name: 'Login', query: { room_id: 'keep-room' } },
      {
        params: {},
        query: { floor_id: 'query-floor' },
        path: '/floor/path-floor/room/path-room',
      }
    );

    expect(result).to.deep.equal({
      name: 'Login',
      query: { floor_id: 'query-floor', room_id: 'keep-room' },
    });
  });

  it('withRoomContextQueryは対象外ルートへコンテキストを追加しない', () => {
    const result = withRoomContextQuery({ name: 'Floor' }, { params: { floor_id: 'floor-1', room_id: 'room-1' } });

    expect(result).to.deep.equal({ name: 'Floor', query: undefined });
  });

  it('Cookieポリシーへの確認導線へルームコンテキストを引き継ぐ', () => {
    const result = withRoomContextQuery(
      { name: 'CookiePolicy' },
      { params: { floor_id: 'floor-1', room_id: 'room-1' } }
    );

    expect(result).to.deep.equal({
      name: 'CookiePolicy',
      query: { floor_id: 'floor-1', room_id: 'room-1' },
    });
  });
});
