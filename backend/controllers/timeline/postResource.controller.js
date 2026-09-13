const posts = require('../../services/timeline/posts.service');
const { mapPostRequest } = require('../../validates/timelineResource');
const { presentPostMutation } = require('./postResource.presenter');

const RESOURCE_OPTIONS = require('./resourceOptions');

const handle = (operation, status) => async (req, res, next) => {
  try {
    const input = mapPostRequest(req.params, req.body, operation);
    const result = await posts[operation](input, req.jwtPayload, req.io, RESOURCE_OPTIONS);
    if (status === 204) return res.status(204).end();
    return res.status(status).json(presentPostMutation(result));
  } catch (error) {
    return next(error);
  }
};

exports.create = handle('create', 201);
exports.update = handle('update', 200);
exports.delete = handle('delete', 204);
