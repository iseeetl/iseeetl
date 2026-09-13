jest.mock('../../../../services/media/reference', () => ({
  isMediaFileReferenced: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('fs', () => {
  const mockAccess = jest.fn();
  const mockUnlink = jest.fn();
  return {
    __esModule: true,
    promises: { access: mockAccess, unlink: mockUnlink },
    mockAccess,
    mockUnlink,
  };
});

const path = require('path');
const fs = require('fs');
const { isMediaFileReferenced } = require('../../../../services/media/reference');
const { deleteFileIfExists, deleteFiles, deleteMediaDiff, deleteMediaItem } = require('../../../../services/media/fileCleanup');

describe('fileCleanerの検証', () => {
  const { mockAccess, mockUnlink } = fs;

  const MEDIA_PATH = '/tmp/media/';
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    isMediaFileReferenced.mockResolvedValue(false);
    process.env = { ...ORIGINAL_ENV, MEDIA_PATH };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('存在するファイルの削除', () => {
    const target = '/some/file.png';

    test('ファイルが存在する場合に unlink される', async () => {
      mockAccess.mockResolvedValue();
      mockUnlink.mockResolvedValue();

      await deleteFileIfExists(target);

      expect(mockAccess).toHaveBeenCalledWith(target);
      expect(mockUnlink).toHaveBeenCalledWith(target);
    });

    test('ファイルが存在しない (ENOENT) 場合は何もしない', async () => {
      mockAccess.mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' }));

      await expect(deleteFileIfExists(target)).resolves.toBeUndefined();
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    test('それ以外のエラーは console.error を呼ぶ', async () => {
      const spyConsole = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockAccess.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

      await deleteFileIfExists(target);

      expect(spyConsole).toHaveBeenCalled();
      spyConsole.mockRestore();
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('複数ファイルの削除', () => {
    test('空文字や null を除外し、unlink が 2 回呼ばれる', async () => {
      mockAccess.mockResolvedValue();
      mockUnlink.mockResolvedValue();

      const baseDir = '/base';
      const files = ['a.jpg', '', null, 'b.png'];

      await deleteFiles(baseDir, files);

      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'a.jpg'));
      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'b.png'));
    });

    test('他レコードまたはルーム画像から参照中のファイルは削除しない', async () => {
      mockAccess.mockResolvedValue();
      isMediaFileReferenced.mockResolvedValue(true);

      await deleteFiles(`${MEDIA_PATH}f1/r1`, ['shared.jpg']);

      expect(isMediaFileReferenced).toHaveBeenCalledWith({ roomId: 'r1', fileName: 'shared.jpg' });
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    test('参照確認に失敗した場合は安全側として削除しない', async () => {
      const spyConsole = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockAccess.mockResolvedValue();
      isMediaFileReferenced.mockRejectedValue(new Error('db failed'));

      await deleteFiles(`${MEDIA_PATH}f1/r1`, ['keep.jpg']);

      expect(mockUnlink).not.toHaveBeenCalled();
      expect(spyConsole).toHaveBeenCalled();
      spyConsole.mockRestore();
    });

    test('baseDir外を指すファイル名は削除しない', async () => {
      const spyConsole = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockAccess.mockResolvedValue();

      await deleteFiles('/base', ['../outside.jpg']);

      expect(mockAccess).not.toHaveBeenCalled();
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(spyConsole).toHaveBeenCalled();
      spyConsole.mockRestore();
    });
  });

  describe('変更前のメディア削除', () => {
    const floorId = 'f1';
    const roomId = 'r1';
    const baseDir = `${MEDIA_PATH}${floorId}/${roomId}`;

    beforeEach(() => {
      mockAccess.mockResolvedValue();
      mockUnlink.mockResolvedValue();
    });

    test('画像が変更された場合、旧画像とサムネイルを削除', async () => {
      const oldMedia = { image: { main: 'old.jpg', thumb: 'old_t.jpg' } };
      const newMedia = { image: { main: 'new.jpg', thumb: 'new_t.jpg' } };

      await deleteMediaDiff({ floorId, roomId, oldMedia, newMedia });

      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'old.jpg'));
      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'old_t.jpg'));
    });

    test('動画・音声の差分にも対応', async () => {
      const oldMedia = {
        video: { main: 'old.mp4', thumb: 'old_t.jpg', subtitle: 'old.vtt' },
        audio: { main: 'old.mp3' },
      };
      const newMedia = {
        video: { main: 'new.mp4', thumb: 'new_t.jpg', subtitle: 'new.vtt' },
        audio: { main: 'new.mp3' },
      };

      await deleteMediaDiff({ floorId, roomId, oldMedia, newMedia });

      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'old.mp4'));
      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'old_t.jpg'));
      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'old.vtt'));
      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'old.mp3'));
      expect(mockUnlink).toHaveBeenCalledTimes(4);
    });

    test('動画本体が同じでも字幕が変われば旧字幕だけを削除', async () => {
      const oldMedia = {
        video: { main: 'same.mp4', thumb: 'same.png', subtitle: 'old.vtt' },
      };
      const newMedia = {
        video: { main: 'same.mp4', thumb: 'same.png', subtitle: 'new.vtt' },
      };

      await deleteMediaDiff({ floorId, roomId, oldMedia, newMedia });

      expect(mockUnlink).toHaveBeenCalledTimes(1);
      expect(mockUnlink).toHaveBeenCalledWith(path.resolve(baseDir, 'old.vtt'));
      expect(mockUnlink).not.toHaveBeenCalledWith(path.resolve(baseDir, 'same.mp4'));
    });

    test('変更が無い場合は unlink を呼ばない', async () => {
      const same = { image: { main: 'same.jpg' } };
      await deleteMediaDiff({ floorId, roomId, oldMedia: same, newMedia: same });
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('対象メディアの一括削除', () => {
    beforeEach(() => {
      mockAccess.mockResolvedValue();
      mockUnlink.mockResolvedValue();
    });

    test('項目内のメディアファイルをまとめて削除', async () => {
      const baseDir = '/item-base';
      const item = {
        image_name: 'i.jpg',
        image_thumbnail_name: 'i_t.jpg',
        video_name: 'v.mp4',
        video_thumbnail_name: 'v_t.jpg',
        video_subtitle_name: 'v.vtt',
        audio_name: 'a.mp3',
      };

      await deleteMediaItem(baseDir, item);

      const expected = ['i.jpg', 'i_t.jpg', 'v.mp4', 'v_t.jpg', 'v.vtt', 'a.mp3'].map((f) => path.resolve(baseDir, f));

      expect(mockUnlink.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(expected));
      expect(mockUnlink).toHaveBeenCalledTimes(expected.length);
    });

    test('項目が null の場合は unlink を呼ばない', async () => {
      await deleteMediaItem('/dir', null);
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });
});
