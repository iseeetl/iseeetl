import { expect, vi } from 'vitest';

import { createTimelineTracker } from '@/features/analytics/timelineTracking.js';

const FLOOR_ID = '507F1F77BCF86CD799439011';
const ROOM_A_ID = '507f191e810c19729de860ea';
const ROOM_B_ID = '507f191e810c19729de860eb';
const TAG_A_ID = '111111111111111111111111';
const TAG_B_ID = '222222222222222222222222';
const QUICK_TEXT_ID = 'abcdefabcdefabcdefabcdef';

const roomDetails = ({
  roomId = ROOM_A_ID,
  floorTitle = ' フロアA ',
  roomTitle = ' ルームA ',
  roomTags = [
    { _id: TAG_A_ID, name: 'タグA' },
    { _id: TAG_B_ID, name: 'タグB' },
  ],
} = {}) => ({
  room: {
    _id: roomId,
    title: roomTitle,
    floor: { _id: FLOOR_ID, title: floorTitle },
  },
  roomTags,
});

const createHarness = ({
  track = vi.fn(() => true),
  activatePageResource = vi.fn((_room, onPageViewSent) => {
    onPageViewSent();
    return true;
  }),
  cancelPageResource = vi.fn(() => true),
} = {}) => {
  let currentRoomId = ROOM_A_ID;
  const tracker = createTimelineTracker({
    track,
    getCurrentRoomId: () => currentRoomId,
    activatePageResource,
    cancelPageResource,
  });
  const activate = (details = roomDetails()) => {
    const token = tracker.beginRoom(details.room._id);
    expect(tracker.activateRoom(token, details)).to.equal(true);
    return tracker.capture();
  };
  return {
    activate,
    activatePageResource,
    cancelPageResource,
    setCurrentRoomId: (roomId) => { currentRoomId = roomId; },
    track,
    tracker,
  };
};

const callsFor = (track, eventName) =>
  track.mock.calls.filter(([name]) => name === eventName).map(([, parameters]) => parameters);

describe('タイムラインの計測開始と終了', () => {
  it('変更できないAPIを返し、依存関数が不足している場合は生成しない', () => {
    const tracker = createTimelineTracker({ track: () => true, getCurrentRoomId: () => ROOM_A_ID });

    expect(Object.isFrozen(tracker)).to.equal(true);
    expect(Object.keys(tracker)).to.deep.equal(['beginRoom', 'activateRoom', 'clear', 'capture', 'report']);
    expect(() => createTimelineTracker()).to.throw(TypeError);
  });

  it('ルーム detailだけから共通コンテキストを正規化し、初期化成功時にtimeline_viewを1回送る', () => {
    const { activatePageResource, track, tracker } = createHarness();
    const beginToken = tracker.beginRoom(` ${ROOM_A_ID.toUpperCase()} `);

    expect(Object.isFrozen(beginToken)).to.equal(true);
    expect(tracker.activateRoom(beginToken, roomDetails())).to.equal(true);
    expect(tracker.activateRoom(beginToken, roomDetails())).to.equal(false);
    expect(activatePageResource).toHaveBeenCalledOnce();
    expect(activatePageResource).toHaveBeenCalledWith(
      roomDetails().room,
      expect.any(Function)
    );
    expect(callsFor(track, 'timeline_view')).to.deep.equal([{
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
      room_id: ROOM_A_ID,
      room_title: 'ルームA',
    }]);
    expect(Object.isFrozen(track.mock.calls[0][1])).to.equal(true);
    expect(track.mock.calls[0][1]).not.to.have.property('visitor_type');
  });

  it('対象ページを先に有効化してからtimeline_viewを送り、失敗時はコンテキストを作らない', () => {
    const calls = [];
    const activatePageResource = vi.fn((_room, onPageViewSent) => {
      calls.push('page_view');
      onPageViewSent();
      return true;
    });
    const track = vi.fn((eventName) => {
      calls.push(eventName);
      return true;
    });
    const success = createHarness({ track, activatePageResource });

    expect(success.tracker.activateRoom(
      success.tracker.beginRoom(ROOM_A_ID),
      roomDetails()
    )).to.equal(true);
    expect(calls).to.deep.equal(['page_view', 'timeline_view']);

    const failure = createHarness({ activatePageResource: vi.fn(() => false) });
    expect(failure.tracker.activateRoom(
      failure.tracker.beginRoom(ROOM_A_ID),
      roomDetails()
    )).to.equal(false);
    expect(failure.tracker.capture()).to.equal(null);
    expect(failure.track).not.toHaveBeenCalled();
  });

  it('page_viewが保留された場合は実送信コールバック後にtimeline_viewを一度だけ送る', () => {
    let notifyPageViewSent = null;
    const activatePageResource = vi.fn((_room, callback) => {
      notifyPageViewSent = callback;
      return true;
    });
    const { track, tracker } = createHarness({ activatePageResource });

    expect(tracker.activateRoom(tracker.beginRoom(ROOM_A_ID), roomDetails())).to.equal(true);
    expect(callsFor(track, 'timeline_view')).to.have.length(0);
    expect(notifyPageViewSent).to.be.a('function');

    expect(notifyPageViewSent()).to.equal(true);
    expect(notifyPageViewSent()).to.equal(false);
    expect(callsFor(track, 'timeline_view')).to.have.length(1);
  });

  it('clearは未解決/解決済み対象ページを一度だけcancelする', () => {
    const { cancelPageResource, tracker } = createHarness();
    tracker.beginRoom(ROOM_A_ID);

    expect(tracker.clear()).to.equal(true);
    expect(tracker.clear()).to.equal(true);
    expect(cancelPageResource).toHaveBeenCalledOnce();
  });

  it('現在のルートが一致しない場合やID・ルームタグ一覧が不正な場合は計測を開始しない', () => {
    const { setCurrentRoomId, track, tracker } = createHarness();
    const wrongRouteToken = tracker.beginRoom(ROOM_A_ID);
    setCurrentRoomId(ROOM_B_ID);
    expect(tracker.activateRoom(wrongRouteToken, roomDetails())).to.equal(false);

    setCurrentRoomId(ROOM_A_ID);
    const invalidFloor = roomDetails();
    invalidFloor.room.floor._id = 'invalid';
    expect(tracker.activateRoom(tracker.beginRoom(ROOM_A_ID), invalidFloor)).to.equal(false);

    expect(
      tracker.activateRoom(tracker.beginRoom(ROOM_A_ID), { ...roomDetails(), roomTags: null })
    ).to.equal(false);
    expect(tracker.capture()).to.equal(null);
    expect(track).not.toHaveBeenCalled();
  });

  it('ルーム変更・解除・先行する画面遷移の後に旧取得処理が成功しても反映しない', () => {
    const { activate, setCurrentRoomId, track, tracker } = createHarness();
    const roomAToken = activate();
    track.mockClear();

    setCurrentRoomId(ROOM_B_ID);
    const roomBToken = tracker.beginRoom(ROOM_B_ID);
    expect(tracker.activateRoom(roomBToken, roomDetails({ roomId: ROOM_B_ID }))).to.equal(true);
    expect(
      tracker.report(roomAToken, {
        kind: 'reaction_change', content: 'post', action: 'add', reactionType: 'いいね',
      })
    ).to.equal(0);
    expect(callsFor(track, 'timeline_reaction_change')).to.have.length(0);

    const capturedB = tracker.capture();
    tracker.clear();
    expect(tracker.capture()).to.equal(null);
    expect(
      tracker.report(capturedB, {
        kind: 'reaction_change', content: 'post', action: 'add', reactionType: 'いいね',
      })
    ).to.equal(0);
  });

  it('ルートだけが変わった場合も取得と計測を停止する', () => {
    const { activate, setCurrentRoomId, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    setCurrentRoomId(ROOM_B_ID);
    expect(tracker.capture()).to.equal(null);
    expect(
      tracker.report(token, {
        kind: 'reaction_change', content: 'reply', action: 'remove', reactionType: '拍手',
      })
    ).to.equal(0);
    expect(track).not.toHaveBeenCalled();
  });
});

describe('投稿・タグ・リアクション・単語の操作計測', () => {
  it('保存応答・新しく添付したメディア・重複を除いたタグの差分をそれぞれ送る', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    expect(tracker.report(token, {
      kind: 'content_change',
      content: 'post',
      action: 'create',
      response: { animation: null },
      newMainMediaType: 'video',
      beforeTagIds: [TAG_A_ID, { _id: TAG_A_ID }],
      afterTagIds: [{ _id: TAG_B_ID }, TAG_B_ID],
      body: '送信禁止本文',
      fileName: 'secret.mp4',
    })).to.equal(4);

    expect(callsFor(track, 'timeline_content_change')[0]).to.include({
      content_type: 'post', action_type: 'create', presentation_type: 'static',
    });
    expect(callsFor(track, 'timeline_media_attach')[0]).to.include({
      content_type: 'post', action_type: 'create', media_type: 'video',
    });
    expect(callsFor(track, 'timeline_tag_change').map(({ tag_action, tag_id, tag_name }) => ({
      tag_action, tag_id, tag_name,
    }))).to.deep.equal([
      { tag_action: 'remove', tag_id: `tag_${TAG_A_ID}`, tag_name: 'タグA' },
      { tag_action: 'add', tag_id: `tag_${TAG_B_ID}`, tag_name: 'タグB' },
    ]);
    expect(JSON.stringify(track.mock.calls)).not.to.contain('送信禁止本文');
    expect(JSON.stringify(track.mock.calls)).not.to.contain('secret.mp4');
  });

  it('投稿と返信の表示形式はnullを通常、move-and-eraseを流す形式として扱い、他の値は送らない', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    tracker.report(token, {
      kind: 'content_change', content: 'reply', action: 'update', response: { animation: null },
    });
    tracker.report(token, {
      kind: 'content_change', content: 'reply', action: 'update', response: { animation: 'move-and-erase' },
    });
    tracker.report(token, {
      kind: 'content_change', content: 'reply', action: 'update', response: { animation: 'fade' },
    });
    tracker.report(token, {
      kind: 'content_change', content: 'reply', action: 'update', response: {},
    });

    expect(callsFor(track, 'timeline_content_change').map(({ presentation_type }) => presentation_type))
      .to.deep.equal(['static', 'flow']);
  });

  it('削除は保存済みの変更前データを使い、メディアを数えず、付加情報は常に通常表示として送る', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    tracker.report(token, {
      kind: 'content_change',
      content: 'post',
      action: 'delete',
      before: Object.freeze({ animation: 'move-and-erase' }),
      response: { animation: null },
      newMainMediaType: 'image',
    });
    tracker.report(token, {
      kind: 'content_change', content: 'reply_supplement', action: 'create', response: {},
    });

    expect(callsFor(track, 'timeline_content_change').map(({ presentation_type }) => presentation_type))
      .to.deep.equal(['flow', 'static']);
    expect(callsFor(track, 'timeline_media_attach')).to.have.length(0);
  });

  it('文字列とオブジェクトのタグIDを扱い、名称変更後は同じIDに新しい基本名を付ける', () => {
    const { activate, track, tracker } = createHarness();
    const firstToken = activate(roomDetails({ roomTags: [{ _id: TAG_A_ID, name: '旧名称' }] }));
    track.mockClear();
    tracker.report(firstToken, {
      kind: 'tag_change', content: 'post', beforeTagIds: [], afterTagIds: [{ _id: TAG_A_ID }],
    });

    const secondToken = activate(roomDetails({ roomTags: [{ _id: TAG_A_ID, name: '新名称' }] }));
    track.mockClear();
    tracker.report(secondToken, {
      kind: 'tag_change', content: 'post', beforeTagIds: [], afterTagIds: [TAG_A_ID, TAG_A_ID],
    });

    expect(callsFor(track, 'timeline_tag_change')[0]).to.include({
      tag_id: `tag_${TAG_A_ID}`, tag_name: '新名称', tag_action: 'add',
    });
  });

  it('固定リアクションと単語のID・名前だけを送り、不正な名前は送らない', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    expect(tracker.report(token, {
      kind: 'reaction_change', content: 'post_supplement', action: 'add', reactionType: '笑顔',
    })).to.equal(1);
    expect(tracker.report(token, {
      kind: 'reaction_change', content: 'post', action: 'add', reactionType: '任意リアクション',
    })).to.equal(0);
    expect(tracker.report(token, {
      kind: 'quick_text_use',
      content: 'reply',
      quickText: { _id: QUICK_TEXT_ID, label: 'user@example.com' },
    })).to.equal(1);
    expect(tracker.report(token, {
      kind: 'quick_text_use', content: 'reply', quickText: { _id: 'invalid', label: '定型文' },
    })).to.equal(0);

    expect(callsFor(track, 'timeline_quick_text_use')).to.have.length(1);
    expect(callsFor(track, 'timeline_quick_text_use')[0]).to.include({
      quick_text_id: `quick_${QUICK_TEXT_ID}`, content_type: 'reply',
    });
    expect(callsFor(track, 'timeline_quick_text_use')[0]).not.to.have.property('quick_text_label');
    expect(JSON.stringify(track.mock.calls)).not.to.contain('user@example.com');
  });

  it('フロア・ルーム・タグの名称が禁止形式でも、その項目だけを省いてIDとイベントを送る', () => {
    const { track, tracker } = createHarness();
    const details = roomDetails({
      floorTitle: 'admin@example.com',
      roomTitle: 'https://example.invalid/private',
      roomTags: [{ _id: TAG_A_ID, name: 'token=abcdefghijklmnop' }],
    });
    const token = tracker.beginRoom(ROOM_A_ID);
    expect(tracker.activateRoom(token, details)).to.equal(true);
    const captured = tracker.capture();
    tracker.report(captured, {
      kind: 'tag_change', content: 'post', beforeTagIds: [], afterTagIds: [TAG_A_ID],
    });

    expect(callsFor(track, 'timeline_view')[0]).not.to.have.keys('floor_title', 'room_title');
    expect(callsFor(track, 'timeline_tag_change')[0]).not.to.have.property('tag_name');
    expect(JSON.stringify(track.mock.calls)).not.to.contain('example.invalid');
    expect(JSON.stringify(track.mock.calls)).not.to.contain('abcdefghijklmnop');
  });
});

describe('タイムラインの絞り込み・表示設定の計測', () => {
  it('絞り込み作成時は設定値と選択タグを送り、検索語の原文は送らない', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    expect(tracker.report(token, {
      kind: 'filter_change',
      action: 'create',
      filter: {
        conditions: {
          filterMode: 'exclude',
          showRange: 'target',
          keyword: '秘密の検索語',
          keywordArray: ['秘密の検索語'],
          logicalOperator: 'and',
          userName: '',
          tags: [TAG_A_ID],
          tagSearchOperator: 'or',
          noTags: false,
          animation: true,
        },
        webPush: true,
        showUserIcon: false,
      },
    })).to.equal(13);

    const pairs = callsFor(track, 'timeline_filter_setting')
      .map(({ setting_key, setting_value }) => [setting_key, setting_value]);
    expect(pairs).to.deep.equal([
      ['filter_mode', 'exclude'],
      ['show_range', 'target'],
      ['keyword_used', 'true'],
      ['user_name_used', 'false'],
      ['tag_used', 'true'],
      ['no_tags', 'false'],
      ['animation', 'true'],
      ['keyword_operator', 'and'],
      ['tag_operator', 'or'],
      ['web_push', 'true'],
      ['show_user_icon', 'false'],
    ]);
    expect(callsFor(track, 'timeline_filter_tag')).to.deep.equal([{
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
      room_id: ROOM_A_ID,
      room_title: 'ルームA',
      action_type: 'create',
      tag_id: `tag_${TAG_A_ID}`,
      tag_name: 'タグA',
    }]);
    expect(JSON.stringify(track.mock.calls)).not.to.contain('秘密の検索語');
    track.mock.calls.forEach(([, parameters]) => {
      expect(parameters).not.to.have.keys('conditions', 'keyword', 'userName');
    });
  });

  it('絞り込み条件 updateはタグを重複除去し、不明・禁止名称では安全なIDだけを送る', () => {
    const unknownTagId = '333333333333333333333333';
    const { activate, track, tracker } = createHarness();
    const token = activate(roomDetails({
      roomTags: [
        { _id: TAG_A_ID, name: 'タグA' },
        { _id: TAG_B_ID, name: 'owner@example.com' },
      ],
    }));
    track.mockClear();

    expect(tracker.report(token, {
      kind: 'filter_change',
      action: 'update',
      filter: {
        conditions: {
          tags: [TAG_A_ID, { _id: TAG_A_ID }, TAG_B_ID, unknownTagId, 'invalid'],
        },
      },
    })).to.equal(7);

    expect(callsFor(track, 'timeline_filter_tag')).to.deep.equal([
      {
        floor_id: FLOOR_ID.toLowerCase(),
        floor_title: 'フロアA',
        room_id: ROOM_A_ID,
        room_title: 'ルームA',
        action_type: 'update',
        tag_id: `tag_${TAG_A_ID}`,
        tag_name: 'タグA',
      },
      {
        floor_id: FLOOR_ID.toLowerCase(),
        floor_title: 'フロアA',
        room_id: ROOM_A_ID,
        room_title: 'ルームA',
        action_type: 'update',
        tag_id: `tag_${TAG_B_ID}`,
      },
      {
        floor_id: FLOOR_ID.toLowerCase(),
        floor_title: 'フロアA',
        room_id: ROOM_A_ID,
        room_title: 'ルームA',
        action_type: 'update',
        tag_id: `tag_${unknownTagId}`,
      },
    ]);
  });

  it('conditions:nullはmode/operatorを省き、usageをfalse、通知/iconを最終値で送る', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    expect(tracker.report(token, {
      kind: 'filter_change',
      action: 'update',
      filter: { conditions: null, webPush: false, showUserIcon: true },
    })).to.equal(8);
    const pairs = Object.fromEntries(
      callsFor(track, 'timeline_filter_setting')
        .map(({ setting_key, setting_value }) => [setting_key, setting_value])
    );
    expect(pairs).to.deep.equal({
      keyword_used: 'false',
      user_name_used: 'false',
      tag_used: 'false',
      no_tags: 'false',
      animation: 'false',
      web_push: 'false',
      show_user_icon: 'true',
    });
    expect(pairs).not.to.have.keys('filter_mode', 'show_range', 'keyword_operator', 'tag_operator');
    expect(callsFor(track, 'timeline_filter_tag')).to.have.length(0);
  });

  it('絞り込み削除時は変更イベントを1件だけ送り、許可外の操作は送らない', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    expect(tracker.report(token, { kind: 'filter_change', action: 'delete' })).to.equal(1);
    expect(tracker.report(token, { kind: 'filter_change', action: 'save' })).to.equal(0);
    expect(track).toHaveBeenCalledTimes(1);
    expect(callsFor(track, 'timeline_filter_tag')).to.have.length(0);
  });

  it.each([
    [0, 'off'],
    [0.1, 'slow'],
    [0.9, 'slow'],
    [1, 'normal'],
    [1.1, 'fast'],
    [3, 'fast'],
  ])('読み上げ速度%sを%sの区分で送る', (speechSpeed, expected) => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    tracker.report(token, { kind: 'display_save', settings: { speechSpeed } });

    expect(callsFor(track, 'timeline_display_setting')).to.have.length(1);
    expect(callsFor(track, 'timeline_display_setting')[0]).to.include({
      setting_key: 'speech_speed_bucket', setting_value: expected,
    });
  });

  it('保存済み表示設定から真偽値と読み上げ速度だけを送る', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    expect(tracker.report(token, {
      kind: 'display_save',
      settings: {
        speechSpeed: 1,
        displayName: true,
        displayDate: false,
        displayTag: true,
        displaySupplement: false,
        displayAISupplement: true,
        displayActionButton: false,
        enableTextAnimation: true,
        displayUserKickButton: false,
        animationSpeed: 'very_fast',
        rawSpeechText: '送信禁止',
      },
    })).to.equal(10);
    expect(callsFor(track, 'timeline_display_setting')).to.have.length(9);
    const settingPairs = Object.fromEntries(callsFor(track, 'timeline_display_setting')
      .map(({ setting_key, setting_value }) => [setting_key, setting_value]));
    expect(settingPairs).to.include({ animation_speed: 'very_fast' });
    expect(settingPairs).not.to.have.property('display_ai_supplement');
    expect(JSON.stringify(track.mock.calls)).not.to.contain('rawSpeechText');
    expect(JSON.stringify(track.mock.calls)).not.to.contain('送信禁止');
  });

  it.each([-0.1, 0.05, 3.1, NaN, '1'])('不正な読み上げ速度%sを送信設定に含めない', (speechSpeed) => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();

    expect(tracker.report(token, {
      kind: 'display_save', settings: { speechSpeed, animationSpeed: 'turbo', displayName: 'true' },
    })).to.equal(1);
    expect(callsFor(track, 'timeline_display_save')).to.have.length(1);
    expect(callsFor(track, 'timeline_display_setting')).to.have.length(0);
  });
});

describe('タイムラインの計測エラーの分離', () => {
  it('計測がすべて失敗しても既存の画面操作へ例外を返さない', () => {
    const track = vi.fn(() => { throw new Error('analytics unavailable'); });
    const { activate, tracker } = createHarness({ track });

    const token = activate();
    expect(() => tracker.report(token, {
      kind: 'content_change',
      content: 'post',
      action: 'create',
      response: { animation: null },
      newMainMediaType: 'audio',
      beforeTagIds: [],
      afterTagIds: [TAG_A_ID],
    })).not.to.throw();
    expect(tracker.report(token, {
      kind: 'reaction_change', content: 'post', action: 'add', reactionType: 'いいね',
    })).to.equal(0);
  });

  it('getterや未知の種類を評価・送信せず拒否する', () => {
    const { activate, track, tracker } = createHarness();
    const token = activate();
    track.mockClear();
    const operation = { content: 'post', action: 'create', response: { animation: null } };
    Object.defineProperty(operation, 'kind', { enumerable: true, get: () => { throw new Error('getter'); } });

    expect(tracker.report(token, operation)).to.equal(0);
    expect(tracker.report(token, { kind: 'unknown', mail: 'user@example.com' })).to.equal(0);
    expect(track).not.toHaveBeenCalled();
  });
});
