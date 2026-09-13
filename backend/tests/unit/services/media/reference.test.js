const mockAccess = jest.fn(() => Promise.resolve());
jest.mock('fs', () => ({ promises: { access: mockAccess } }));

const mockChatFind = jest.fn();
jest.mock('../../../../models/Chat', () => ({ find: mockChatFind }));
const mockRoomExists = jest.fn(() => Promise.resolve(false));
jest.mock('../../../../models/Room', () => ({ exists: mockRoomExists }));

const AppError = require('../../../../utils/appError');
const timelineMutationAdapter = require('../../../../services/v1/timelineMutation.adapter');
const { mergeTimelinePatch } = require('../../../../services/timeline/shared/partialMutation');
const {
  chatReferencesFile,
  isMediaFileReferenced,
  parseMediaFileName,
  validateMediaChanges,
} = require('../../../../services/media/reference');

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const FLOOR_ID = '507f1f77bcf86cd799439013';
const ROOM_ID = '507f1f77bcf86cd799439014';
const POST_ID = '507f1f77bcf86cd799439015';
const REPLY_ID = '507f1f77bcf86cd799439016';
const IMAGE = `1700000000000_${USER_ID}.png`;
const IMAGE_THUMB = `1700000000000_${USER_ID}_thumbnail.png`;
const VIDEO = `1700000000001_${USER_ID}.mp4`;
const VIDEO_THUMB = `1700000000001_${USER_ID}.png`;
const VIDEO_SUBTITLE = `1700000000002_${USER_ID}.vtt`;

const setChats = (chats) => {
  const lean = jest.fn(() => Promise.resolve(chats));
  const select = jest.fn(() => ({ lean }));
  mockChatFind.mockReturnValue({ select });
};

describe('mediaReferenceの検証', () => {
  const originalMediaPath = process.env.MEDIA_PATH;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MEDIA_PATH = '/test-fixtures/timeline-media-reference/media';
    mockAccess.mockResolvedValue();
    mockRoomExists.mockResolvedValue(false);
    setChats([]);
  });

  afterAll(() => {
    if (originalMediaPath === undefined) delete process.env.MEDIA_PATH;
    else process.env.MEDIA_PATH = originalMediaPath;
  });

  test('ファイル名から所有者・形式・サムネイルを厳密に解析する', () => {
    expect(parseMediaFileName(IMAGE)).toEqual({
      timestamp: '1700000000000',
      userId: USER_ID,
      thumbnail: false,
      extension: '.png',
      baseName: `1700000000000_${USER_ID}`,
    });
    expect(parseMediaFileName('../outside.png')).toBeNull();
  });

  test('他ユーザのファイル名を拒否する', async () => {
    await expect(
      validateMediaChanges({
        floorId: FLOOR_ID,
        roomId: ROOM_ID,
        userId: USER_ID,
        newItem: {
          image_name: `1700000000000_${OTHER_USER_ID}.png`,
          image_thumbnail_name: `1700000000000_${OTHER_USER_ID}_thumbnail.png`,
        },
      })
    ).rejects.toEqual(expect.any(AppError));
    expect(mockAccess).not.toHaveBeenCalled();
  });

  test('本体とサムネイルの組み合わせが一致しない画像を拒否する', async () => {
    await expect(
      validateMediaChanges({
        floorId: FLOOR_ID,
        roomId: ROOM_ID,
        userId: USER_ID,
        newItem: {
          image_name: IMAGE,
          image_thumbnail_name: `1700000000001_${USER_ID}_thumbnail.png`,
        },
      })
    ).rejects.toHaveProperty('status', 400);
  });

  test('1つの対象へ複数メディアグループを同時指定すると拒否する', async () => {
    await expect(
      validateMediaChanges({
        floorId: FLOOR_ID,
        roomId: ROOM_ID,
        userId: USER_ID,
        newItem: {
          image_name: IMAGE,
          image_thumbnail_name: IMAGE_THUMB,
          audio_name: `1700000000001_${USER_ID}.mp3`,
        },
      })
    ).rejects.toHaveProperty('status', 400);
    expect(mockAccess).not.toHaveBeenCalled();
  });

  test.each([
    ['字幕元ファイル名だけ', { video_subtitle_originalname: 'subtitle.vtt' }],
    ['字幕保存名だけ', { video_subtitle_name: VIDEO_SUBTITLE }],
  ])('動画で%sを指定すると拒否する', async (_label, subtitle) => {
    await expect(
      validateMediaChanges({
        floorId: FLOOR_ID,
        roomId: ROOM_ID,
        userId: USER_ID,
        newItem: {
          video_name: VIDEO,
          video_thumbnail_name: VIDEO_THUMB,
          ...subtitle,
        },
      })
    ).rejects.toHaveProperty('status', 400);
    expect(mockAccess).not.toHaveBeenCalled();
  });

  test.each([
    [
      '相手fieldを省略した更新',
      { video_subtitle_originalname: 'renamed.vtt' },
      { video_subtitle_originalname: 'renamed.vtt', video_subtitle_name: VIDEO_SUBTITLE },
      true,
    ],
    [
      '両fieldをnullにした字幕解除',
      { video_subtitle_originalname: null, video_subtitle_name: null },
      { video_subtitle_originalname: null, video_subtitle_name: null },
      true,
    ],
    [
      '片側だけnullにした不完全な解除',
      { video_subtitle_name: null },
      { video_subtitle_originalname: 'subtitle.vtt', video_subtitle_name: null },
      false,
    ],
  ])('v1動画字幕の%sを最終状態で検証する', async (_label, update, expected, valid) => {
    const current = {
      content: 'same',
      lang: 'ja',
      video_name: VIDEO,
      video_thumbnail_name: VIDEO_THUMB,
      video_subtitle_originalname: 'subtitle.vtt',
      video_subtitle_name: VIDEO_SUBTITLE,
    };
    const adapted = timelineMutationAdapter.adaptPostUpdate({
      room_id: ROOM_ID,
      post_id: POST_ID,
      content: 'same',
      ...update,
    });
    const effective = mergeTimelinePatch(current, adapted);
    expect(effective).toEqual(expect.objectContaining(expected));

    const validation = validateMediaChanges({
      floorId: FLOOR_ID,
      roomId: ROOM_ID,
      userId: USER_ID,
      newItem: effective,
      oldItem: current,
    });
    if (valid) await expect(validation).resolves.toBeUndefined();
    else await expect(validation).rejects.toHaveProperty('status', 400);
  });

  test.each([
    ['画像caption', { image_caption: 'caption' }],
    ['音声title', { audio_title: 'title' }],
    ['音声description', { audio_description: 'description' }],
  ])('本体のない%sを拒否する', async (_label, metadata) => {
    await expect(
      validateMediaChanges({
        floorId: FLOOR_ID,
        roomId: ROOM_ID,
        userId: USER_ID,
        newItem: metadata,
      })
    ).rejects.toHaveProperty('status', 400);
    expect(mockAccess).not.toHaveBeenCalled();
  });

  test('対象ルームに実在しないファイルを拒否する', async () => {
    mockAccess.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    await expect(
      validateMediaChanges({
        floorId: FLOOR_ID,
        roomId: ROOM_ID,
        userId: USER_ID,
        newItem: { image_name: IMAGE, image_thumbnail_name: IMAGE_THUMB },
      })
    ).rejects.toHaveProperty('status', 400);
  });

  test('所有者・ルーム・種別が正しく未参照の画像を許可する', async () => {
    await expect(
      validateMediaChanges({
        floorId: FLOOR_ID,
        roomId: ROOM_ID,
        userId: USER_ID,
        newItem: { image_name: IMAGE, image_thumbnail_name: IMAGE_THUMB },
      })
    ).resolves.toBeUndefined();
    expect(mockAccess).toHaveBeenCalledTimes(2);
  });

  test('ルーム画像として参照中のファイルを拒否する', async () => {
    mockRoomExists.mockResolvedValue({ _id: ROOM_ID });
    await expect(
      validateMediaChanges({
        floorId: FLOOR_ID,
        roomId: ROOM_ID,
        userId: USER_ID,
        newItem: { image_name: IMAGE, image_thumbnail_name: IMAGE_THUMB },
      })
    ).rejects.toHaveProperty('status', 400);
  });

  test('投稿・返信・付加情報の残存参照を検出する', async () => {
    const chat = {
      _id: POST_ID,
      delete_flg: false,
      replies: [{
        _id: REPLY_ID,
        delete_flg: false,
        supplementaries: [{ _id: '507f1f77bcf86cd799439017', delete_flg: false, audio_name: 'shared.mp3' }],
      }],
    };
    expect(chatReferencesFile(chat, 'shared.mp3')).toBe(true);
    setChats([chat]);
    await expect(isMediaFileReferenced({ roomId: ROOM_ID, fileName: 'shared.mp3' })).resolves.toBe(true);
  });

  test('更新対象自身だけを除外し、兄弟レコードの参照は維持する', () => {
    const chat = {
      _id: POST_ID,
      delete_flg: false,
      image_name: IMAGE,
      replies: [{ _id: REPLY_ID, delete_flg: false, image_name: IMAGE }],
    };
    expect(
      chatReferencesFile(chat, IMAGE, { kind: 'post', postId: POST_ID })
    ).toBe(true);
    expect(
      chatReferencesFile(chat, IMAGE, { kind: 'reply', postId: POST_ID, replyId: REPLY_ID })
    ).toBe(true);
  });

  test('メディアが変更されていない更新では再要求しない', async () => {
    const item = { image_name: IMAGE, image_thumbnail_name: IMAGE_THUMB };
    await validateMediaChanges({
      floorId: FLOOR_ID, roomId: ROOM_ID, userId: USER_ID, newItem: item, oldItem: item,
    });
    expect(mockAccess).not.toHaveBeenCalled();
    expect(mockChatFind).not.toHaveBeenCalled();
  });
});
