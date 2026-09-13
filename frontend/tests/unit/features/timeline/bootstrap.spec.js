import { expect } from 'vitest';
import chatApi from '@/api/chat';
import kickedUserApi from '@/api/kickedUser';
import roomApi from '@/api/room';
import tagApi from '@/api/tag';
import quickTextAPI from '@/api/quickText';
import {
  checkKickedUser,
  checkRoomAndRoles,
  bootstrapRoomResources,
  refreshRoomRole,
  initTimeLine,
} from '@/features/timeline/bootstrap';
import { beginPlannedPageLeave, resetPlannedPageLeave } from '@/utils/plannedPageLeave';

describe('タイムラインの初期化', () => {
  const originals = {};

  beforeEach(() => {
    originals.kickedUserCheck = kickedUserApi.check;
    originals.roomDetail = roomApi.detail;
    originals.chatRole = chatApi.role;
    originals.roomTagList = tagApi.roomTag.list;
    originals.soundTagFetch = tagApi.soundTag.fetch;
    originals.quickTextGroups = quickTextAPI.getGroups;
    originals.quickTextItems = quickTextAPI.getItems;
  });

  afterEach(() => {
    kickedUserApi.check = originals.kickedUserCheck;
    roomApi.detail = originals.roomDetail;
    chatApi.role = originals.chatRole;
    tagApi.roomTag.list = originals.roomTagList;
    tagApi.soundTag.fetch = originals.soundTagFetch;
    quickTextAPI.getGroups = originals.quickTextGroups;
    quickTextAPI.getItems = originals.quickTextItems;
    resetPlannedPageLeave();
  });

  it('checkKickedUser は未ログインならfalseを返す', async () => {
    kickedUserApi.check = () => {
      throw new Error('呼び出してはいけません');
    };

    const result = await checkKickedUser({
      $store: { getters: { userIsLogin: false } },
    });

    expect(result).to.equal(false);
  });

  it('checkKickedUser はキック済みならエラー表示と遷移を行う', async () => {
    const dispatchCalls = [];
    const pushCalls = [];
    kickedUserApi.check = () => Promise.resolve({ data: true });

    const result = await checkKickedUser({
      $route: { params: { floor_id: 'floor-1' } },
      $store: { getters: { userIsLogin: true }, dispatch: (type, payload) => dispatchCalls.push({ type, payload }) },
      $router: { push: (payload) => pushCalls.push(payload) },
      $t: (key) => key,
    });

    expect(result).to.equal(true);
    expect(dispatchCalls[0].type).to.equal('doUpdateErrorMessage');
    expect(pushCalls[0]).to.deep.equal({ name: 'Floor' });
  });

  it('checkKickedUser はAPI例外を再送出する', async () => {
    const error = new Error('network');
    kickedUserApi.check = () => Promise.reject(error);

    let caught = null;
    try {
      await checkKickedUser({
        $route: { params: { floor_id: 'floor-1' } },
        $store: { getters: { userIsLogin: true }, dispatch: () => {} },
        $router: { push: () => {} },
        $t: (key) => key,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).to.equal(error);
  });

  it('refreshRoomRole は現在ルームの有効ロールを再取得して反映する', async () => {
    const requests = [];
    const dispatchCalls = [];
    chatApi.role = (payload) => {
      requests.push(payload);
      return Promise.resolve({ data: { role: 'FloorMember' } });
    };
    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-1' } },
      $store: {
        getters: { userIsLogin: true, floorId: 'floor-old', roomId: 'room-old' },
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      room: { isAdmin: false, isFloorEditor: true, isFloorMember: false, isRoomMember: false },
    };

    const role = await refreshRoomRole(ctx);

    expect(role).to.equal('FloorMember');
    expect(requests).to.deep.equal([{ floor_id: 'floor-1', room_id: 'room-1' }]);
    expect(ctx.room.isFloorEditor).to.equal(false);
    expect(ctx.room.isFloorMember).to.equal(true);
    expect(dispatchCalls).to.deep.equal([{ type: 'doUpdateRoomRole', payload: { role: 'FloorMember' } }]);
  });

  it('checkRoomAndRoles は権限情報とルーム状態を更新する', async () => {
    roomApi.detail = () =>
      Promise.resolve({
        data: {
          _id: 'room-1',
          floor: { _id: 'floor-1', target_langs: ['ja'], title: 'Floor title' },
          member_only: false,
          notification: true,
          external_sns_button: true,
          guest_reaction_only: false,
          user: { _id: 'owner-1', username: 'owner' },
          created_at: '2024-01-01',
        },
      });
    chatApi.role = () => Promise.resolve({ data: { role: 'Administrator' } });

    const dispatched = [];
    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-1' } },
      $store: {
        getters: { userIsLogin: true, roomTitle: 'Room title' },
        dispatch: (type) => dispatched.push(type),
      },
      $t: (key) => key,
      room: {
        title: '',
        description: '',
        creator: '',
        createdAt: null,
        imageUrl: null,
        isMemberOnly: false,
        roomNotification: true,
        showExternalShareButton: false,
        guestReactionOnly: false,
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        isRoomMember: false,
      },
      getTranslatedTitle: (data) => data.title || 'Room title',
      getTranslatedDescription: () => 'desc',
    };

    const room = await checkRoomAndRoles(ctx);

    expect(room._id).to.equal('room-1');
    expect(ctx.room.isAdmin).to.equal(true);
    expect(ctx.room.isFloorEditor).to.equal(false);
    expect(ctx.room.title).to.equal('Room title');
    expect(ctx.room.creatorUser).to.deep.equal({ _id: 'owner-1', username: 'owner' });
    expect(ctx.room.showExternalShareButton).to.equal(true);
    expect(dispatched.length).to.be.greaterThan(0);
  });

  it('checkRoomAndRoles はフロア不一致ならエラーになる', async () => {
    roomApi.detail = () =>
      Promise.resolve({
        data: {
          _id: 'room-1',
          floor: { _id: 'floor-1' },
          member_only: false,
        },
      });

    const ctx = {
      $route: { params: { floor_id: 'floor-2', room_id: 'room-1' } },
      $store: { getters: { userIsLogin: false } },
      $t: (key) => key,
      room: {},
    };

    let error;
    try {
      await checkRoomAndRoles(ctx);
    } catch (err) {
      error = err;
    }

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('タイムラインの初期化に失敗しました');
  });

  it('checkRoomAndRoles はメンバー専用で未ログインならエラーになる', async () => {
    roomApi.detail = () =>
      Promise.resolve({
        data: {
          _id: 'room-2',
          floor: { _id: 'floor-1', target_langs: [] },
          member_only: true,
          notification: false,
          external_sns_button: false,
          guest_reaction_only: false,
        },
      });

    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-2' } },
      $store: { getters: { userIsLogin: false } },
      $t: (key) => key,
      room: {
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        isRoomMember: false,
      },
    };

    let error;
    try {
      await checkRoomAndRoles(ctx);
    } catch (err) {
      error = err;
    }

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('入室の許可がありません');
  });

  it('checkRoomAndRoles は権限が無い場合にエラーになる', async () => {
    roomApi.detail = () =>
      Promise.resolve({
        data: {
          _id: 'room-3',
          floor: { _id: 'floor-1', target_langs: [] },
          member_only: true,
          notification: false,
          external_sns_button: false,
          guest_reaction_only: false,
        },
      });
    chatApi.role = () => Promise.resolve({ data: { role: 'Guest' } });

    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-3' } },
      $store: { getters: { userIsLogin: true }, dispatch: () => {} },
      $t: (key) => key,
      room: {
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        isRoomMember: false,
      },
    };

    let error;
    try {
      await checkRoomAndRoles(ctx);
    } catch (err) {
      error = err;
    }

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('入室の許可がありません');
  });

  it('initTimeLine は画面破棄後の初期化結果を反映しない', async () => {
    let resolveRoomDetail;
    roomApi.detail = () =>
      new Promise((resolve) => {
        resolveRoomDetail = resolve;
      });

    let current = true;
    let connectCount = 0;
    const analyticsRooms = [];
    const dispatchCalls = [];
    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-stale' } },
      $router: { push: () => {} },
      $store: {
        getters: { userIsLogin: false },
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      $t: (key) => key,
      room: {},
      captureTimelineLifecycle: () => 1,
      canApplyTimelineRequest: (generation) => current && generation === 1,
      shouldIgnoreTimelineRequestError: () => !current,
      connectInitialSocket: () => {
        connectCount += 1;
      },
      activateTimelineAnalytics: (room) => analyticsRooms.push(room),
    };

    const initialization = initTimeLine(ctx);
    await Promise.resolve();
    current = false;
    resolveRoomDetail({ data: {} });
    await initialization;

    expect(dispatchCalls).to.deep.equal([]);
    expect(connectCount).to.equal(0);
    expect(analyticsRooms).to.deep.equal([]);
    expect(ctx.timelineResourcesReady).to.equal(undefined);
  });

  it('initTimeLine は計画的離脱中の通信失敗を共通エラーへ保存しない', async () => {
    roomApi.detail = () => Promise.reject(new Error('Network Error'));
    const dispatchCalls = [];
    let connectCount = 0;
    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-leave' } },
      $router: { push: () => {} },
      $store: {
        getters: { userIsLogin: false },
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      $t: (key) => key,
      room: {},
      connectInitialSocket: () => {
        connectCount += 1;
      },
    };

    beginPlannedPageLeave();
    await initTimeLine(ctx);

    expect(dispatchCalls).to.deep.equal([]);
    expect(connectCount).to.equal(0);
  });

  it('initTimeLine は初期化成功時に初期接続APIを呼ぶ', async () => {
    roomApi.detail = () =>
      Promise.resolve({
        data: {
          _id: 'room-initial',
          title: 'Room title',
          floor: { _id: 'floor-1', title: 'Floor title', target_langs: [] },
          member_only: false,
          notification: true,
          external_sns_button: false,
          guest_reaction_only: false,
        },
      });
    tagApi.roomTag.list = () => Promise.resolve({ data: [] });
    quickTextAPI.getGroups = () => Promise.resolve({ data: [] });
    quickTextAPI.getItems = () => Promise.resolve({ data: [] });
    let connectCount = 0;
    const analyticsRooms = [];
    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-initial' }, query: {} },
      $router: { push: () => {} },
      $store: {
        getters: {
          userIsLogin: false,
          guestId: 'guest-1',
          guestSoundTags: [],
          roomId: 'room-initial',
          roomTitle: 'Room title',
        },
        dispatch: () => Promise.resolve(),
      },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
      $t: (key) => key,
      room: {
        title: '',
        description: '',
        creator: '',
        createdAt: null,
        imageUrl: null,
        isMemberOnly: false,
        roomNotification: true,
        showExternalShareButton: false,
        guestReactionOnly: false,
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        isRoomMember: false,
        tags: [],
        quickTextGroups: [],
        quickTextItemsByGroup: {},
      },
      dialogs: { sound: { tagId: null, tags: [] } },
      ui: { tempQueryTagNames: [], localTagIds: [] },
      getTranslatedTitle: (data) => data.title,
      getTranslatedDescription: () => '',
      applyTimelineQueryFilters: () => {},
      connectInitialSocket: () => {
        connectCount += 1;
      },
      activateTimelineAnalytics: (room) => analyticsRooms.push(room),
    };

    await initTimeLine(ctx);

    expect(ctx.timelineResourcesReady).to.equal(true);
    expect(analyticsRooms).to.have.lengthOf(1);
    expect(analyticsRooms[0]._id).to.equal('room-initial');
    expect(connectCount).to.equal(1);
  });

  it.each([
    [true, ['analytics', 'socket', 'focus']],
    [false, ['analytics', 'socket', 'focus']],
  ])(
    'TimeLinePostDetailは投稿詳細取得結果が%sでもルーム計測を確定する',
    async (focusSucceeded, expectedEvents) => {
      roomApi.detail = () => Promise.resolve({
        data: {
          _id: 'room-detail',
          title: 'Room title',
          floor: { _id: 'floor-1', title: 'Floor title', target_langs: [] },
          member_only: false,
          notification: true,
          external_sns_button: false,
          guest_reaction_only: false,
        },
      });
      tagApi.roomTag.list = () => Promise.resolve({ data: [] });
      quickTextAPI.getGroups = () => Promise.resolve({ data: [] });
      quickTextAPI.getItems = () => Promise.resolve({ data: [] });
      const events = [];
      const ctx = {
        $route: {
          params: {
            floor_id: 'floor-1',
            room_id: 'room-detail',
            post_id: 'post-1',
          },
          query: {},
        },
        $router: { push: () => {} },
        $store: {
          getters: {
            userIsLogin: false,
            guestId: 'guest-1',
            guestSoundTags: [],
            roomId: 'room-detail',
            roomTitle: 'Room title',
          },
          dispatch: () => Promise.resolve(),
        },
        $t: (key) => key,
        room: {
          isAdmin: false,
          isFloorEditor: false,
          isFloorMember: false,
          isRoomMember: false,
          tags: [],
          quickTextGroups: [],
          quickTextItemsByGroup: {},
        },
        dialogs: { sound: { tagId: null, tags: [] } },
        ui: { tempQueryTagNames: [], localTagIds: [] },
        getTranslatedTitle: (data) => data.title,
        getTranslatedDescription: () => '',
        applyTimelineQueryFilters: () => {},
        fetchFocusPostAndAppend: async () => {
          events.push('focus');
          return focusSucceeded;
        },
        activateTimelineAnalytics: () => events.push('analytics'),
        clearTimelineAnalytics: () => events.push('clear'),
        connectInitialSocket: () => events.push('socket'),
      };

      await initTimeLine(ctx);

      expect(events).to.deep.equal(expectedEvents);
      expect(ctx.timelineResourcesReady).to.equal(true);
    }
  );

  it('投稿詳細取得が未完了でもルーム計測とsocket接続を待たせない', async () => {
    roomApi.detail = () => Promise.resolve({
      data: {
        _id: 'room-detail',
        title: 'Room title',
        floor: { _id: 'floor-1', title: 'Floor title', target_langs: [] },
        member_only: false,
        notification: true,
        external_sns_button: false,
        guest_reaction_only: false,
      },
    });
    tagApi.roomTag.list = () => Promise.resolve({ data: [] });
    quickTextAPI.getGroups = () => Promise.resolve({ data: [] });
    quickTextAPI.getItems = () => Promise.resolve({ data: [] });
    const route = {
      params: {
        floor_id: 'floor-1',
        room_id: 'room-detail',
        post_id: 'post-pending',
      },
      query: {},
    };
    const focusRequests = [];
    const events = [];
    const ctx = {
      $route: route,
      $router: { push: () => {} },
      $store: {
        getters: {
          userIsLogin: false,
          guestId: 'guest-1',
          guestSoundTags: [],
          roomId: 'room-detail',
          roomTitle: 'Room title',
        },
        dispatch: () => Promise.resolve(),
      },
      $t: (key) => key,
      room: {
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        isRoomMember: false,
        tags: [],
        quickTextGroups: [],
        quickTextItemsByGroup: {},
      },
      dialogs: { sound: { tagId: null, tags: [] } },
      ui: {
        focusedPostId: 'post-pending',
        tempQueryTagNames: [],
        localTagIds: [],
      },
      getTranslatedTitle: (data) => data.title,
      getTranslatedDescription: () => '',
      applyTimelineQueryFilters: () => {},
      fetchFocusPostAndAppend: (postId) =>
        new Promise((resolve) => focusRequests.push({ postId, resolve })),
      activateTimelineAnalytics: () => events.push('analytics'),
      clearTimelineAnalytics: () => events.push('clear'),
      connectInitialSocket: () => events.push('socket'),
    };

    await initTimeLine(ctx);

    expect(focusRequests.map(({ postId }) => postId)).to.deep.equal(['post-pending']);
    expect(events).to.deep.equal(['analytics', 'socket']);
    expect(ctx.timelineResourcesReady).to.equal(true);
    focusRequests[0].resolve(false);
  });

  it('initTimeLine は権限不足ならルーム一覧へ遷移する', async () => {
    roomApi.detail = () =>
      Promise.resolve({
        data: {
          _id: 'room-10',
          floor: { _id: 'floor-1', target_langs: [] },
          member_only: true,
          notification: false,
          external_sns_button: false,
          guest_reaction_only: false,
        },
      });

    const dispatchCalls = [];
    let analyticsClearCount = 0;
    const pushCalls = [];
    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-10' } },
      $router: { push: (payload) => pushCalls.push(payload) },
      $store: { getters: { userIsLogin: false }, dispatch: (type, payload) => dispatchCalls.push({ type, payload }) },
      $t: (key) => key,
      room: {
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        isRoomMember: false,
      },
      clearTimelineAnalytics: () => {
        analyticsClearCount += 1;
      },
    };

    await initTimeLine(ctx);

    expect(dispatchCalls[0].type).to.equal('doUpdateErrorMessage');
    expect(dispatchCalls[0].payload).to.deep.equal({ message: '入室の許可がありません' });
    expect(pushCalls[0]).to.deep.equal({ name: 'Room', params: { floor_id: 'floor-1' } });
    expect(analyticsClearCount).to.equal(1);
  });

  it('バックエンドから受け取った未知のエラーメッセージをそのまま表示しない', async () => {
    roomApi.detail = () =>
      Promise.reject({
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: { code: 'INTERNAL_DETAIL', message: '内部情報' } },
        },
      });

    const dispatchCalls = [];
    let analyticsClearCount = 0;
    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-10' } },
      $router: { push: () => {} },
      $store: { getters: { userIsLogin: false }, dispatch: (type, payload) => dispatchCalls.push({ type, payload }) },
      $t: (key) => key,
      room: {},
      clearTimelineAnalytics: () => {
        analyticsClearCount += 1;
      },
    };

    await initTimeLine(ctx);

    expect(ctx.initializationError).to.equal('処理に失敗しました');
    expect(dispatchCalls).to.deep.equal([
      { type: 'doUpdateErrorMessage', payload: { message: '処理に失敗しました' } },
    ]);
    expect(analyticsClearCount).to.equal(1);
  });

  it('initTimeLine は401ならログアウトしてログインへ遷移する', async () => {
    kickedUserApi.check = () => Promise.resolve({ data: false });
    roomApi.detail = () => Promise.reject({ response: { status: 401 } });

    const dispatchCalls = [];
    const pushCalls = [];
    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-10' } },
      $router: { push: (payload) => pushCalls.push(payload) },
      $store: { getters: { userIsLogin: true }, dispatch: (type, payload) => dispatchCalls.push({ type, payload }) },
      $t: (key) => key,
      room: {
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        isRoomMember: false,
      },
    };

    await initTimeLine(ctx);

    expect(dispatchCalls.some((call) => call.type === 'doLogout')).to.equal(true);
    expect(dispatchCalls.some((call) => call.type === 'doUpdateErrorMessage')).to.equal(false);
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });

  it('checkRoomAndRoles は image_name をURLに反映する', async () => {
    roomApi.detail = () =>
      Promise.resolve({
        data: {
          _id: 'room-4',
          floor: { _id: 'floor-1', target_langs: [] },
          member_only: false,
          notification: false,
          external_sns_button: false,
          guest_reaction_only: false,
          image_name: 'room.png',
        },
      });

    const ctx = {
      $route: { params: { floor_id: 'floor-1', room_id: 'room-4' } },
      $store: { getters: { userIsLogin: false, roomTitle: '' }, dispatch: () => {} },
      $t: (key) => key,
      room: {
        title: '',
        description: '',
        creator: '',
        createdAt: null,
        imageUrl: null,
        isMemberOnly: false,
        roomNotification: true,
        showExternalShareButton: false,
        guestReactionOnly: false,
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        isRoomMember: false,
      },
      getTranslatedTitle: () => '',
      getTranslatedDescription: () => '',
    };

    await checkRoomAndRoles(ctx);

    expect(ctx.room.imageUrl).to.equal('/media/floor-1/room-4/room.png');
  });

  it('bootstrapRoomResources はタグと単語を取得する', async () => {
    tagApi.roomTag.list = () => Promise.resolve({ data: [{ _id: 'tag-1', name: 'tag' }] });
    tagApi.soundTag.fetch = () => Promise.resolve({ data: null });
    quickTextAPI.getGroups = () => Promise.resolve({ data: [] });
    quickTextAPI.getItems = () => Promise.resolve({ data: [] });

    const dispatchCalls = [];
    let appliedQuery = null;
    const ctx = {
      $route: { query: { tag: 'tag' } },
      $store: {
        getters: {
          userIsLogin: false,
          guestSoundTags: [],
          roomId: 'room-1',
          guestId: null,
        },
        dispatch: (type) => dispatchCalls.push(type),
      },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ui: {
        tempQueryTagNames: [],
        localTagIds: [],
      },
      room: {
        tags: [],
        quickTextGroups: [],
        quickTextItemsByGroup: {},
      },
      dialogs: {
        sound: { tagId: null, tags: [] },
      },
      findTagIdByNameOrTranslation: () => null,
      applyTimelineQueryFilters(query) {
        appliedQuery = {
          query,
          roomTags: this.room.tags.slice(),
        };
      },
    };

    await bootstrapRoomResources(ctx, { _id: 'room-1', floor: { _id: 'floor-1' } });

    expect(ctx.room.tags).to.have.lengthOf(1);
    expect(ctx.room.quickTextGroups).to.be.an('array');
    expect(dispatchCalls).to.include('doEnsureGuestAuth');
    expect(appliedQuery.query).to.deep.equal({ tag: 'tag' });
    expect(appliedQuery.roomTags).to.deep.equal([{ _id: 'tag-1', name: 'tag' }]);
  });

  it('bootstrapRoomResources はクエリタグ名をIDに変換する', async () => {
    tagApi.roomTag.list = () => Promise.resolve({ data: [] });
    tagApi.soundTag.fetch = () => Promise.resolve({ data: null });
    quickTextAPI.getGroups = () => Promise.resolve({ data: [] });
    quickTextAPI.getItems = () => Promise.resolve({ data: [] });

    const ctx = {
      $store: {
        getters: {
          userIsLogin: false,
          guestSoundTags: [],
          roomId: 'room-1',
          guestId: 'guest-1',
        },
        dispatch: () => {},
      },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
      ui: {
        tempQueryTagNames: [' TagA ', 'TagB'],
        localTagIds: [],
      },
      room: {
        tags: [],
        quickTextGroups: [],
        quickTextItemsByGroup: {},
      },
      dialogs: {
        sound: { tagId: null, tags: [] },
      },
      findTagIdByNameOrTranslation: (name) => (name === 'TagA' ? 'tag-1' : null),
    };

    await bootstrapRoomResources(ctx, { _id: 'room-1', floor: { _id: 'floor-1' } });

    expect(ctx.ui.localTagIds).to.deep.equal(['tag-1']);
  });

  it('bootstrapRoomResources は groups/items の docs を読み取る', async () => {
    tagApi.roomTag.list = () => Promise.resolve({ data: [] });
    tagApi.soundTag.fetch = () => Promise.resolve({ data: null });
    quickTextAPI.getGroups = () => Promise.resolve({ data: { docs: [{ _id: 'g1' }] } });
    quickTextAPI.getItems = () => Promise.resolve({ data: { docs: [{ _id: 'i1' }] } });

    const ctx = {
      $store: {
        getters: {
          userIsLogin: false,
          guestSoundTags: [],
          roomId: 'room-1',
          guestId: 'guest-1',
        },
        dispatch: () => {},
      },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
      ui: {
        tempQueryTagNames: [],
        localTagIds: [],
      },
      room: {
        tags: [],
        quickTextGroups: [],
        quickTextItemsByGroup: {},
      },
      dialogs: {
        sound: { tagId: null, tags: [] },
      },
      findTagIdByNameOrTranslation: () => null,
    };

    await bootstrapRoomResources(ctx, { _id: 'room-1', floor: { _id: 'floor-1' } });

    expect(ctx.room.quickTextGroups).to.have.lengthOf(1);
    expect(ctx.room.quickTextItemsByGroup.g1).to.have.lengthOf(1);
  });

  it('bootstrapRoomResources はゲスト保存済みのサウンドタグを反映する', async () => {
    tagApi.roomTag.list = () => Promise.resolve({ data: [] });
    tagApi.soundTag.fetch = () => Promise.resolve({ data: null });
    quickTextAPI.getGroups = () => Promise.resolve({ data: [] });
    quickTextAPI.getItems = () => Promise.resolve({ data: [] });

    const dispatchCalls = [];
    const ctx = {
      $store: {
        getters: {
          userIsLogin: false,
          guestSoundTags: [{ roomId: 'room-1', soundTags: ['sound-a'] }],
          roomId: 'room-1',
          guestId: 'guest-1',
        },
        dispatch: (type) => dispatchCalls.push(type),
      },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
      ui: {
        tempQueryTagNames: [],
        localTagIds: [],
      },
      room: {
        tags: [],
        quickTextGroups: [],
        quickTextItemsByGroup: {},
      },
      dialogs: {
        sound: { tagId: null, tags: [] },
      },
      findTagIdByNameOrTranslation: () => null,
    };

    await bootstrapRoomResources(ctx, { _id: 'room-1', floor: { _id: 'floor-1' } });

    expect(ctx.dialogs.sound.tagId).to.equal('room-1');
    expect(ctx.dialogs.sound.tags).to.deep.equal(['sound-a']);
    expect(dispatchCalls).to.not.include('doEnsureGuestAuth');
  });

  it('bootstrapRoomResources はログイン時のサウンドタグを反映する', async () => {
    tagApi.roomTag.list = () => Promise.resolve({ data: [] });
    tagApi.soundTag.fetch = () => Promise.resolve({ data: { _id: 'sound-1', tags: ['sound-b'] } });
    quickTextAPI.getGroups = () => Promise.resolve({ data: [] });
    quickTextAPI.getItems = () => Promise.resolve({ data: [] });

    const dispatchCalls = [];
    const ctx = {
      $store: {
        getters: {
          userIsLogin: true,
          guestSoundTags: [],
          roomId: 'room-1',
          guestId: null,
        },
        dispatch: (type) => dispatchCalls.push(type),
      },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
      ui: {
        tempQueryTagNames: [],
        localTagIds: [],
      },
      room: {
        tags: [],
        quickTextGroups: [],
        quickTextItemsByGroup: {},
      },
      dialogs: {
        sound: { tagId: null, tags: [] },
      },
      findTagIdByNameOrTranslation: () => null,
    };

    await bootstrapRoomResources(ctx, { _id: 'room-1', floor: { _id: 'floor-1' } });

    expect(ctx.dialogs.sound.tagId).to.equal('sound-1');
    expect(ctx.dialogs.sound.tags).to.deep.equal(['sound-b']);
    expect(dispatchCalls).to.not.include('doEnsureGuestAuth');
  });
});
