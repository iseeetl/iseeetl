jest.mock('../../../../models/Chat', () => ({ aggregate: jest.fn() }));
jest.mock('../../../../models/RoomTag', () => ({ find: jest.fn() }));
jest.mock('../../../../models/RoomAIAnalysisSetting', () => ({ find: jest.fn() }));
jest.mock('../../../../services/room/roomAccess.service', () => ({ authorizeRoomMetadataAccess: jest.fn() }));
const Chat = require('../../../../models/Chat');
const Tag = require('../../../../models/RoomTag');
const Setting = require('../../../../models/RoomAIAnalysisSetting');
const { authorizeRoomMetadataAccess } = require('../../../../services/room/roomAccess.service');
const service = require('../../../../services/room/aiSources.service');
describe('room AI viewing sources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authorizeRoomMetadataAccess.mockResolvedValue({ room: { _id: 'room-a', floor: 'floor-a' } });
    Setting.find.mockReturnValue({ select: () => ({ lean: async () => [{ room_tag: 'active' }] }) });
    Chat.aggregate.mockResolvedValue([{ _id: 'past' }, { _id: 'missing' }, { _id: null }]);
    Tag.find.mockReturnValue({ select: () => ({ sort: () => ({ lean: async () => [
      { _id: 'active', name: 'active tag' }, { _id: 'past', name: 'past tag', delete_flg: true },
    ] }) }) });
  });
  it('authorizes before any history read', async () => {
    authorizeRoomMetadataAccess.mockRejectedValue(new Error('denied'));
    await expect(service.list({ room_id: 'room-a' }, { guest: true })).rejects.toThrow('denied');
    expect(Chat.aggregate).not.toHaveBeenCalled();
    expect(Setting.find).not.toHaveBeenCalled();
  });
  it('keeps historical and unknown origins without leaking another room', async () => {
    const result = await service.list({ room_id: 'room-a' }, { guest: true });
    expect(result.map((tag) => tag._id)).toEqual(['active', 'past', 'missing', '__unknown__']);
    expect(Tag.find.mock.calls[0][0]).toEqual({ room: 'room-a', floor: 'floor-a', _id: { $in: ['active', 'past', 'missing'] } });
    expect(Setting.find.mock.calls[0][0]).toEqual({ room: 'room-a', floor: 'floor-a', delete_flg: false });
    expect(Chat.aggregate.mock.calls[0][0][0]).toEqual({ $match: { room: 'room-a', floor: 'floor-a', delete_flg: false } });
  });
  it('does not add an unknown option when history is empty', async () => {
    Chat.aggregate.mockResolvedValue([]);
    const result = await service.list({ room_id: 'room-a' }, {});
    expect(result.some((tag) => tag.unknown)).toBe(false);
  });
});
