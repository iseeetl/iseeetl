const path = require('path');

describe('アップロードの受信処理', () => {
  const ORIGINAL_ENV = process.env;
  const VALID_IDS = {
    user: '507f1f77bcf86cd799439011',
    floor: '507f1f77bcf86cd799439012',
    room: '507f1f77bcf86cd799439013',
  };

  const loadWithMocks = (env = { PROFILE_PATH: '/profiles/', MEDIA_PATH: '/media/' }) => {
    jest.resetModules();

    // uploaders.jsの読込時に設定が確定するため、先に環境変数を設定する。
    process.env = { ...ORIGINAL_ENV, ...env };

    const mockFs = {
      existsSync: jest.fn(),
      mkdirSync: jest.fn(),
    };
    jest.doMock('fs', () => mockFs);

    const mockMulter = jest.fn((options) => {
      const inst = {
        options,
        fields: jest.fn((defs) => {
          inst.fieldsArgs = defs;
          // multer.fieldsの戻り値に合わせ、次の処理へ進むミドルウェアを返す。
          return (_req, _res, next) => next && next();
        }),
      };
      mockMulter.__instances.push(inst);
      return inst;
    });
    mockMulter.__instances = [];
    mockMulter.diskStorage = jest.fn((cfg) => cfg);
    mockMulter.memoryStorage = jest.fn(() => ({ type: 'memory' }));
    jest.doMock('multer', () => mockMulter);

    const uploaders = require('../../../middlewares/uploaders');
    return { uploaders, mockMulter, mockFs };
  };

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('画像を公開領域へ保存せずメモリへ受信する', () => {
    const { mockMulter, mockFs } = loadWithMocks({ MEDIA_PATH: '/media/' });
    const memoryStorage = mockMulter.memoryStorage.mock.results[0].value;

    expect(mockMulter.memoryStorage).toHaveBeenCalledTimes(1);
    [0, 1, 2, 3].forEach((index) => {
      const inst = mockMulter.__instances[index];
      expect(inst.options.storage).toBe(memoryStorage);
      expect(inst.options.limits.fileSize).toBe(3 * 1024 * 1024);
      expect(inst.fieldsArgs).toEqual([{ name: 'image_file', maxCount: 1 }]);
    });
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  test('画像の申告MIMEタイプによる事前検証を適用する', () => {
    const { mockMulter } = loadWithMocks();
    const { fileFilter } = mockMulter.__instances[0].options;
    const fcb = jest.fn();
    fileFilter({}, { mimetype: 'image/jpeg' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, true);
    fileFilter({}, { mimetype: 'image/gif' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, false);
  });

  test('音声のMIMEタイプにコーデック情報が付いていても受け付ける', () => {
    const { mockMulter } = loadWithMocks({ MEDIA_PATH: '/media/' });
    const inst = mockMulter.__instances[4];
    const { storage, fileFilter, limits } = inst.options;

    const fcb = jest.fn();
    fileFilter({}, { mimetype: 'audio/webm; codecs=opus' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, true);

    fileFilter({}, { mimetype: 'application/octet-stream' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, false);

    expect(limits.fileSize).toBe(6 * 1024 * 1024);
    expect(limits).toEqual(expect.objectContaining({ files: 1, fields: 2, parts: 4 }));
    expect(inst.fieldsArgs).toEqual([{ name: 'audio_file', maxCount: 1 }]);

    const spyNow = jest.spyOn(Date, 'now').mockReturnValue(1712345678901);
    const filenameCallback = jest.fn();
    storage.filename(
      { jwtPayload: { user_id: VALID_IDS.user } },
      { originalname: 'VOICE.MP3' },
      filenameCallback
    );
    expect(filenameCallback).toHaveBeenCalledWith(
      null,
      expect.stringMatching(new RegExp(`^1712345678901\\d+_${VALID_IDS.user}\\.mp3$`))
    );
    spyNow.mockRestore();
  });

  test('動画と字幕のMIMEタイプ・受信項目・上限を設定する', () => {
    const { mockMulter } = loadWithMocks({ MEDIA_PATH: '/media/' });
    const inst = mockMulter.__instances[5];
    const { fileFilter, limits } = inst.options;

    const fcb = jest.fn();

    fileFilter({}, { fieldname: 'video_file', mimetype: 'video/mp4', originalname: 'clip.mp4' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, true);

    fileFilter({}, { fieldname: 'video_file', mimetype: 'video/mp4', originalname: 'clip.mkv' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, false);

    fileFilter({}, { fieldname: 'video_subtitle_file', mimetype: 'text/vtt', originalname: 'SUB.VTT' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, true);

    fileFilter(
      {},
      { fieldname: 'video_subtitle_file', mimetype: 'application/x-subrip', originalname: 'sub.srt' },
      fcb
    );
    expect(fcb).toHaveBeenCalledWith(null, true);

    fileFilter({}, { fieldname: 'video_subtitle_file', mimetype: 'text/vtt', originalname: 'sub.txt' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, false);

    fileFilter({}, { fieldname: 'other', mimetype: 'video/mp4', originalname: 'x.mp4' }, fcb);
    expect(fcb).toHaveBeenCalledWith(null, false);

    expect(inst.fieldsArgs).toEqual([
      { name: 'video_file', maxCount: 1 },
      { name: 'video_subtitle_file', maxCount: 1 },
    ]);
    expect(limits.fileSize).toBe(150 * 1024 * 1024);
    expect(limits).toEqual(expect.objectContaining({ files: 2, fields: 2, parts: 5 }));
  });

  test('destination: ObjectId でない ID は INVALID_PARAMS で拒否される', () => {
    const { mockMulter, mockFs } = loadWithMocks({ MEDIA_PATH: '/media/' });
    const inst = mockMulter.__instances[4];
    const { storage } = inst.options;

    const cb = jest.fn();
    storage.destination(
      { uploadTarget: { floorId: '../../tmp', roomId: VALID_IDS.room } },
      { originalname: 'a.mp3' },
      cb
    );

    const err = cb.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.code).toBe('INVALID_PARAMS');
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  test('destination: 認可済みuploadTargetだけから保存先を決定する', () => {
    const { mockMulter, mockFs } = loadWithMocks({ MEDIA_PATH: '/media/' });
    const inst = mockMulter.__instances[4];
    const cb = jest.fn();

    inst.options.storage.destination(
      {
        uploadTarget: { floorId: VALID_IDS.floor, roomId: VALID_IDS.room },
        body: { floor_id: '../../outside', room_id: '../../outside' },
      },
      { originalname: 'a.mp3' },
      cb
    );

    expect(cb).toHaveBeenCalledWith(null, path.join('/media', VALID_IDS.floor, VALID_IDS.room));
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(path.join('/media', VALID_IDS.floor, VALID_IDS.room), {
      recursive: true,
    });
  });

  test('filename: JWT user_id が不正なら INVALID_PARAMS で拒否される', () => {
    const { mockMulter } = loadWithMocks();
    const inst = mockMulter.__instances[4];
    const { storage } = inst.options;

    const cb = jest.fn();
    storage.filename({ jwtPayload: { user_id: 'bad-user-id' } }, { originalname: 'a.mp3' }, cb);
    const err = cb.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.code).toBe('INVALID_PARAMS');
  });
});
