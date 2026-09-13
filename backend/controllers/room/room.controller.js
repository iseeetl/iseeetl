const roomService = require('../../services/room/room.service');
const { handleService } = require('../_shared/serviceHandler');

exports.guestList = handleService((req) => roomService.guestList(req.body));

exports.list = handleService((req) => roomService.list(req.body, req.jwtPayload));

exports.detail = handleService((req) => roomService.detail(req.body));

exports.create = handleService((req) => roomService.create(req.body, req.jwtPayload));

exports.update = handleService((req) => roomService.update(req.body, req.jwtPayload, req.io));

exports.updateRoomDisplayHidden = handleService((req) => roomService.updateRoomDisplayHidden(req.body, req.jwtPayload));

exports.updateDisplayOrder = handleService((req) => roomService.updateDisplayOrder(req.body, req.jwtPayload));

exports.delete = handleService((req) => roomService.delete(req.body, req.jwtPayload, req.io));

exports.managementPaginate = handleService((req) => roomService.managementPaginate(req.body, req.jwtPayload));

exports.managementUpdate = handleService((req) => roomService.managementUpdate(req.body, req.jwtPayload, req.io));

exports.managementSetDeleteState = handleService((req) =>
  roomService.managementSetDeleteState(req.body, req.jwtPayload, req.io)
);
