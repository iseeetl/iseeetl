import { expect } from 'vitest';
import uploadApi from '@/api/upload';
import { collectMediaFileNames, discardUnattachedTimelineMedia } from '@/features/timeline/mediaCleanup';

describe('タイムラインの未添付メディアの破棄', () => {
  let originalDiscard;

  beforeEach(() => {
    originalDiscard = uploadApi.discardTimelineMedia;
  });

  afterEach(() => {
    uploadApi.discardTimelineMedia = originalDiscard;
  });

  it('空値と重複を除いてメディア名を収集する', () => {
    expect(
      collectMediaFileNames({
        imageName: 'image.png',
        imageThumbnailName: 'thumb.png',
        videoName: null,
        videoThumbnailName: '',
        videoSubtitleName: 'image.png',
        audioName: 'audio.mp3',
      })
    ).to.deep.equal(['image.png', 'thumb.png', 'audio.mp3']);
  });

  it('ルームとファイル名を破棄APIへ渡す', async () => {
    const calls = [];
    uploadApi.discardTimelineMedia = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };

    await discardUnattachedTimelineMedia({
      roomId: 'room-1',
      media: { imageName: 'image.png', imageThumbnailName: 'thumb.png' },
    });

    expect(calls).to.deep.equal([
      {
        room_id: 'room-1',
        file_names: ['image.png', 'thumb.png'],
      },
    ]);
  });

  it('破棄API失敗は元の投稿保存エラーを上書きしない', async () => {
    uploadApi.discardTimelineMedia = () => Promise.reject(new Error('cleanup failed'));

    let rejected = false;
    await discardUnattachedTimelineMedia({
      roomId: 'room-1',
      media: { audioName: 'audio.mp3' },
    }).catch(() => {
      rejected = true;
    });

    expect(rejected).to.equal(false);
  });
});
