import { expect } from 'vitest';
import {
  ANALYTICS_DISPLAY_SETTING_VALUES,
  ANALYTICS_ENUM_VALUES,
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_PARAMETER_ALLOWLIST,
  ANALYTICS_FILTER_SETTING_VALUES,
  ANALYTICS_PAGE_DEFINITIONS,
  ANALYTICS_PARAMETERS,
  ANALYTICS_RESOURCE_ID_PREFIXES,
  ANALYTICS_VIRTUAL_PAGE_DEFINITIONS,
  buildAnalyticsEventPayload,
  buildAnalyticsPageContext,
  classifyAnalyticsPage,
  classifyAnalyticsSpeechSpeedBucket,
  classifyAnalyticsVirtualPage,
  normalizeAnalyticsPageResource,
  normalizeAnalyticsResourceId,
  normalizeAnalyticsResourceLabel,
} from '@/features/analytics/contract';

const FLOOR_ID = '507F1F77BCF86CD799439011';
const ROOM_ID = '507f191e810c19729de860ea';
const TAG_ID = '111111111111111111111111';
const QUICK_TEXT_ID = 'abcdefabcdefabcdefabcdef';
const FLOOR_PAGE_LOCATION =
  `https://app.example.invalid/floor/${FLOOR_ID.toLowerCase()}`;
const TIMELINE_PAGE_LOCATION =
  `${FLOOR_PAGE_LOCATION}/room/${ROOM_ID}`;

const buildTimelineContext = (overrides = {}) => ({
  floor_id: FLOOR_ID,
  floor_title: '  フロアA  ',
  room_id: ROOM_ID,
  room_title: 'ルームA',
  visitor_type: 'registered',
  ...overrides,
});

describe('アクセス解析のページ分類', () => {
  const pageCases = [
    ['Floor', 'floor_list', '/'],
    ['FloorPage', 'floor_list', '/'],
    ['Room', 'room_list', '/floor'],
    ['TimeLine', 'timeline', '/timeline'],
    ['TimeLinePostDetail', 'timeline', '/timeline'],
    ['Login', 'login', '/login'],
    ['Register', 'register', '/register'],
    ['SendResetPasswordLink', 'password_reset_request', '/user/sendresetpasswordlink'],
    ['ResetPassword', 'password_reset_form', '/user/resetpassword'],
    ['Setting', 'setting', '/setting'],
    ['ChangePassword', 'change_password', '/changepassword'],
    ['Terms', 'terms', '/terms'],
    ['Privacy', 'privacy', '/privacy'],
    ['CookiePolicy', 'cookie_policy', '/cookie'],
    ['Accessibility', 'accessibility', '/accessibility'],
    ['Contact', 'contact', '/contact'],
    ['Tutorial', 'tutorial', '/tutorial'],
  ];

  it.each(pageCases)('%sを固定ページ分類へ変換する', (routeName, pageGroup, canonicalPath) => {
    const result = classifyAnalyticsPage(routeName);

    expect(result).to.deep.equal({ pageGroup, canonicalPath });
    expect(Object.isFrozen(result)).to.equal(true);
  });

  it.each(['Admin', 'FloorManagement', 'floor', '', null, undefined, { name: 'Floor' }])(
    '許可リスト外ルート %s は分類しない',
    (routeName) => {
      expect(classifyAnalyticsPage(routeName)).to.equal(null);
    }
  );

  it('公開ページ定義自体を変更できない', () => {
    expect(Object.isFrozen(ANALYTICS_PAGE_DEFINITIONS)).to.equal(true);
    expect(() => {
      ANALYTICS_PAGE_DEFINITIONS.Login.pageGroup = 'mail';
    }).to.throw(TypeError);
    expect(classifyAnalyticsPage('Login')).to.deep.equal({
      pageGroup: 'login',
      canonicalPath: '/login',
    });
  });

  it('プロフィールダイアログだけをルートとは別の仮想ページへ分類する', () => {
    expect(classifyAnalyticsPage('Profile')).to.equal(null);
    expect(classifyAnalyticsVirtualPage('Profile')).to.deep.equal({
      pageGroup: 'profile',
      canonicalPath: '/profile',
    });
    expect(classifyAnalyticsVirtualPage('Login')).to.equal(null);
    expect(Object.isFrozen(ANALYTICS_VIRTUAL_PAGE_DEFINITIONS)).to.equal(true);
  });
});

describe('アクセス解析へ送信する対象ID', () => {
  it.each([
    ['floor', FLOOR_ID, FLOOR_ID.toLowerCase()],
    ['room', ROOM_ID, ROOM_ID],
    ['tag', TAG_ID, `tag_${TAG_ID}`],
    ['quick_text', QUICK_TEXT_ID, `quick_${QUICK_TEXT_ID}`],
    ['floor', '123456789012345678901234', '123456789012345678901234'],
  ])('%s ObjectIdを送信用IDへ正規化する', (resourceType, value, expected) => {
    expect(normalizeAnalyticsResourceId(resourceType, `  ${value}  `)).to.equal(expected);
  });

  it.each([
    ['unknown', ROOM_ID],
    ['quickText', QUICK_TEXT_ID],
    ['room', 'room_507f191e810c19729de860ea'],
    ['room', '507f191e810c19729de860e'],
    ['room', '507f191e810c19729de860eg'],
    ['room', 123456789012345678901234n],
    ['room', null],
  ])('種別またはObjectIdが不正なら送信用IDを作らない', (resourceType, value) => {
    expect(normalizeAnalyticsResourceId(resourceType, value)).to.equal(null);
  });

  it('フロアとルームは元のIDを使い、タグと単語には固定の接頭辞を付ける', () => {
    expect(ANALYTICS_RESOURCE_ID_PREFIXES).to.deep.equal({
      floor: '',
      room: '',
      tag: 'tag_',
      quick_text: 'quick_',
    });
    expect(Object.isFrozen(ANALYTICS_RESOURCE_ID_PREFIXES)).to.equal(true);
  });
});

describe('アクセス解析へ送信する対象名', () => {
  it('NFC化してtrimした基本名称だけを返す', () => {
    expect(normalizeAnalyticsResourceLabel('  Cafe\u0301 フロア  ')).to.equal('Café フロア');
    expect(normalizeAnalyticsResourceLabel('通常の名称（テスト）')).to.equal('通常の名称（テスト）');
  });

  it.each([
    ['', '空文字'],
    ['   ', '空白だけ'],
    ['ルーム\n秘密', '改行'],
    ['ルーム\t秘密', 'control文字'],
    ['ルーム\u2028秘密', 'Unicode line separator'],
    ['user@example.com の部屋', 'email'],
    ['参照 https://example.com/private?id=1', '絶対URL'],
    ['電話 090-1234-5678', '電話番号'],
    ['電話 +81 90 1234 5678', '国際電話番号'],
    ['電話 ０９０-１２３４-５６７８', 'Unicode数字の電話番号'],
    ['Bearer abcdefghijklmnopqrstuvwxyz', 'Bearer token'],
    ['token=abcdefghijklmnopqrstuvwxyz123456', 'token代入'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123', 'JWT'],
    ['sk-abcdefghijklmnopqrstuvwxyz123456', 'provider token'],
    ['a'.repeat(40), 'hex token'],
    ['123e4567-e89b-12d3-a456-426614174000', 'Guest UUID'],
    ['Guest 123e4567-e89b-12d3-a456-426614174000', '名称中のGuest UUID'],
    ['Guest123e4567-e89b-12d3-a456-426614174000User', '英数字に隣接するGuest UUID'],
    [`ga1_${'a'.repeat(64)}`, 'Analytics User-ID'],
  ])('%sを含む名称は省略する: %s', (value) => {
    expect(normalizeAnalyticsResourceLabel(value)).to.equal(null);
  });

  it('100文字より後ろの禁止表現も、切り詰める前に検出する', () => {
    expect(normalizeAnalyticsResourceLabel(`${'界'.repeat(101)} user@example.com`)).to.equal(null);
  });

  it('Unicodeコードポイント単位で100文字へ制限する', () => {
    const japanese = normalizeAnalyticsResourceLabel('界'.repeat(101));
    const emoji = normalizeAnalyticsResourceLabel('😀'.repeat(101));
    const ascii = normalizeAnalyticsResourceLabel('x'.repeat(101));

    expect([...japanese]).to.have.length(100);
    expect([...emoji]).to.have.length(100);
    expect([...ascii]).to.have.length(100);
    expect(encodeURIComponent(japanese).length).to.be.greaterThan(100);
  });

  it.each([null, undefined, 123, {}, ['label']])('文字列以外の名称 %s は省略する', (value) => {
    expect(normalizeAnalyticsResourceLabel(value)).to.equal(null);
  });
});

describe('アクセス解析の対象ページ情報', () => {
  it('フロアAPIの基本名称とIDだけをルーム一覧の計測情報に使う', () => {
    const resource = normalizeAnalyticsPageResource('room_list', {
      _id: FLOOR_ID,
      title: '  フロアA  ',
      translations: [{ title: '翻訳名' }],
      description: '送信禁止',
    });

    expect(resource).to.deep.equal({
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
    });
    expect(Object.isFrozen(resource)).to.equal(true);
    expect(JSON.stringify(resource)).not.to.contain('翻訳名');
    expect(JSON.stringify(resource)).not.to.contain('送信禁止');
  });

  it('ルームAPIのフロア・ルームIDと基本名称だけをタイムラインの計測情報に使う', () => {
    expect(normalizeAnalyticsPageResource('timeline', {
      _id: ROOM_ID,
      title: 'ルームA',
      floor: { _id: FLOOR_ID, title: 'フロアA', description: '送信禁止' },
      body: '送信禁止本文',
    })).to.deep.equal({
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
      room_id: ROOM_ID,
      room_title: 'ルームA',
    });
  });

  it('不正ID、accessor、対象外ページグループは対象コンテキストを作らない', () => {
    const accessor = {};
    Object.defineProperty(accessor, '_id', { get: () => FLOOR_ID });

    expect(normalizeAnalyticsPageResource('room_list', { _id: 'invalid', title: 'A' })).to.equal(null);
    expect(normalizeAnalyticsPageResource('room_list', accessor)).to.equal(null);
    expect(normalizeAnalyticsPageResource('login', { _id: FLOOR_ID, title: 'A' })).to.equal(null);
  });
});

describe('アクセス解析で許可するイベントと項目', () => {
  it('許可イベントをページコンテキスト 2種類とタイムライン 11種類だけに固定する', () => {
    expect(Object.values(ANALYTICS_EVENTS)).to.deep.equal([
      'page_view',
      'iseeetl_page_exit',
      'timeline_view',
      'timeline_content_change',
      'timeline_media_attach',
      'timeline_tag_change',
      'timeline_reaction_change',
      'timeline_quick_text_use',
      'timeline_filter_change',
      'timeline_filter_setting',
      'timeline_filter_tag',
      'timeline_display_save',
      'timeline_display_setting',
    ]);
    expect(Object.keys(ANALYTICS_EVENT_PARAMETER_ALLOWLIST)).to.deep.equal(
      Object.values(ANALYTICS_EVENTS)
    );
  });

  it('送信項目を標準のページ情報と19種類のカスタムディメンションに限定する', () => {
    const allowedParameters = new Set(
      Object.values(ANALYTICS_EVENT_PARAMETER_ALLOWLIST).flat()
    );

    expect([...allowedParameters].sort()).to.deep.equal(
      Object.values(ANALYTICS_PARAMETERS).sort()
    );
    expect(allowedParameters).not.to.include('user_id');
    expect(allowedParameters).not.to.include('email');
    expect(allowedParameters).not.to.include('content');
    expect(allowedParameters).not.to.include('route_query');
    expect(allowedParameters).not.to.include('engagement_time_msec');
    expect(Object.isFrozen(ANALYTICS_EVENT_PARAMETER_ALLOWLIST)).to.equal(true);
    Object.values(ANALYTICS_EVENT_PARAMETER_ALLOWLIST).forEach((parameters) => {
      expect(Object.isFrozen(parameters)).to.equal(true);
    });
  });

  it('全enum 許可リストを変更不能にする', () => {
    expect(ANALYTICS_ENUM_VALUES).to.deep.equal({
      page_group: [
        'floor_list',
        'room_list',
        'timeline',
        'login',
        'register',
        'password_reset_request',
        'password_reset_form',
        'setting',
        'change_password',
        'terms',
        'privacy',
        'cookie_policy',
        'accessibility',
        'contact',
        'tutorial',
        'profile',
      ],
      visitor_type: ['guest', 'registered'],
      content_type: ['post', 'reply', 'post_supplement', 'reply_supplement'],
      action_type: ['create', 'update', 'delete'],
      presentation_type: ['static', 'flow'],
      media_type: ['image', 'video', 'audio'],
      tag_action: ['add', 'remove'],
      reaction_action: ['add', 'remove'],
      reaction_type: ['いいね', '超いいね', '拍手', '笑顔', 'びっくり'],
    });
    expect(Object.isFrozen(ANALYTICS_ENUM_VALUES)).to.equal(true);
    Object.values(ANALYTICS_ENUM_VALUES).forEach((values) => {
      expect(Object.isFrozen(values)).to.equal(true);
    });
  });
});

describe('アクセス解析のページイベント', () => {
  const validPageView = () => ({
    page_group: 'timeline',
    page_location: TIMELINE_PAGE_LOCATION,
    page_title: 'timeline',
    page_referrer: FLOOR_PAGE_LOCATION,
    floor_id: FLOOR_ID,
    floor_title: 'フロアA',
    room_id: ROOM_ID,
    room_title: 'ルームA',
    visitor_type: 'guest',
    route_query: 'secret@example.com',
    user_id: 'raw-user-id',
  });

  it('安全なcanonical URLと固定分類だけで新しいデータを作る', () => {
    const input = validPageView();
    const result = buildAnalyticsEventPayload('page_view', input);

    expect(result).to.deep.equal({
      page_group: 'timeline',
      page_location: TIMELINE_PAGE_LOCATION,
      page_title: 'timeline',
      page_referrer: FLOOR_PAGE_LOCATION,
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
      room_id: ROOM_ID,
      room_title: 'ルームA',
      visitor_type: 'guest',
    });
    expect(result).not.to.equal(input);
    expect(Object.isFrozen(result)).to.equal(true);
  });

  it('ページ exitはpage_viewと同じ旧ページコンテキストだけを受理する', () => {
    const input = {
      ...validPageView(),
      engagement_time_msec: 12345,
    };

    const result = buildAnalyticsEventPayload('iseeetl_page_exit', input);

    expect(result).to.deep.equal({
      page_group: 'timeline',
      page_location: TIMELINE_PAGE_LOCATION,
      page_title: 'timeline',
      page_referrer: FLOOR_PAGE_LOCATION,
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
      room_id: ROOM_ID,
      room_title: 'ルームA',
      visitor_type: 'guest',
    });
    expect(Object.isFrozen(result)).to.equal(true);
    expect(buildAnalyticsEventPayload('iseeetl_page_exit', {
      ...input,
      floor_id: '507f1f77bcf86cd799439012',
    })).to.equal(null);
  });

  it.each(['page_group', 'page_location', 'page_title', 'visitor_type'])(
    'ページ exitは必須ページパラメータ %s が欠ければ拒否する',
    (name) => {
      const input = validPageView();
      delete input[name];
      expect(buildAnalyticsEventPayload('iseeetl_page_exit', input)).to.equal(null);
    }
  );

  it('予約済みuser_engagement イベントの手動送信を許可しない', () => {
    expect(buildAnalyticsEventPayload('user_engagement', validPageView())).to.equal(null);
  });

  it.each([
    ['page_group', 'unknown'],
    ['page_location', `${TIMELINE_PAGE_LOCATION}?mail=user@example.com`],
    ['page_location', `${TIMELINE_PAGE_LOCATION}#secret`],
    ['page_location', `https://user:password@app.example.invalid${new URL(TIMELINE_PAGE_LOCATION).pathname}`],
    ['page_location', `javascript://app.example.invalid${new URL(TIMELINE_PAGE_LOCATION).pathname}`],
    ['page_location', 'https://app.example.invalid/login'],
    ['page_title', 'Timeline title'],
    ['visitor_type', 'anonymous'],
  ])('必須ページパラメータ %s が不正ならイベント全体を拒否する', (name, value) => {
    expect(buildAnalyticsEventPayload('page_view', { ...validPageView(), [name]: value })).to.equal(null);
  });

  it.each(['page_group', 'page_location', 'page_title', 'visitor_type'])(
    '必須ページパラメータ %s が欠ければ拒否する',
    (name) => {
      const input = validPageView();
      delete input[name];
      expect(buildAnalyticsEventPayload('page_view', input)).to.equal(null);
    }
  );

  it('参照元のオリジンが異なる場合やクエリ付きの場合も、参照元だけを省いてページイベントを送る', () => {
    const otherOrigin = buildAnalyticsEventPayload('page_view', {
      ...validPageView(),
      page_referrer: `https://other.example.invalid/floor/${FLOOR_ID.toLowerCase()}`,
    });
    const queryReferrer = buildAnalyticsEventPayload('page_view', {
      ...validPageView(),
      page_referrer: `${FLOOR_PAGE_LOCATION}?secret=1`,
    });

    expect(otherOrigin).not.to.have.property('page_referrer');
    expect(queryReferrer).not.to.have.property('page_referrer');
  });

  it('対象ページのpage_viewは対応IDを必須とし、別対象項目を拒否する', () => {
    const roomList = {
      page_group: 'room_list',
      page_location: FLOOR_PAGE_LOCATION,
      page_title: 'room_list',
      floor_id: FLOOR_ID,
      floor_title: 'フロアA',
      visitor_type: 'guest',
    };
    expect(buildAnalyticsEventPayload('page_view', roomList)).to.include({
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
    });
    expect(buildAnalyticsEventPayload('page_view', {
      ...roomList,
      floor_id: undefined,
    })).to.equal(null);
    expect(buildAnalyticsEventPayload('page_view', {
      ...roomList,
      room_id: ROOM_ID,
    })).to.equal(null);
    expect(buildAnalyticsEventPayload('page_view', {
      ...validPageView(),
      room_id: undefined,
    })).to.equal(null);
    expect(buildAnalyticsEventPayload('page_view', {
      page_group: 'login',
      page_location: 'https://app.example.invalid/login',
      page_title: 'login',
      floor_id: FLOOR_ID,
      visitor_type: 'guest',
    })).to.equal(null);
  });

  it('設定用ページコンテキストは対象未解決を許すが部分コンテキストを拒否する', () => {
    const unresolved = {
      page_group: 'timeline',
      page_location: TIMELINE_PAGE_LOCATION,
      page_title: 'timeline',
      visitor_type: 'guest',
    };

    expect(buildAnalyticsPageContext(unresolved)).to.deep.equal(unresolved);
    expect(buildAnalyticsEventPayload('page_view', unresolved)).to.equal(null);
    expect(buildAnalyticsPageContext({ ...unresolved, floor_id: FLOOR_ID })).to.equal(null);
  });

  it('URL内の対象とイベントの対象IDが一致しなければ送信しない', () => {
    const otherFloorId = '507f1f77bcf86cd799439012';
    const otherRoomId = '507f191e810c19729de860eb';

    expect(buildAnalyticsEventPayload('page_view', {
      ...validPageView(),
      floor_id: otherFloorId,
    })).to.equal(null);
    expect(buildAnalyticsEventPayload('page_view', {
      ...validPageView(),
      room_id: otherRoomId,
    })).to.equal(null);
    expect(buildAnalyticsEventPayload('page_view', {
      ...validPageView(),
      page_location: `${TIMELINE_PAGE_LOCATION}/post/aaaaaaaaaaaaaaaaaaaaaaaa`,
    })).to.equal(null);
    expect(buildAnalyticsEventPayload('page_view', {
      ...validPageView(),
      page_group: 'room_list',
      page_title: 'room_list',
    })).to.equal(null);
    expect(buildAnalyticsPageContext({
      page_group: 'timeline',
      page_location:
        `https://app.example.invalid/floor/${otherFloorId}/room/${otherRoomId}`,
      page_title: 'timeline',
      visitor_type: 'guest',
    })).to.not.equal(null);
  });
});

describe('アクセス解析のタイムラインイベント', () => {
  const validEvents = [
    ['timeline_view', {}, {}],
    [
      'timeline_content_change',
      { content_type: 'post', action_type: 'create', presentation_type: 'flow' },
      { content_type: 'post', action_type: 'create', presentation_type: 'flow' },
    ],
    [
      'timeline_media_attach',
      { content_type: 'reply', action_type: 'update', media_type: 'image' },
      { content_type: 'reply', action_type: 'update', media_type: 'image' },
    ],
    [
      'timeline_tag_change',
      { content_type: 'post', tag_action: 'add', tag_id: TAG_ID, tag_name: ' タグA ' },
      { content_type: 'post', tag_action: 'add', tag_id: `tag_${TAG_ID}`, tag_name: 'タグA' },
    ],
    [
      'timeline_reaction_change',
      { content_type: 'reply', reaction_action: 'remove', reaction_type: '拍手' },
      { content_type: 'reply', reaction_action: 'remove', reaction_type: '拍手' },
    ],
    [
      'timeline_quick_text_use',
      { content_type: 'post_supplement', quick_text_id: QUICK_TEXT_ID, quick_text_label: ' 単語A ' },
      {
        content_type: 'post_supplement',
        quick_text_id: `quick_${QUICK_TEXT_ID}`,
        quick_text_label: '単語A',
      },
    ],
    ['timeline_filter_change', { action_type: 'delete' }, { action_type: 'delete' }],
    [
      'timeline_filter_setting',
      { setting_key: 'filter_mode', setting_value: 'include' },
      { setting_key: 'filter_mode', setting_value: 'include' },
    ],
    [
      'timeline_filter_tag',
      { action_type: 'update', tag_id: TAG_ID, tag_name: ' タグA ' },
      { action_type: 'update', tag_id: `tag_${TAG_ID}`, tag_name: 'タグA' },
    ],
    ['timeline_display_save', {}, {}],
    [
      'timeline_display_setting',
      { setting_key: 'animation_speed', setting_value: 'very_fast' },
      { setting_key: 'animation_speed', setting_value: 'very_fast' },
    ],
  ];

  it.each(validEvents)('%sは共通コンテキストと個別許可リストだけを返す', (eventName, extra, expected) => {
    const input = {
      ...buildTimelineContext(),
      ...extra,
      email: 'user@example.com',
      content: '投稿本文',
      token: 'must-not-leak',
    };

    const result = buildAnalyticsEventPayload(eventName, input);

    expect(result).to.deep.equal({
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
      room_id: ROOM_ID,
      room_title: 'ルームA',
      visitor_type: 'registered',
      ...expected,
    });
    expect(result).not.to.equal(input);
    expect(Object.isFrozen(result)).to.equal(true);
  });

  it('フロア・ルームのIDと接頭辞付きのタグIDを再加工せず受理する', () => {
    const result = buildAnalyticsEventPayload('timeline_tag_change', {
      ...buildTimelineContext({
        floor_id: FLOOR_ID.toLowerCase(),
        room_id: ROOM_ID,
      }),
      content_type: 'post',
      tag_action: 'add',
      tag_id: `tag_${TAG_ID}`,
    });

    expect(result.floor_id).to.equal(FLOOR_ID.toLowerCase());
    expect(result.room_id).to.equal(ROOM_ID);
    expect(result.tag_id).to.equal(`tag_${TAG_ID}`);
  });

  it.each([
    ['floor_title', 'owner@example.com'],
    ['room_title', 'https://example.com/private'],
    ['tag_name', '090-1234-5678'],
  ])('禁止形式の任意名称 %s だけを省略してIDとイベントを維持する', (name, value) => {
    const result = buildAnalyticsEventPayload('timeline_tag_change', {
      ...buildTimelineContext(),
      content_type: 'post',
      tag_action: 'add',
      tag_id: TAG_ID,
      tag_name: '通常タグ',
      [name]: value,
    });

    expect(result).not.to.equal(null);
    expect(result).not.to.have.property(name);
    expect(result.tag_id).to.equal(`tag_${TAG_ID}`);
  });

  it.each([
    ['floor_id', 'invalid'],
    ['room_id', 'invalid'],
    ['visitor_type', 'unknown'],
  ])('必須コンテキスト %s が不正ならイベント全体を拒否する', (name, value) => {
    expect(buildAnalyticsEventPayload('timeline_view', buildTimelineContext({ [name]: value }))).to.equal(null);
  });

  it.each(['floor_id', 'room_id', 'visitor_type'])('必須コンテキスト %s がなければ拒否する', (name) => {
    const input = buildTimelineContext();
    delete input[name];
    expect(buildAnalyticsEventPayload('timeline_view', input)).to.equal(null);
  });

  it('付加情報のpresentation_typeはstaticだけを許可する', () => {
    const base = {
      ...buildTimelineContext(),
      content_type: 'post_supplement',
      action_type: 'create',
    };

    expect(buildAnalyticsEventPayload('timeline_content_change', {
      ...base,
      presentation_type: 'static',
    })).not.to.equal(null);
    expect(buildAnalyticsEventPayload('timeline_content_change', {
      ...base,
      presentation_type: 'flow',
    })).to.equal(null);
  });

  it.each(['create', 'update'])('絞り込み条件タグはaction_type=%sを許可する', (actionType) => {
    expect(buildAnalyticsEventPayload('timeline_filter_tag', {
      ...buildTimelineContext(),
      action_type: actionType,
      tag_id: TAG_ID,
    })).to.include({ action_type: actionType, tag_id: `tag_${TAG_ID}` });
  });

  it('絞り込み条件タグはdelete、必須タグ ID欠落、不正タグ IDを拒否する', () => {
    const base = { ...buildTimelineContext(), action_type: 'create' };

    expect(buildAnalyticsEventPayload('timeline_filter_tag', {
      ...base,
      action_type: 'delete',
      tag_id: TAG_ID,
    })).to.equal(null);
    expect(buildAnalyticsEventPayload('timeline_filter_tag', base)).to.equal(null);
    expect(buildAnalyticsEventPayload('timeline_filter_tag', {
      ...base,
      tag_id: 'invalid',
    })).to.equal(null);
  });

  it('絞り込み条件タグは禁止形式の任意名称だけを省略してID イベントを維持する', () => {
    const result = buildAnalyticsEventPayload('timeline_filter_tag', {
      ...buildTimelineContext(),
      action_type: 'create',
      tag_id: TAG_ID,
      tag_name: 'owner@example.com',
    });

    expect(result).to.include({ action_type: 'create', tag_id: `tag_${TAG_ID}` });
    expect(result).not.to.have.property('tag_name');
  });

  it('許可外のイベント、レコード以外の値、必須項目のアクセサを拒否する', () => {
    const accessorInput = buildTimelineContext();
    Object.defineProperty(accessorInput, 'room_id', {
      enumerable: true,
      get: () => ROOM_ID,
    });

    expect(buildAnalyticsEventPayload('login', buildTimelineContext())).to.equal(null);
    expect(buildAnalyticsEventPayload('timeline_view', null)).to.equal(null);
    expect(buildAnalyticsEventPayload('timeline_view', [])).to.equal(null);
    expect(buildAnalyticsEventPayload('timeline_view', new Date())).to.equal(null);
    expect(buildAnalyticsEventPayload('timeline_view', accessorInput)).to.equal(null);
  });

  it('許可リスト外getterを評価せずデータへ混入させない', () => {
    const input = buildTimelineContext();
    let accessed = false;
    Object.defineProperty(input, 'authorization', {
      enumerable: true,
      get: () => {
        accessed = true;
        throw new Error('読み取ってはいけません');
      },
    });

    const result = buildAnalyticsEventPayload('timeline_view', input);

    expect(accessed).to.equal(false);
    expect(result).not.to.have.property('authorization');
  });
});

describe('アクセス解析の列挙値の検証', () => {
  it.each(ANALYTICS_ENUM_VALUES.visitor_type)('visitor_type=%sを許可する', (visitorType) => {
    expect(buildAnalyticsEventPayload('timeline_view', buildTimelineContext({
      visitor_type: visitorType,
    }))).not.to.equal(null);
  });

  it.each(ANALYTICS_ENUM_VALUES.content_type)('content_type=%sを許可する', (contentType) => {
    expect(buildAnalyticsEventPayload('timeline_content_change', {
      ...buildTimelineContext(),
      content_type: contentType,
      action_type: 'update',
      presentation_type: contentType.endsWith('_supplement') ? 'static' : 'flow',
    })).not.to.equal(null);
  });

  it.each(ANALYTICS_ENUM_VALUES.action_type)('action_type=%sを許可する', (actionType) => {
    expect(buildAnalyticsEventPayload('timeline_content_change', {
      ...buildTimelineContext(),
      content_type: 'post',
      action_type: actionType,
      presentation_type: 'static',
    })).not.to.equal(null);
  });

  it.each(ANALYTICS_ENUM_VALUES.presentation_type)('presentation_type=%sを許可する', (presentationType) => {
    expect(buildAnalyticsEventPayload('timeline_content_change', {
      ...buildTimelineContext(),
      content_type: 'reply',
      action_type: 'create',
      presentation_type: presentationType,
    })).not.to.equal(null);
  });

  it.each(ANALYTICS_ENUM_VALUES.media_type)('media_type=%sを許可する', (mediaType) => {
    expect(buildAnalyticsEventPayload('timeline_media_attach', {
      ...buildTimelineContext(),
      content_type: 'post',
      action_type: 'create',
      media_type: mediaType,
    })).not.to.equal(null);
  });

  it.each(ANALYTICS_ENUM_VALUES.tag_action)('tag_action=%sを許可する', (tagAction) => {
    expect(buildAnalyticsEventPayload('timeline_tag_change', {
      ...buildTimelineContext(),
      content_type: 'post',
      tag_action: tagAction,
      tag_id: TAG_ID,
    })).not.to.equal(null);
  });

  it.each(ANALYTICS_ENUM_VALUES.reaction_action)('reaction_action=%sを許可する', (reactionAction) => {
    expect(buildAnalyticsEventPayload('timeline_reaction_change', {
      ...buildTimelineContext(),
      content_type: 'reply',
      reaction_action: reactionAction,
      reaction_type: 'いいね',
    })).not.to.equal(null);
  });

  it.each(ANALYTICS_ENUM_VALUES.reaction_type)('reaction_type=%sを許可する', (reactionType) => {
    expect(buildAnalyticsEventPayload('timeline_reaction_change', {
      ...buildTimelineContext(),
      content_type: 'reply',
      reaction_action: 'add',
      reaction_type: reactionType,
    })).not.to.equal(null);
  });

  it.each([
    ['visitor_type', 'Registered'],
    ['content_type', 'comment'],
    ['action_type', 'read'],
    ['presentation_type', 'animated'],
    ['media_type', 'file'],
    ['tag_action', 'replace'],
    ['reaction_action', 'toggle'],
    ['reaction_type', '怒り'],
  ])('許可リスト外enum %s=%s はイベント全体を拒否する', (name, value) => {
    const eventByParameter = {
      visitor_type: ['timeline_view', {}],
      content_type: ['timeline_content_change', { action_type: 'create', presentation_type: 'static' }],
      action_type: ['timeline_content_change', { content_type: 'post', presentation_type: 'static' }],
      presentation_type: ['timeline_content_change', { content_type: 'post', action_type: 'create' }],
      media_type: ['timeline_media_attach', { content_type: 'post', action_type: 'create' }],
      tag_action: ['timeline_tag_change', { content_type: 'post', tag_id: TAG_ID }],
      reaction_action: [
        'timeline_reaction_change',
        { content_type: 'post', reaction_type: 'いいね' },
      ],
      reaction_type: [
        'timeline_reaction_change',
        { content_type: 'post', reaction_action: 'add' },
      ],
    };
    const [eventName, extra] = eventByParameter[name];

    expect(buildAnalyticsEventPayload(eventName, {
      ...buildTimelineContext(),
      ...extra,
      [name]: value,
    })).to.equal(null);
  });
});

describe('アクセス解析で許可する設定値', () => {
  it.each(Object.entries(ANALYTICS_FILTER_SETTING_VALUES))(
    '絞り込み設定%sは許可された値だけを通す',
    (settingKey, allowedValues) => {
      allowedValues.forEach((settingValue) => {
        expect(buildAnalyticsEventPayload('timeline_filter_setting', {
          ...buildTimelineContext(),
          setting_key: settingKey,
          setting_value: settingValue,
        })).to.include({ setting_key: settingKey, setting_value: settingValue });
      });
    }
  );

  it.each(Object.entries(ANALYTICS_DISPLAY_SETTING_VALUES))(
    '表示設定%sは許可された値だけを通す',
    (settingKey, allowedValues) => {
      allowedValues.forEach((settingValue) => {
        expect(buildAnalyticsEventPayload('timeline_display_setting', {
          ...buildTimelineContext(),
          setting_key: settingKey,
          setting_value: settingValue,
        })).to.include({ setting_key: settingKey, setting_value: settingValue });
      });
    }
  );

  it.each([
    ['timeline_filter_setting', 'unknown', 'true'],
    ['timeline_filter_setting', 'filter_mode', 'contains'],
    ['timeline_filter_setting', 'keyword_used', true],
    ['timeline_display_setting', 'speech_speed_bucket', '1.1'],
    ['timeline_display_setting', 'animation_speed', 'instant'],
    ['timeline_display_setting', 'display_name', 1],
  ])('%sの不正な設定項目と値の組合せを拒否する', (eventName, settingKey, settingValue) => {
    expect(buildAnalyticsEventPayload(eventName, {
      ...buildTimelineContext(),
      setting_key: settingKey,
      setting_value: settingValue,
    })).to.equal(null);
  });

  it.each([
    [0, 'off'],
    [0.1, 'slow'],
    [0.9, 'slow'],
    [1, 'normal'],
    [1.1, 'fast'],
    [3, 'fast'],
  ])('読み上げ速度%sを%sへ分類する', (value, expected) => {
    expect(classifyAnalyticsSpeechSpeedBucket(value)).to.equal(expected);
  });

  it.each([-0.1, 3.1, 0.15, NaN, Infinity, '1.0', null, undefined])(
    '不正な読み上げ速度%sは分類しない',
    (value) => {
      expect(classifyAnalyticsSpeechSpeedBucket(value)).to.equal(null);
    }
  );
});
