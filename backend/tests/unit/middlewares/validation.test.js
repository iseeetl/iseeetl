jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const fs = require('fs');
const { body } = require('express-validator');
const AppError = require('../../../utils/appError');
const { buildReq, runValidators } = require('../validates/_helpers');
const {
  cleanupUploadOnError,
  finalize,
  requireAnyFile,
  requireFiles,
} = require('../../../middlewares/validation');

describe('入力検証の共通ミドルウェア', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('入力エラーがあれば検証の確定時にAppErrorを返す', async () => {
    const req = buildReq({ body: {} });
    await runValidators(body('name').exists(), req);

    const next = jest.fn();
    await finalize(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  test('入力エラーがなければ検証を通過する', async () => {
    const req = buildReq({ body: { name: 'ok' } });
    await runValidators(body('name').exists(), req);

    const next = jest.fn();
    await finalize(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(fs.promises.unlink).not.toHaveBeenCalled();
  });

  test('入力エラーがあればアップロード済みのファイルを削除する', async () => {
    const req = buildReq({
      body: {},
      files: {
        image_file: [{ path: '/test-fixtures/shared-middleware/image.png' }],
        video_file: [{ path: '/test-fixtures/shared-middleware/video.mp4' }],
      },
    });
    req.file = { path: '/test-fixtures/shared-middleware/avatar.png' };

    await runValidators(body('name').exists(), req);

    const next = jest.fn();
    await finalize(req, {}, next);

    expect(fs.promises.unlink).toHaveBeenCalledWith('/test-fixtures/shared-middleware/avatar.png');
    expect(fs.promises.unlink).toHaveBeenCalledWith('/test-fixtures/shared-middleware/image.png');
    expect(fs.promises.unlink).toHaveBeenCalledWith('/test-fixtures/shared-middleware/video.mp4');
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  test('アップロード済みの全ファイルを削除し、元のエラーを維持する', async () => {
    const req = buildReq({
      files: {
        video_file: [{ path: '/test-fixtures/shared-middleware/cleanup-video.mp4' }],
        video_subtitle_file: [{ path: '/test-fixtures/shared-middleware/subtitle.vtt' }],
      },
    });
    const error = new AppError({ code: 'FILE_TOO_LARGE' });
    const next = jest.fn();

    await cleanupUploadOnError(error, req, {}, next);

    expect(fs.promises.unlink).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledWith(error);
  });

  test('必須のファイル項目を検証する', () => {
    const req = buildReq({ files: {} });
    const next = jest.fn();
    const middleware = requireFiles(['file']);
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  test('対象項目のファイルが1つ以上あれば受け付ける', () => {
    const req = buildReq({
      files: { video_subtitle_file: [{ path: '/test-fixtures/shared-middleware/subtitle.vtt' }] },
    });
    const next = jest.fn();
    const middleware = requireAnyFile(['video_file', 'video_subtitle_file']);

    middleware(req, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  test('対象項目のファイルがすべてなければ拒否する', () => {
    const req = buildReq({ files: {} });
    const next = jest.fn();
    const middleware = requireAnyFile(['video_file', 'video_subtitle_file']);

    middleware(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });
});
