const ORIGINAL_ENV = process.env;
process.env = { ...ORIGINAL_ENV, MEDIA_PATH: '/test-fixtures/timeline-management/media/' };

jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
  },
}));

const mockPipe = jest.fn();
const mockDirectory = jest.fn();
const mockFinalize = jest.fn().mockResolvedValue(true);
jest.mock('archiver', () =>
  jest.fn(() => ({
    on: jest.fn(),
    pipe: mockPipe,
    directory: mockDirectory,
    finalize: mockFinalize,
  }))
);

jest.mock('mongo-sanitize', () => jest.fn((v) => v));

jest.mock('../../../../services/timeline/shared/timelineSerializer', () => {
  const remove = jest.fn((value) => value);
  remove.serializeTimelineForPublic = jest.fn((value) => value);
  return remove;
});

const mockDeleteMediaItem = jest.fn();
jest.mock('../../../../services/media/fileCleanup', () => ({
  deleteMediaItem: mockDeleteMediaItem,
}));

jest.mock('../../../../models/Chat', () => ({
  paginate: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/User', () => ({ find: jest.fn() }));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(options, statusCode) {
      this.message = options && options.code ? options.code : options;
      this.code = options && options.code;
      this.statusCode = statusCode;
    }
);

const managementService = require('../../../../services/timeline/management.service');
const Chat = require('../../../../models/Chat');
const Floor = require('../../../../models/Floor');
const Room = require('../../../../models/Room');
const User = require('../../../../models/User');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const fsPromises = require('fs').promises;

const buildSelectMock = (resolvedValue) => ({
  select: jest.fn().mockResolvedValue(resolvedValue),
});

const buildQueryChain = (result) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

const buildUserFindChain = (result) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(result),
  }),
});

describe('managementのサービス', () => {
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ページ単位の一覧取得', () => {
    beforeEach(() => {
      Chat.paginate.mockResolvedValue({ docs: [] });
      User.find.mockReturnValue(buildUserFindChain([]));
    });

    test('検索なしでページネーション', async () => {
      await managementService.paginate({ page: 2, search: '' });

      expect(Chat.paginate).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          page: 2,
          limit: 10,
          sort: { created_at: 'desc' },
        })
      );
      expect(serializeTimeline.serializeTimelineForPublic).toHaveBeenCalledWith([], {
        preserveDeleted: true,
      });
    });

    test('検索ありで user/guest 名条件を組み立てる', async () => {
      const search = 'Alice';
      User.find.mockReturnValue(buildUserFindChain([{ _id: 'u1' }, { _id: 'u2' }]));
      await managementService.paginate({ page: 1, search });

      const firstArg = Chat.paginate.mock.calls[0][0];

      expect(User.find).toHaveBeenCalledWith(
        expect.objectContaining({
          username: expect.objectContaining({
            $regex: expect.any(RegExp),
          }),
          delete_flg: false,
        })
      );
      expect(firstArg).toHaveProperty('$or');
      expect(Array.isArray(firstArg.$or)).toBe(true);
      expect(firstArg.$or).toEqual(
        expect.arrayContaining([
          { user: { $in: ['u1', 'u2'] } },
          { 'replies.user': { $in: ['u1', 'u2'] } },
          { 'supplementaries.user': { $in: ['u1', 'u2'] } },
          { 'replies.supplementaries.user': { $in: ['u1', 'u2'] } },
          expect.objectContaining({ guest_name: { $regex: expect.any(RegExp) } }),
          expect.objectContaining({ 'replies.guest_name': { $regex: expect.any(RegExp) } }),
        ])
      );
      expect(firstArg.$or).toHaveLength(6);
    });

    test('検索ありで一致ユーザ0件でもゲスト名条件で検索する', async () => {
      User.find.mockReturnValue(buildUserFindChain([]));
      await managementService.paginate({ page: 1, search: 'NoHit' });

      const firstArg = Chat.paginate.mock.calls[0][0];
      expect(firstArg.$or).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ guest_name: { $regex: expect.any(RegExp) } }),
          expect.objectContaining({ 'replies.guest_name': { $regex: expect.any(RegExp) } }),
        ])
      );
      expect(firstArg.$or).toHaveLength(2);
    });
  });

  describe('タイムライン取得', () => {
    const floorId = 'floor1';
    const roomId = 'room1';

    test('投稿取得、serializeTimeline 呼び出し', async () => {
      Room.findOne.mockImplementation(() => buildSelectMock({ _id: roomId }));

      Chat.find.mockReturnValue(buildQueryChain([{ _id: 'c1' }]));

      const res = await managementService.timeline({ floor_id: floorId, room_id: roomId });

      expect(Chat.find).toHaveBeenCalledWith({ floor: floorId, room: roomId, delete_flg: false });
      expect(serializeTimeline).toHaveBeenCalledWith([{ _id: 'c1' }]);
      expect(serializeTimeline.serializeTimelineForPublic).not.toHaveBeenCalled();
      expect(res).toEqual([{ _id: 'c1' }]);
      expect(Room.findOne).toHaveBeenCalledTimes(1);
      expect(Floor.findOne).not.toHaveBeenCalled();
    });

    test('ルームが指定フロアに所属しない場合は拒否する', async () => {
      Room.findOne.mockImplementation(() => buildSelectMock(null));

      await expect(managementService.timeline({ floor_id: floorId, room_id: roomId })).rejects.toMatchObject({
        code: 'INVALID_PARAMS',
      });

      expect(Room.findOne).toHaveBeenCalledWith({ _id: roomId, floor: floorId });
      expect(Floor.findOne).not.toHaveBeenCalled();
      expect(Chat.find).not.toHaveBeenCalled();
    });
  });

  describe('タイムラインのメディア取得', () => {
    const floorId = '507f1f77bcf86cd799439011';
    const roomId = '507f1f77bcf86cd799439012';

    test('ZIP 生成フロー', async () => {
      Room.findOne.mockImplementation(() => buildSelectMock({ _id: roomId }));
      fsPromises.access.mockResolvedValue(true);

      const result = await managementService.timelineMedia({ floor_id: floorId, room_id: roomId });

      const expectedDir = `${process.env.MEDIA_PATH}${floorId}/${roomId}`;
      expect(fsPromises.access).toHaveBeenCalledWith(expectedDir);
      expect(mockDirectory).toHaveBeenCalledWith(expectedDir, false);
      expect(result).toEqual(expect.objectContaining({
        archive: expect.any(Object),
        fileName: 'timeline_media.zip',
      }));
      expect(mockPipe).not.toHaveBeenCalled();
      expect(mockFinalize).not.toHaveBeenCalled();
    });

    test('fs.access が失敗で例外', async () => {
      Room.findOne.mockImplementation(() => buildSelectMock({ _id: roomId }));
      fsPromises.access.mockRejectedValue(new Error('no dir'));

      await expect(managementService.timelineMedia({ floor_id: floorId, room_id: roomId })).rejects.toBeInstanceOf(
        Error
      );
    });

    test('ルームが指定フロアに所属しない場合はファイルへアクセスしない', async () => {
      Room.findOne.mockImplementation(() => buildSelectMock(null));

      await expect(managementService.timelineMedia({ floor_id: floorId, room_id: roomId })).rejects.toMatchObject({
        code: 'INVALID_PARAMS',
      });

      expect(Room.findOne).toHaveBeenCalledWith({ _id: roomId, floor: floorId });
      expect(fsPromises.access).not.toHaveBeenCalled();
    });
  });

  describe('削除状態の解除による復元', () => {
    const postId = 'post1';
    const replyId = 'reply1';
    const postSupplementId = 'postSupplement1';
    const replySupplementId = 'replySupplement1';
    const post = {
      _id: postId,
      floor: 'floor1',
      room: 'room1',
      image_name: 'deleted-post.png',
      supplementaries: [
        {
          _id: postSupplementId,
          image_name: 'deleted-post-supplement.png',
        },
      ],
      replies: [
        {
          _id: replyId,
          image_name: 'deleted-reply.png',
          supplementaries: [
            {
              _id: replySupplementId,
              image_name: 'deleted-reply-supplement.png',
            },
          ],
        },
      ],
    };

    beforeEach(() => {
      Chat.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(post),
      });
      Chat.findByIdAndUpdate.mockResolvedValue({ ...post, delete_flg: false });
      Chat.findOneAndUpdate.mockResolvedValue({ ...post, delete_flg: false });
    });

    test('投稿復元は削除フラグだけを戻し、物理削除済みメディアを操作しない', async () => {
      const result = await managementService.delete({ post_id: postId, delete_flg: false });

      expect(Chat.findByIdAndUpdate).toHaveBeenCalledWith(
        postId,
        {
          delete_flg: false,
          updated_at: expect.any(Number),
          deleted_at: null,
        },
        { new: true, runValidators: true }
      );
      expect(result.image_name).toBe('deleted-post.png');
      expect(mockDeleteMediaItem).not.toHaveBeenCalled();
    });

    test.each([
      {
        name: '返信',
        body: { post_id: postId, reply_id: replyId, delete_flg: false },
        query: { _id: postId, 'replies._id': replyId },
        targetPath: 'replies.$[reply]',
        options: {
          arrayFilters: [{ 'reply._id': replyId }],
          new: true,
          runValidators: true,
        },
      },
      {
        name: '投稿付加情報',
        body: { post_id: postId, supplement_id: postSupplementId, delete_flg: false },
        query: { _id: postId, 'supplementaries._id': postSupplementId },
        targetPath: 'supplementaries.$[supplement]',
        options: {
          arrayFilters: [{ 'supplement._id': postSupplementId }],
          new: true,
          runValidators: true,
        },
      },
      {
        name: '返信付加情報',
        body: {
          post_id: postId,
          reply_id: replyId,
          supplement_id: replySupplementId,
          delete_flg: false,
        },
        query: {
          _id: postId,
          'replies._id': replyId,
          'replies.supplementaries._id': replySupplementId,
        },
        targetPath: 'replies.$[reply].supplementaries.$[supplement]',
        options: {
          arrayFilters: [{ 'reply._id': replyId }, { 'supplement._id': replySupplementId }],
          new: true,
          runValidators: true,
        },
      },
    ])('$name復元は削除フラグだけを戻し、物理削除済みメディアを操作しない', async ({
      body,
      query,
      targetPath,
      options,
    }) => {
      await managementService.delete(body);

      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        query,
        {
          $set: {
            [`${targetPath}.updated_at`]: expect.any(Number),
            [`${targetPath}.delete_flg`]: false,
            [`${targetPath}.deleted_at`]: null,
          },
        },
        options
      );
      expect(mockDeleteMediaItem).not.toHaveBeenCalled();
    });
  });
});
