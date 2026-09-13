const uploadConstant = require('../../../constants/uploads');

describe('アップロードの容量と形式の定義', () => {
  test('画像・動画・音声・字幕の容量上限が定義値と一致する', () => {
    expect(uploadConstant.IMAGE_LIMIT).toBe(3 * 1024 * 1024);
    expect(uploadConstant.VIDEO_LIMIT).toBe(150 * 1024 * 1024);
    expect(uploadConstant.AUDIO_LIMIT).toBe(6 * 1024 * 1024);
    expect(uploadConstant.SUBTITLE_LIMIT).toBe(2 * 1024 * 1024);
  });

  test('MIME と拡張子が定義されている', () => {
    expect(uploadConstant.IMAGE_MIME_TYPES).toContain('image/png');
    expect(uploadConstant.IMAGE_MIME_TYPES).toContain('image/jpeg');

    expect(uploadConstant.VIDEO_MIME_TYPES).toContain('video/mp4');
    expect(uploadConstant.VIDEO_MIME_TYPES).toContain('application/octet-stream');
    expect(uploadConstant.VIDEO_EXTENSIONS).toContain('.mp4');
    expect(uploadConstant.VIDEO_EXTENSIONS).toContain('.mov');

    expect(uploadConstant.SUBTITLE_MIME_TYPES).toContain('text/vtt');
    expect(uploadConstant.SUBTITLE_EXTENSIONS).toContain('.vtt');

    expect(uploadConstant.AUDIO_MIME_TYPES).toContain('audio/mp3');
    expect(uploadConstant.AUDIO_MIME_TYPES).toContain('audio/mpeg');
  });
});
