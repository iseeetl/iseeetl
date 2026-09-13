const path = require('path');

// 実際のファイル操作やメディア変換を行わないよう、対象モジュールの読込前に依存先をモックする。
const unlinkMock = jest.fn(() => Promise.resolve());

jest.mock('fs', () => {
  return {
    promises: { unlink: jest.fn(() => Promise.resolve()) },
    unlink: jest.fn(),
  };
});

jest.mock('fluent-ffmpeg', () => {
  const ffmpegFn = jest.fn(() => {
    const handlers = {};
    const api = {
      _handlers: handlers,
      output: jest.fn(() => api),
      outputOptions: jest.fn(() => api),
      seekInput: jest.fn(() => api),
      audioCodec: jest.fn(() => api),
      audioBitrate: jest.fn(() => api),
      on: jest.fn((evt, cb) => {
        handlers[evt] = cb;
        return api;
      }),
      run: jest.fn(() => {}),
      screenshots: jest.fn(() => api),
    };
    ffmpegFn.__lastInstance = api;
    return api;
  });
  ffmpegFn.ffprobe = jest.fn((filePath, cb) => cb(null, { format: { duration: 1 } }));
  return ffmpegFn;
});

jest.mock('../../../models/Floor', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../../models/Room', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../../models/User', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../../models/FloorMember', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../../services/room/roomAccess.service', () => ({
  authorizeRoomAccess: jest.fn(),
}));
const mockSaveSanitizedImage = jest.fn();
jest.mock('../../../services/upload/imageStorage', () => ({
  saveSanitizedImage: mockSaveSanitizedImage,
}));
const mockDiscardTimelineMedia = jest.fn();
jest.mock('../../../services/media/discard.service', () => ({
  discardTimelineMedia: mockDiscardTimelineMedia,
}));

const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const User = require('../../../models/User');
const FloorMember = require('../../../models/FloorMember');
const { authorizeRoomAccess } = require('../../../services/room/roomAccess.service');
const { VIDEO_THUMB_LONG } = require('../../../constants/uploads');

const AppError = require('../../../utils/appError');
const uploadService = require('../../../services/upload.service');

const makeFile = (dir, name) => ({
  filename: name,
  path: path.join(dir, name),
});

describe('uploadのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.promises.unlink.mockImplementation(unlinkMock);
  });

  describe('プロフィール画像のアップロード', () => {
    test('無害化済みファイル名を返す', async () => {
      const file = { buffer: Buffer.from('image') };
      mockSaveSanitizedImage.mockResolvedValue({ filename: 'safe.png' });

      const result = await uploadService.uploadProfileImage({ image_file: [file] }, { user_id: 'u1' });

      expect(result).toEqual({ image_name: 'safe.png' });
      expect(mockSaveSanitizedImage).toHaveBeenCalledWith(
        expect.objectContaining({ file, segments: ['u1'], userId: 'u1' })
      );
    });

    test('ファイル無し -> AppError(400)', async () => {
      mockSaveSanitizedImage.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
      await expect(uploadService.uploadProfileImage({}, { user_id: 'u1' })).rejects.toHaveProperty('status', 400);
    });
  });

  describe('フロア画像のアップロード', () => {
    test('フロア作成者のフロア編集ユーザは画像を保存できる', async () => {
      const file = { buffer: Buffer.from('image') };
      User.findOne.mockResolvedValue({ _id: 'u1' });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'u1' });
      mockSaveSanitizedImage.mockResolvedValue({ filename: 'safe.jpg' });

      const result = await uploadService.uploadFloorImage(
        { _id: 'f1' },
        { image_file: [file] },
        { user_id: 'u1', user_role: 'Editor' }
      );

      expect(result).toEqual({ image_name: 'safe.jpg' });
      expect(Floor.findOne).toHaveBeenCalledWith({ _id: 'f1', delete_flg: false });
      expect(mockSaveSanitizedImage).toHaveBeenCalledWith(
        expect.objectContaining({ file, segments: ['f1'], userId: 'u1' })
      );
    });

    test('フロア無しなら画像を保存しない', async () => {
      User.findOne.mockResolvedValue({ _id: 'u1' });
      Floor.findOne.mockResolvedValue(null);

      await expect(
        uploadService.uploadFloorImage(
          { _id: 'fX' },
          { image_file: [{ buffer: Buffer.from('image') }] },
          { user_id: 'u1', user_role: 'Editor' }
        )
      ).rejects.toHaveProperty('status', 400);
      expect(mockSaveSanitizedImage).not.toHaveBeenCalled();
    });

    test('無関係なユーザは画像を保存できない', async () => {
      User.findOne.mockResolvedValue({ _id: 'u2' });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'u1' });

      await expect(
        uploadService.uploadFloorImage(
          { _id: 'f1' },
          { image_file: [{ buffer: Buffer.from('image') }] },
          { user_id: 'u2', user_role: 'Author' }
        )
      ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
      expect(mockSaveSanitizedImage).not.toHaveBeenCalled();
    });
  });

  describe('ルーム画像のアップロード', () => {
    test('フロア作成者のフロア編集ユーザは画像を保存できる', async () => {
      const file = { buffer: Buffer.from('image') };
      User.findOne.mockResolvedValue({ _id: 'u1' });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'u1', delete_flg: false });
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1', delete_flg: false });
      FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      mockSaveSanitizedImage.mockResolvedValue({ filename: 'safe.png' });

      const result = await uploadService.uploadRoomImage(
        { floor_id: 'f1', _id: 'r1' },
        { image_file: [file] },
        { user_id: 'u1', user_role: 'Editor' }
      );

      expect(result).toEqual({ image_name: 'safe.png' });
      expect(mockSaveSanitizedImage).toHaveBeenCalledWith(
        expect.objectContaining({ file, segments: ['f1', 'r1'], userId: 'u1' })
      );
    });

    test('フロア無し/Room無し/紐付不整合なら画像を保存しない', async () => {
      const file = { buffer: Buffer.from('image') };
      User.findOne.mockResolvedValue({ _id: 'u1' });
      Room.findOne.mockResolvedValue({ _id: 'r0', floor: 'f0' });
      Floor.findOne.mockResolvedValue(null);
      await expect(
        uploadService.uploadRoomImage(
          { floor_id: 'f0', _id: 'r0' },
          { image_file: [file] },
          { user_id: 'u1', user_role: 'Editor' }
        )
      ).rejects.toHaveProperty('status', 400);
      expect(mockSaveSanitizedImage).not.toHaveBeenCalled();

      jest.clearAllMocks();
      User.findOne.mockResolvedValue({ _id: 'u1' });
      Room.findOne.mockResolvedValue(null);
      await expect(
        uploadService.uploadRoomImage(
          { floor_id: 'f1', _id: 'rB' },
          { image_file: [file] },
          { user_id: 'u1', user_role: 'Editor' }
        )
      ).rejects.toHaveProperty('status', 400);
      expect(mockSaveSanitizedImage).not.toHaveBeenCalled();

      jest.clearAllMocks();
      User.findOne.mockResolvedValue({ _id: 'u1' });
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'fX' });
      Floor.findOne.mockResolvedValue({ _id: 'fX', user: 'u1' });
      await expect(
        uploadService.uploadRoomImage(
          { floor_id: 'f1', _id: 'r1' },
          { image_file: [file] },
          { user_id: 'u1', user_role: 'Editor' }
        )
      ).rejects.toHaveProperty('status', 400);
      expect(mockSaveSanitizedImage).not.toHaveBeenCalled();
    });

    test('フロアメンバーはルーム画像を保存できる', async () => {
      const file = { buffer: Buffer.from('image') };
      User.findOne.mockResolvedValue({ _id: 'u2' });
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1' });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'u1' });
      FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'fm1' }) });
      mockSaveSanitizedImage.mockResolvedValue({ filename: 'safe.png' });

      await expect(
        uploadService.uploadRoomImage(
          { floor_id: 'f1', _id: 'r1' },
          { image_file: [file] },
          { user_id: 'u2', user_role: 'Author' }
        )
      ).resolves.toEqual({ image_name: 'safe.png' });
      expect(mockSaveSanitizedImage).toHaveBeenCalledTimes(1);
    });

    test('フロア権限のないユーザはルーム画像を保存できない', async () => {
      User.findOne.mockResolvedValue({ _id: 'u2' });
      Room.findOne.mockResolvedValue({ _id: 'r1', floor: 'f1' });
      Floor.findOne.mockResolvedValue({ _id: 'f1', user: 'u1' });
      FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await expect(
        uploadService.uploadRoomImage(
          { floor_id: 'f1', _id: 'r1' },
          { image_file: [{ buffer: Buffer.from('image') }] },
          { user_id: 'u2', user_role: 'Author' }
        )
      ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
      expect(mockSaveSanitizedImage).not.toHaveBeenCalled();
    });
  });

  describe('タイムライン画像のアップロード', () => {
    test('認可後に無害化済み本体とサムネイルを保存する', async () => {
      authorizeRoomAccess.mockResolvedValue();
      const file = { buffer: Buffer.from('image') };
      mockSaveSanitizedImage.mockResolvedValue({
        filename: 'safe.jpg',
        thumbnailFilename: 'safe_thumbnail.jpg',
      });

      const result = await uploadService.uploadTimelineImage(
        { floor_id: 'f1', room_id: 'r1' },
        { image_file: [file] },
        { user_id: 'u1', user_role: 'member' }
      );

      expect(result).toEqual({
        image_name: 'safe.jpg',
        image_thumbnail_name: 'safe_thumbnail.jpg',
      });
      expect(authorizeRoomAccess).toHaveBeenCalledWith('u1', 'member', 'r1');
      expect(mockSaveSanitizedImage).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
          segments: ['f1', 'r1'],
          userId: 'u1',
          createThumbnail: true,
        })
      );
    });

    test('認可NGなら画像を保存しない', async () => {
      const error = new Error('forbidden');
      authorizeRoomAccess.mockRejectedValue(error);

      await expect(
        uploadService.uploadTimelineImage(
          { floor_id: 'f1', room_id: 'r1' },
          { image_file: [{ buffer: Buffer.from('image') }] },
          { user_id: 'uX', user_role: 'guest' }
        )
      ).rejects.toBe(error);
      expect(mockSaveSanitizedImage).not.toHaveBeenCalled();
    });

    test('無害化保存失敗を再送出する', async () => {
      authorizeRoomAccess.mockResolvedValue();
      mockSaveSanitizedImage.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));

      await expect(
        uploadService.uploadTimelineImage(
          { floor_id: 'f1', room_id: 'r1' },
          { image_file: [{ buffer: Buffer.from('invalid') }] },
          { user_id: 'u1', user_role: 'member' }
        )
      ).rejects.toHaveProperty('status', 400);
    });
  });

  describe('タイムライン動画のアップロード', () => {
    test('認可 OK・字幕なし・サムネイルを生成する', async () => {
      authorizeRoomAccess.mockResolvedValue();

      const video = makeFile('/dest', 'movie.mp4');

      const promise = uploadService.uploadTimelineVideo(
        { room_id: 'r1' },
        { video_file: [video] },
        { user_id: 'u1', user_role: 'member' }
      );

      setImmediate(() => {
        ffmpeg.__lastInstance._handlers.end && ffmpeg.__lastInstance._handlers.end();
      });

      const res = await promise;
      expect(res).toEqual({
        video_name: 'movie.mp4',
        video_thumbnail_name: 'movie.png',
        video_subtitle_name: null,
      });

      const destDir = path.dirname(video.path);
      expect(ffmpeg.__lastInstance.seekInput).toHaveBeenCalledWith(1);
      expect(ffmpeg.__lastInstance.outputOptions).toHaveBeenCalledWith(
        expect.arrayContaining(['-vframes', '1', '-vf', expect.any(String), '-sws_flags', 'lanczos'])
      );
      const outputOptions = ffmpeg.__lastInstance.outputOptions.mock.calls[0][0];
      const vfArg = outputOptions[outputOptions.indexOf('-vf') + 1];
      expect(vfArg).toContain(`scale=${VIDEO_THUMB_LONG}:${VIDEO_THUMB_LONG}:force_original_aspect_ratio=decrease`);
      expect(ffmpeg.__lastInstance.output).toHaveBeenCalledWith(path.join(destDir, 'movie.png'));

      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    test('字幕あり → そのままファイル名を返す', async () => {
      authorizeRoomAccess.mockResolvedValue();

      const video = makeFile('/dest', 'v.mp4');
      const sub = makeFile('/dest', 'v.vtt');

      const p = uploadService.uploadTimelineVideo(
        { room_id: 'r1' },
        { video_file: [video], video_subtitle_file: [sub] },
        { user_id: 'u1', user_role: 'member' }
      );

      setImmediate(() => {
        ffmpeg.__lastInstance._handlers.end && ffmpeg.__lastInstance._handlers.end();
      });

      const res = await p;
      expect(res.video_subtitle_name).toBe('v.vtt');
    });

    test('字幕だけを認可後に受理し、動画変換を行わない', async () => {
      authorizeRoomAccess.mockResolvedValue();
      const sub = makeFile('/dest', 'new.vtt');

      const res = await uploadService.uploadTimelineVideo(
        { room_id: 'r1' },
        { video_subtitle_file: [sub] },
        { user_id: 'u1', user_role: 'member' }
      );

      expect(authorizeRoomAccess).toHaveBeenCalledWith('u1', 'member', 'r1');
      expect(res).toEqual({
        video_name: null,
        video_thumbnail_name: null,
        video_subtitle_name: 'new.vtt',
      });
      expect(ffmpeg).not.toHaveBeenCalled();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    test('字幕だけの認可NGでは字幕を削除する', async () => {
      const authErr = new Error('forbidden');
      authorizeRoomAccess.mockRejectedValue(authErr);
      const sub = makeFile('/dest', 'denied.vtt');

      await expect(
        uploadService.uploadTimelineVideo(
          { room_id: 'r1' },
          { video_subtitle_file: [sub] },
          { user_id: 'uX', user_role: 'guest' }
        )
      ).rejects.toBe(authErr);

      expect(fs.promises.unlink).toHaveBeenCalledWith(sub.path);
      expect(ffmpeg).not.toHaveBeenCalled();
    });

    test('ffmpeg エラー -> 原本、字幕を削除し AppError(400)', async () => {
      authorizeRoomAccess.mockResolvedValue();

      const video = makeFile('/dest', 'bad.mp4');
      const sub = makeFile('/dest', 'bad.vtt');

      const p = uploadService.uploadTimelineVideo(
        { room_id: 'r1' },
        { video_file: [video], video_subtitle_file: [sub] },
        { user_id: 'u1', user_role: 'member' }
      );

      setImmediate(() => {
        ffmpeg.__lastInstance._handlers.error && ffmpeg.__lastInstance._handlers.error(new Error('ff'));
      });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 400);
      expect(fs.promises.unlink).toHaveBeenCalledWith(video.path);
      expect(fs.promises.unlink).toHaveBeenCalledWith(path.join('/dest', 'bad.png'));
      expect(fs.promises.unlink).toHaveBeenCalledWith(sub.path);
    });

    test('認可 NG -> 原本、字幕削除、エラー再送出', async () => {
      const authErr = new Error('forbidden');
      authorizeRoomAccess.mockRejectedValue(authErr);

      const video = makeFile('/dest', 'x.mp4');
      const sub = makeFile('/dest', 'x.vtt');

      await expect(
        uploadService.uploadTimelineVideo(
          { room_id: 'r1' },
          { video_file: [video], video_subtitle_file: [sub] },
          { user_id: 'uX', user_role: 'guest' }
        )
      ).rejects.toBe(authErr);

      expect(fs.promises.unlink).toHaveBeenCalledWith(video.path);
      expect(fs.promises.unlink).toHaveBeenCalledWith(path.join('/dest', 'x.png'));
      expect(fs.promises.unlink).toHaveBeenCalledWith(sub.path);
    });
  });

  describe('タイムライン音声のアップロード', () => {
    test('すでに mp3 の場合は変換せずそのまま返す', async () => {
      authorizeRoomAccess.mockResolvedValue();

      const audio = makeFile('/dest', 'voice.mp3');
      const res = await uploadService.uploadTimelineAudio(
        { room_id: 'r1' },
        { audio_file: [audio] },
        { user_id: 'u1', user_role: 'member' }
      );

      expect(res).toEqual({ audio_name: 'voice.mp3' });
      expect(ffmpeg).not.toHaveBeenCalled();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    test('非 mp3 -> ffmpeg で mp3 生成・原本は削除', async () => {
      authorizeRoomAccess.mockResolvedValue();

      const audio = makeFile('/dest', 'voice.wav');
      const p = uploadService.uploadTimelineAudio(
        { room_id: 'r1' },
        { audio_file: [audio] },
        { user_id: 'u1', user_role: 'member' }
      );

      setImmediate(() => {
        ffmpeg.__lastInstance._handlers.end && ffmpeg.__lastInstance._handlers.end();
      });

      const res = await p;
      expect(res).toEqual({ audio_name: 'voice.mp3' });

      const mp3Path = path.join(path.dirname(audio.path), 'voice.mp3');
      expect(ffmpeg.__lastInstance.output).toHaveBeenCalledWith(mp3Path);

      expect(fs.promises.unlink).toHaveBeenCalledWith(audio.path);
    });

    test('変換失敗 -> 生成途中 mp3 があれば削除し、原本も削除、AppError(500)', async () => {
      authorizeRoomAccess.mockResolvedValue();

      const audio = makeFile('/dest', 'bad.m4a');

      const p = uploadService.uploadTimelineAudio(
        { room_id: 'r1' },
        { audio_file: [audio] },
        { user_id: 'u1', user_role: 'member' }
      );

      setImmediate(() => {
        ffmpeg.__lastInstance._handlers.error && ffmpeg.__lastInstance._handlers.error(new Error('ff-error'));
      });

      await expect(p).rejects.toBeInstanceOf(AppError);
      await expect(p).rejects.toHaveProperty('status', 500);

      const mp3Path = path.join(path.dirname(audio.path), 'bad.mp3');
      expect(fs.promises.unlink).toHaveBeenCalledWith(mp3Path);
      expect(fs.promises.unlink).toHaveBeenCalledWith(audio.path);
    });

    test('認可 NG -> 原本を削除しエラー再送出', async () => {
      const err = new Error('forbidden');
      authorizeRoomAccess.mockRejectedValue(err);

      const audio = makeFile('/dest', 'voice.wav');
      await expect(
        uploadService.uploadTimelineAudio(
          { room_id: 'r1' },
          { audio_file: [audio] },
          { user_id: 'uX', user_role: 'guest' }
        )
      ).rejects.toBe(err);

      expect(fs.promises.unlink).toHaveBeenCalledWith(audio.path);
    });

    test('ファイル無し -> AppError(400)', async () => {
      await expect(
        uploadService.uploadTimelineAudio({ room_id: 'r1' }, {}, { user_id: 'u1', user_role: 'member' })
      ).rejects.toHaveProperty('status', 400);
    });
  });

  describe('タイムラインの未使用メディアの破棄', () => {
    test('未添付破棄サービスへ引数をそのまま渡す', async () => {
      const body = { floor_id: 'f1', room_id: 'r1', file_names: ['a.png'] };
      const jwtPayload = { user_id: 'u1', user_role: 'member' };
      const result = { discarded_file_names: ['a.png'], retained_file_names: [] };
      mockDiscardTimelineMedia.mockResolvedValue(result);

      await expect(uploadService.discardTimelineMedia(body, jwtPayload)).resolves.toEqual(result);
      expect(mockDiscardTimelineMedia).toHaveBeenCalledWith(body, jwtPayload);
    });
  });
});
