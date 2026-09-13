const mockChat = { findOne: jest.fn() };
const mockFloor = { findOne: jest.fn() };
const mockRoom = { findOne: jest.fn() };
const mockSetting = { find: jest.fn(), findOne: jest.fn() };
const mockRoomTag = { findOne: jest.fn() };
const mockUser = { findOne: jest.fn() };

jest.mock('../../../../models/Chat', () => mockChat);
jest.mock('../../../../models/Floor', () => mockFloor);
jest.mock('../../../../models/Room', () => mockRoom);
jest.mock('../../../../models/RoomAIAnalysisSetting', () => mockSetting);
jest.mock('../../../../models/RoomTag', () => mockRoomTag);
jest.mock('../../../../models/User', () => mockUser);

const {
  buildAnalysisSnapshot,
  listMatchingAnalysisSettingIds,
  resolveSourceState,
  sourceSupportsKind,
} = require('../../../../services/analysis/snapshot.service');

const leanQuery = (value) => ({ lean: jest.fn(async () => value) });
const selectedQuery = (value) => ({
  select: jest.fn(() => leanQuery(value)),
});
const sortedSelectedQuery = (value) => ({
  sort: jest.fn(() => ({ select: jest.fn(() => leanQuery(value)) })),
});

const chat = (overrides = {}) => ({
  _id: 'post-1',
  floor: 'floor-1',
  room: 'room-1',
  content: 'hello',
  lang: 'en',
  room_tags: ['tag-1'],
  image_name: 'image.jpg',
  video_name: 'video.mp4',
  audio_name: 'audio.mp3',
  analysis_source_revision: 4,
  replies: [],
  delete_flg: false,
  ...overrides,
});

const setting = (overrides = {}) => ({
  _id: 'setting-1',
  floor: 'floor-1',
  room: 'room-1',
  room_tag: 'tag-1',
  result_user: 'user-1',
  analysis_kind: 'conversation',
  additional_prompt: 'prompt',
  revision: 2,
  delete_flg: false,
  ...overrides,
});

describe('AI解析の送信時点の情報', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChat.findOne.mockReturnValue(leanQuery(chat()));
    mockSetting.findOne.mockReturnValue(leanQuery(setting()));
    mockRoomTag.findOne.mockReturnValue(leanQuery({
      _id: 'tag-1',
      floor: 'floor-1',
      room: 'room-1',
      name: 'Custom tag',
      translations: [{ lang: 'ja', name: '独自タグ' }],
      delete_flg: false,
    }));
    mockUser.findOne.mockReturnValue(selectedQuery({ _id: 'user-1' }));
    mockRoom.findOne.mockReturnValue(selectedQuery({ _id: 'room-1', floor: 'floor-1' }));
    mockFloor.findOne.mockReturnValue(selectedQuery({ _id: 'floor-1', target_langs: ['ja'] }));
  });

  test('解析対象のタグIDに対応する有効な設定だけを所定の順序で取得する', async () => {
    const query = sortedSelectedQuery([{ _id: 'setting-2' }, { _id: 'setting-1' }]);
    mockSetting.find.mockReturnValue(query);

    await expect(
      listMatchingAnalysisSettingIds({
        chatId: 'post-1',
        sourceType: 'post',
        kinds: ['conversation'],
      })
    ).resolves.toEqual(['setting-2', 'setting-1']);
    expect(mockSetting.find).toHaveBeenCalledWith({
      floor: 'floor-1',
      room: 'room-1',
      room_tag: { $in: ['tag-1'] },
      delete_flg: false,
      analysis_kind: { $in: ['conversation'] },
    });
    expect(query.sort).toHaveBeenCalledWith({ room_tag: 1, analysis_kind: 1, _id: 1 });
  });

  test('有効な参照をすべて検証してから変更できない送信時点の情報を確定する', async () => {
    const value = await buildAnalysisSnapshot({
      chatId: 'post-1',
      sourceType: 'post',
      settingId: 'setting-1',
    });

    expect(value).toEqual(expect.objectContaining({
      sourceRevision: 4,
      settingId: 'setting-1',
      settingRevision: 2,
      resultUserId: 'user-1',
      kind: 'conversation',
      prompt: 'prompt',
      targetLangs: ['ja'],
    }));
    expect(value.triggerTag).toEqual({
      _id: 'tag-1',
      name: 'Custom tag',
      lang: null,
      translations: [{ lang: 'ja', name: '独自タグ' }],
    });
    expect(mockRoom.findOne).toHaveBeenCalledWith({
      _id: 'room-1',
      floor: 'floor-1',
      delete_flg: false,
    });
    expect(mockFloor.findOne).toHaveBeenCalledWith({
      _id: 'floor-1',
      delete_flg: false,
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.triggerTag.translations)).toBe(true);
  });

  test.each([
    ['設定が無効', () => mockSetting.findOne.mockReturnValue(leanQuery(null))],
    ['実行元のタグが無効', () => mockRoomTag.findOne.mockReturnValue(leanQuery(null))],
    ['結果ユーザが無効', () => mockUser.findOne.mockReturnValue(selectedQuery(null))],
    ['ルームが無効', () => mockRoom.findOne.mockReturnValue(selectedQuery(null))],
    ['フロアが無効', () => mockFloor.findOne.mockReturnValue(selectedQuery(null))],
  ])('%sの場合は外部サービスへの送信前に処理を省く', async (_label, arrange) => {
    arrange();
    await expect(
      buildAnalysisSnapshot({ chatId: 'post-1', sourceType: 'post', settingId: 'setting-1' })
    ).resolves.toBeNull();
  });

  test('設定のタグ所属とメディア・本文への適用可否を検証する', async () => {
    mockSetting.findOne.mockReturnValueOnce(leanQuery(setting({ room_tag: 'other-tag' })));
    await expect(
      buildAnalysisSnapshot({ chatId: 'post-1', sourceType: 'post', settingId: 'setting-1' })
    ).resolves.toBeNull();

    mockSetting.findOne.mockReturnValueOnce(leanQuery(setting({ analysis_kind: 'vision' })));
    mockChat.findOne.mockReturnValueOnce(leanQuery(chat({ image_name: null })));
    await expect(
      buildAnalysisSnapshot({ chatId: 'post-1', sourceType: 'post', settingId: 'setting-1' })
    ).resolves.toBeNull();
  });

  test('対象リビジョンがない旧データはリビジョン0として記録する', async () => {
    mockChat.findOne.mockReturnValueOnce(leanQuery(chat({ analysis_source_revision: undefined })));
    await expect(
      buildAnalysisSnapshot({ chatId: 'post-1', sourceType: 'post', settingId: 'setting-1' })
    ).resolves.toEqual(expect.objectContaining({ sourceRevision: 0 }));
  });

  test('親投稿を変更せずに解析対象の返信を取得する', () => {
    const reply = { _id: 'reply-1', delete_flg: false };
    const parent = chat({ replies: [reply] });
    expect(resolveSourceState(parent, { sourceType: 'reply', replyId: 'reply-1' })).toEqual({
      chat: parent,
      source: reply,
    });
  });

  test.each([
    ['vision', { image_name: 'image.jpg' }, true],
    ['vision', { image_name: null }, false],
    ['audioScene', { audio_name: null, video_name: 'video.mp4' }, true],
    ['speech', { audio_name: null, video_name: null }, false],
    ['video', { video_name: 'video.mp4' }, true],
    ['conversation', { content: ' text ' }, true],
    ['conversation', { content: '   ' }, false],
  ])('%sの適用可否は現在の解析対象の項目から判定する', (kind, source, expected) => {
    expect(sourceSupportsKind(source, kind)).toBe(expected);
  });
});
