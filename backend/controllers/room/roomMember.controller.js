const roomMemberService = require('../../services/room/roomMember.service');
const { handleService } = require('../_shared/serviceHandler');

const withSocketIo = (service) => async (req, res, next, io) => {
  try {
    const result = await service(req, io);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.list = handleService((req) => roomMemberService.list(req.body, req.jwtPayload));

exports.invite = handleService((req) => roomMemberService.invite(req.body, req.jwtPayload));

exports.create = handleService((req) => roomMemberService.create(req.body, req.jwtPayload));

exports.delete = withSocketIo((req, io) => roomMemberService.delete(req.body, req.jwtPayload, io));

exports.leave = withSocketIo((req, io) => roomMemberService.leave(req.body, req.jwtPayload, io));

exports.contains = handleService((req) => roomMemberService.isCurrentUserRoomMember(req.body, req.jwtPayload));

exports.managementPaginate = handleService((req) => roomMemberService.managementPaginate(req.body, req.jwtPayload));

exports.managementDelete = withSocketIo((req, io) =>
  roomMemberService.managementDelete(req.body, req.jwtPayload, io)
);
