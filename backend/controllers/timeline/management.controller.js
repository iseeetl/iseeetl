const managementService = require('../../services/timeline/management.service');
const { handleService } = require('../_shared/serviceHandler');

exports.paginate = handleService((req) => managementService.paginate(req.body));

exports.timeline = handleService((req) => managementService.timeline(req.body));

exports.timelineMedia = async (req, res, next) => {
  try {
    const { archive, fileName } = await managementService.timelineMedia(req.body);
    res.setHeader('Content-Type', 'application/zip');
    res.attachment(fileName);

    await new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      const fail = (error) => {
        if (finished) return;
        finished = true;
        if (!res.headersSent) res.statusCode = 500;
        if (!res.writableEnded) res.end();
        reject(error);
      };

      archive.on('error', fail);
      res.on('finish', finish);
      res.on('close', () => {
        archive.destroy();
        finish();
      });
      archive.pipe(res);
      Promise.resolve(archive.finalize()).catch(fail);
    });
  } catch (error) {
    next(error);
  }
};

exports.delete = handleService((req) => managementService.delete(req.body, req.jwtPayload));

exports.estimate = handleService((req) => managementService.estimate(req.body));
