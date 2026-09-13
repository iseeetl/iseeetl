const defaultLogger = require('../utils/logger');
const { createRoomLanguageProvider } = require('../socket/roomLanguageProvider');

const normalizeSocketRoom = (value) => {
  if (Array.isArray(value)) return value.map(normalizeSocketRoom);
  if (value && typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return value;
};

const wrapRoomSelector = (io) => {
  const originalTo = io.to.bind(io);
  io.to = (room) => originalTo(normalizeSocketRoom(room));
  const originalIn = io.in.bind(io);
  io.in = (room) => originalIn(normalizeSocketRoom(room));
};

const createServer = ({
  config,
  logger = defaultLogger,
  createExpressApp,
  createHttpServer,
  SocketServer,
  registerSocketHandlers,
  configureHttpApp,
} = {}) => {
  if (!config) throw new Error('createServer requires config');

  const resolvedCreateExpressApp = createExpressApp || require('express');
  const resolvedCreateHttpServer = createHttpServer || require('http').createServer;
  const ResolvedSocketServer = SocketServer || require('socket.io').Server;
  const resolvedSocketHandlers = registerSocketHandlers || require('../socket');
  const resolvedConfigureHttpApp = configureHttpApp || require('../createApp').configureApp;

  const app = resolvedCreateExpressApp();
  const server = resolvedCreateHttpServer(app);
  const ioOptions = {
    pingInterval: 5000,
    pingTimeout: 15000,
    allowEIO3: true,
  };
  if (config.socketCors && config.socketCors.cors) ioOptions.cors = config.socketCors.cors;

  const io = new ResolvedSocketServer(server, ioOptions);
  const roomParticipants = new Map();
  io.roomLanguageProvider = createRoomLanguageProvider(roomParticipants);
  wrapRoomSelector(io);
  resolvedSocketHandlers(io, roomParticipants);

  resolvedConfigureHttpApp({
    app,
    io,
    config: {
      nodeEnv: config.nodeEnv,
      capabilities: config.capabilities,
      privateConfig: config.privateConfig,
      corsAllowedOrigins: config.corsAllowedOrigins,
      mediaRoot: config.mediaRoot,
      profileRoot: config.profileRoot,
      distRoot: config.distRoot,
    },
    logger,
  });

  return { app, server, io, roomParticipants };
};

module.exports = {
  normalizeSocketRoom,
  wrapRoomSelector,
  createServer,
};
