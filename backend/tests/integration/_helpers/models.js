const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');

const uniqueValue = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createUser = (overrides = {}) =>
  User.create({
    username: uniqueValue('user'),
    mail: `${uniqueValue('user')}@example.com`,
    lang: 'ja',
    role: 'User',
    ...overrides,
  });

const createFloor = (owner, overrides = {}) =>
  Floor.create({
    user: owner._id,
    title: 'Floor',
    description: 'desc',
    lang: 'ja',
    target_langs: [],
    ...overrides,
  });

const createRoom = (owner, floorOrFloorId, overrides = {}) => {
  const floorId = floorOrFloorId?._id || floorOrFloorId;
  return Room.create({
    user: owner._id,
    floor: floorId,
    title: 'Room',
    description: 'desc',
    lang: 'ja',
    member_only: false,
    ...overrides,
  });
};

module.exports = {
  createUser,
  createFloor,
  createRoom,
};
