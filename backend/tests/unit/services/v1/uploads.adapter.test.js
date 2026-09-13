const uploadService = require('../../../../services/upload.service');
const uploadAdapter = require('../../../../services/v1/uploads.adapter');

jest.mock('../../../../services/upload.service', () => ({
  discardTimelineMedia: jest.fn(),
  uploadTimelineAudio: jest.fn(),
  uploadTimelineImage: jest.fn(),
  uploadTimelineVideo: jest.fn(),
}));

describe('uploads.adapterの検証', () => {
  const body = {
    floor_id: '507f1f77bcf86cd799439012',
    room_id: '507f1f77bcf86cd799439013',
  };
  const jwtPayload = {
    user_id: '507f1f77bcf86cd799439011',
    user_role: 'developer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    [
      '画像',
      'storeImage',
      'uploadTimelineImage',
      { image_file: [{ buffer: Buffer.from('image') }] },
      { image_name: 'image.png', image_thumbnail_name: 'image_thumbnail.png' },
    ],
    [
      '動画',
      'storeVideo',
      'uploadTimelineVideo',
      { video_file: [{ filename: 'video.mp4', path: '/media/video.mp4' }] },
      {
        video_name: 'video.mp4',
        video_thumbnail_name: 'video.png',
        video_subtitle_name: null,
      },
    ],
    [
      '音声',
      'storeAudio',
      'uploadTimelineAudio',
      { audio_file: [{ filename: 'audio.mp3', path: '/media/audio.mp3' }] },
      { audio_name: 'audio.mp3' },
    ],
  ])('%suploadを通常APIサービスへ委譲し、v1 ハンドラ形式で返す', async (_label, adapterName, serviceName, files, result) => {
    uploadService[serviceName].mockResolvedValue(result);

    await expect(uploadAdapter[adapterName]({ body, files, jwtPayload })).resolves.toEqual({
      result,
    });
    expect(uploadService[serviceName]).toHaveBeenCalledWith(body, files, jwtPayload);
  });

  test('未添付メディア破棄を通常APIサービスへ委譲する', async () => {
    const discardBody = {
      ...body,
      file_names: ['1700000000000_507f1f77bcf86cd799439011.png'],
    };
    const result = {
      discarded_file_names: discardBody.file_names,
      retained_file_names: [],
    };
    uploadService.discardTimelineMedia.mockResolvedValue(result);

    await expect(
      uploadAdapter.discardTimelineMedia({ body: discardBody, jwtPayload })
    ).resolves.toEqual({ result });
    expect(uploadService.discardTimelineMedia).toHaveBeenCalledWith(discardBody, jwtPayload);
  });

  test('通常APIサービスのエラーを変換せずコントローラ境界へ渡す', async () => {
    const error = new Error('upload failed');
    uploadService.uploadTimelineImage.mockRejectedValue(error);

    await expect(
      uploadAdapter.storeImage({ body, files: {}, jwtPayload })
    ).rejects.toBe(error);
  });
});
