const uploadAdapter = require('../../../../services/v1/uploads.adapter');

jest.mock('../../../../services/v1/uploads.adapter', () => ({
  discardTimelineMedia: jest.fn(),
  storeAudio: jest.fn(),
  storeImage: jest.fn(),
  storeVideo: jest.fn(),
}));

const { createUploadsController } = require('../../../../controllers/v1/uploads.controller');

describe('v1アップロードのコントローラ', () => {
  const io = { to: jest.fn() };
  const request = {
    body: { floor_id: 'floor', room_id: 'room' },
    files: { image_file: [{ buffer: Buffer.from('image') }] },
    jwtPayload: { user_id: 'user', user_role: 'developer' },
    params: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['image', 'storeImage', { image_name: 'image.png', image_thumbnail_name: 'image_thumbnail.png' }],
    ['video', 'storeVideo', { video_name: 'video.mp4', video_thumbnail_name: 'video.png' }],
    ['audio', 'storeAudio', { audio_name: 'audio.mp3' }],
    [
      'discard',
      'discardTimelineMedia',
      { discarded_file_names: ['image.png'], retained_file_names: [] },
    ],
  ])('%sハンドラをv1のアダプタへ接続する', async (handlerName, adapterName, result) => {
    uploadAdapter[adapterName].mockResolvedValue({ result });
    const res = { json: jest.fn() };
    const next = jest.fn();

    await createUploadsController(io)[handlerName](request, res, next);

    expect(uploadAdapter[adapterName]).toHaveBeenCalledWith({
      body: request.body,
      files: request.files,
      jwtPayload: request.jwtPayload,
      io,
      params: request.params,
    });
    expect(res.json).toHaveBeenCalledWith(result);
    expect(next).not.toHaveBeenCalled();
  });
});
