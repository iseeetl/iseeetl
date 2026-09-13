const { authenticateSocket } = require('./authenticateSocket');
const { createRoomPresenceHandler } = require('./roomPresence');

const registerSocketHandlers = (io, roomParticipants) => {
  io.use(authenticateSocket).on('connection', createRoomPresenceHandler(io, roomParticipants));
};

module.exports = registerSocketHandlers;
