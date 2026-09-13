jest.mock('../../../../../services/media/fileCleanup', () => ({
  deleteMediaDiff: jest.fn(),
}));

const { deleteMediaDiff } = require('../../../../../services/media/fileCleanup');
const {
  buildMediaStateFromItem,
  cleanupReplacedMedia,
} = require('../../../../../services/timeline/shared/timelineMediaLifecycle');

describe('タイムラインのメディア管理', () => {
  test('timeline 項目を共通メディア状態へ変換する', () => {
    expect(buildMediaStateFromItem({
      image_name: 'image.png',
      image_thumbnail_name: 'image_thumb.png',
      video_name: 'video.mp4',
      video_thumbnail_name: 'video_thumb.png',
      video_subtitle_name: 'video.vtt',
      audio_name: 'audio.mp3',
    })).toEqual({
      image: { main: 'image.png', thumb: 'image_thumb.png' },
      video: { main: 'video.mp4', thumb: 'video_thumb.png', subtitle: 'video.vtt' },
      audio: { main: 'audio.mp3' },
    });
  });

  test('変更前後のメディア情報を削除処理用の形式へ変換する', async () => {
    deleteMediaDiff.mockResolvedValue();

    await cleanupReplacedMedia({
      floorId: { toString: () => 'floor-1' },
      roomId: 'room-1',
      oldItem: { image_name: 'old.png' },
      newItem: { image_name: 'new.png' },
    });

    expect(deleteMediaDiff).toHaveBeenCalledWith({
      floorId: 'floor-1',
      roomId: 'room-1',
      oldMedia: expect.objectContaining({ image: { main: 'old.png' } }),
      newMedia: expect.objectContaining({ image: { main: 'new.png' } }),
    });
  });
});
