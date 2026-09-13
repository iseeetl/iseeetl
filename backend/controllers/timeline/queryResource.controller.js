const posts = require('../../services/timeline/posts.service');
const roomTags = require('../../services/room/roomTag.service');
const { mapListRequest, mapDetailRequest, mapRoomTagsRequest } = require('../../validates/timelineQuery');
const { errors } = require('./resourceOptions');

exports.list = (search = false) => async (req, res, next) => {
  try {
    const input = mapListRequest(req.params, search ? req.body : req.query, search);
    return res.json(await posts.list(input, req.jwtPayload, { errors }));
  } catch (error) { return next(error); }
};
exports.detail = async (req, res, next) => {
  try {
    const input = mapDetailRequest(req.params, req.query);
    return res.json(await posts.detail(input, req.jwtPayload, { errors }));
  } catch (error) { return next(error); }
};
exports.roomTags = async (req, res, next) => {
  try {
    const input = mapRoomTagsRequest(req.params, req.query);
    return res.json(await roomTags.list(input, { jwtPayload: req.jwtPayload, guest: req.guest, errors }));
  } catch (error) { return next(error); }
};
