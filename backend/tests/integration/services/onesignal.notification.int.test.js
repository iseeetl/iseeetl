jest.mock('../../../services/timeline/shared/notificationSender', () => ({
  dispatchPushNotification: jest.fn(),
}));

const { dispatchPushNotification } = require('../../../services/timeline/shared/notificationSender');
const { notifyPushFilterUsers } = require('../../../services/timeline/shared/pushFilterNotification');
const { filterAuthorizedRoomUserIds } = require('../../../services/room/roomAccess.service');

const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const PushFilter = require('../../../models/PushFilter');
const RoomMember = require('../../../models/RoomMember');
const KickedUser = require('../../../models/KickedUser');

const createUser = (overrides = {}) =>
  User.create({
    username: `user-${Date.now()}-${Math.random()}`,
    mail: `user-${Date.now()}-${Math.random()}@example.com`,
    lang: 'ja',
    ...overrides,
  });

describe('OneSignal通知の結合動作', () => {
  beforeEach(() => {
    dispatchPushNotification.mockClear();
  });

  test('通知を有効にしていて絞り込み条件に一致するユーザだけへ送信する', async () => {
    const owner = await createUser();
    const userMatch = await createUser({ push_enabled: true });
    const userDisabled = await createUser({ push_enabled: false });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Room',
      lang: 'ja',
    });

    await PushFilter.create([
      {
        floor: floor._id,
        room: room._id,
        user: userMatch._id,
        conditions: { keywordArray: ['hello'], logicalOperator: 'and' },
      },
      {
        floor: floor._id,
        room: room._id,
        user: userDisabled._id,
        conditions: { keywordArray: ['hello'], logicalOperator: 'and' },
      },
    ]);

    const targets = await notifyPushFilterUsers({
      roomId: room._id,
      msgInfo: { content: 'hello world', username: 'someone', room_tags: [], animation: null },
      excludeUserId: null,
      headings: { en: 'Title' },
      contents: { en: 'Body' },
      url: 'https://example.com',
    });

    expect(targets).toEqual([userMatch._id.toString()]);
    expect(dispatchPushNotification).toHaveBeenCalledTimes(1);
    expect(dispatchPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [userMatch._id.toString()],
        roomId: room._id.toString(),
        headings: { en: 'Title' },
        contents: { en: 'Body' },
        url: 'https://example.com',
      })
    );
  });

  test('絞り込みの除外対象ユーザへは通知しない', async () => {
    const owner = await createUser();
    const userMatch = await createUser({ push_enabled: true });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Floor2',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Room2',
      lang: 'ja',
    });

    await PushFilter.create({
      floor: floor._id,
      room: room._id,
      user: userMatch._id,
      conditions: { keywordArray: ['hello'], logicalOperator: 'and' },
    });

    const targets = await notifyPushFilterUsers({
      roomId: room._id,
      msgInfo: { content: 'hello world', username: 'someone', room_tags: [], animation: null },
      excludeUserId: userMatch._id,
      headings: { en: 'Title' },
      contents: { en: 'Body' },
      url: 'https://example.com',
    });

    expect(targets).toEqual([]);
    expect(dispatchPushNotification).not.toHaveBeenCalled();
  });

  test('メンバー限定ルームでは削除済み・キック済み・非メンバーのユーザへ通知しない', async () => {
    const owner = await createUser({ role: 'Editor' });
    const member = await createUser();
    const kickedMember = await createUser();
    const outsider = await createUser();
    const deleted = await createUser({ delete_flg: true });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Restricted Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Restricted Room',
      lang: 'ja',
      member_only: true,
    });

    await RoomMember.create([
      {
        floor: floor._id,
        room: room._id,
        user: member._id,
      },
      {
        floor: floor._id,
        room: room._id,
        user: kickedMember._id,
      },
    ]);
    await KickedUser.create({
      user: kickedMember._id,
      kicked_by: owner._id,
      floor: floor._id,
      room: room._id,
    });

    const result = await filterAuthorizedRoomUserIds(
      [owner._id, member._id, kickedMember._id, outsider._id, deleted._id],
      room._id
    );

    expect(result).toEqual([owner._id.toString(), member._id.toString()]);
  });
});
