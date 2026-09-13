jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ findOne: jest.fn() }));

const AppError = require('../../../../utils/appError');
const User = require('../../../../models/User');
const Floor = require('../../../../models/Floor');
const Room = require('../../../../models/Room');

const { findActiveUser, findActiveFloor, findActiveRoom, findRoomWithFloor } = require('../../../../services/_shared/activeResource');

const buildQuery = (doc) => {
  const query = {
    select: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
  };
  return query;
};

describe('有効データの取得', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('有効なユーザの指定項目を取得する', async () => {
    const doc = { _id: 'u1' };
    const query = buildQuery(doc);
    User.findOne.mockReturnValue(query);

    const result = await findActiveUser('u1', { select: 'username' });

    expect(User.findOne).toHaveBeenCalledWith({ _id: 'u1', delete_flg: false });
    expect(query.select).toHaveBeenCalledWith('username');
    expect(result).toEqual(doc);
  });

  test('有効なフロアがなければAppErrorを返す', async () => {
    Floor.findOne.mockResolvedValue(null);
    await expect(findActiveFloor('f1')).rejects.toBeInstanceOf(AppError);
  });

  test('有効なルームがなければ指定のエラーコードを返す', async () => {
    Room.findOne.mockResolvedValue(null);
    await expect(findActiveRoom('r1', { error: { code: 'TOKEN_NOT_FOUND' } })).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  test('ルームと所属フロアを取得する', async () => {
    Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1' });
    Floor.findOne.mockResolvedValue({ _id: 'f1' });

    const result = await findRoomWithFloor('r1');

    expect(result.room._id).toBe('r1');
    expect(result.floor._id).toBe('f1');
  });

  test('ルームとフロアの取得項目を指定できる', async () => {
    const roomQuery = buildQuery({ _id: 'r2', floor: 'f2' });
    const floorQuery = buildQuery({ _id: 'f2' });
    Room.findOne.mockReturnValue(roomQuery);
    Floor.findOne.mockReturnValue(floorQuery);

    await findRoomWithFloor('r2', { roomSelect: 'title', floorSelect: 'name' });

    expect(roomQuery.select).toHaveBeenCalledWith('title');
    expect(floorQuery.select).toHaveBeenCalledWith('name');
  });
});
