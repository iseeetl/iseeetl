const transcriptionService = require('../../services/timeline/transcription.service');
const { handleService } = require('../_shared/serviceHandler');

exports.transcribe = handleService(async (req) => {
  const text = await transcriptionService.transcribeBuffer(req.file, req.body, req.jwtPayload);
  return { text };
});
