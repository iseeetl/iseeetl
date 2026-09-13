const upload = require('../../services/upload.service');
const AppError = require('../../utils/appError');
const scope = (req) => ({ floor_id: req.uploadTarget.floorId, room_id: req.uploadTarget.roomId });

exports.handle = (kind) => async (req, res, next) => {
  try {
    if (Object.keys(req.body || {}).length) throw new AppError({ code: 'INVALID_PARAMS' });
    const result = await upload[`uploadTimeline${kind}`](scope(req), req.files, req.jwtPayload);
    return res.status(201).json(result);
  } catch (error) { return next(error); }
};

exports.discard = async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || Object.keys(body).some((key) => key !== 'file_names') || !Array.isArray(body.file_names) ||
      body.file_names.length < 1 || body.file_names.length > 6 || body.file_names.some((name) => typeof name !== 'string')) {
      throw new AppError({ code: 'INVALID_PARAMS' });
    }
    return res.json(await upload.discardTimelineMedia({ ...scope(req), file_names: body.file_names }, req.jwtPayload));
  } catch (error) { return next(error); }
};
