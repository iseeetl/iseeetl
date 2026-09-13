const floorMemberService = require('../../services/floor/floorMember.service');
const { handleService } = require('../_shared/serviceHandler');

const withSocketIo = (service) => async (req, res, next, io) => {
  try {
    const result = await service(req, io);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.list = handleService((req) => floorMemberService.list(req.body, req.jwtPayload));

exports.invite = handleService((req) => floorMemberService.invite(req.body, req.jwtPayload));

exports.create = handleService((req) => floorMemberService.create(req.body, req.jwtPayload));

exports.delete = withSocketIo((req, io) =>
  floorMemberService.delete(req.body, req.jwtPayload, io)
);

exports.leave = withSocketIo((req, io) =>
  floorMemberService.leave(req.body, req.jwtPayload, io)
);

exports.managementPaginate = handleService((req) => floorMemberService.managementPaginate(req.body, req.jwtPayload));

exports.managementDelete = withSocketIo((req, io) =>
  floorMemberService.managementDelete(req.body, req.jwtPayload, io)
);
