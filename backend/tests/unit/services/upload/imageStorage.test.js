const path = require('path');

const mockMkdir = jest.fn(() => Promise.resolve());
const mockWriteFile = jest.fn(() => Promise.resolve());
const mockUnlink = jest.fn(() => Promise.resolve());

jest.mock('fs', () => ({
  promises: { mkdir: mockMkdir, writeFile: mockWriteFile, unlink: mockUnlink },
}));

let mockMetadata = { format: 'png', width: 1, height: 1 };
const mockOutputBuffer = Buffer.from('sanitized');
const mockSharp = jest.fn(() => {
  const pipeline = {
    metadata: jest.fn(() => Promise.resolve(mockMetadata)),
    rotate: jest.fn(() => pipeline),
    jpeg: jest.fn(() => pipeline),
    png: jest.fn(() => pipeline),
    resize: jest.fn(() => pipeline),
    toBuffer: jest.fn(() => Promise.resolve(mockOutputBuffer)),
  };
  mockSharp.instances.push(pipeline);
  return pipeline;
});
mockSharp.instances = [];
jest.mock('sharp', () => mockSharp);

const AppError = require('../../../../utils/appError');
const { IMAGE_MAX_PIXELS } = require('../../../../constants/uploads');
const imageStorage = require('../../../../services/upload/imageStorage');

const PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png-body'),
]);
const JPEG_BUFFER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('jpeg-body')]);
const USER_ID = '507f1f77bcf86cd799439011';
const FLOOR_ID = '507f1f77bcf86cd799439012';
const BASE_DIR = '/test-fixtures/images';

describe('imageStorageの検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSharp.instances = [];
    mockMetadata = { format: 'png', width: 1, height: 1 };
    mockMkdir.mockResolvedValue();
    mockWriteFile.mockResolvedValue();
    mockUnlink.mockResolvedValue();
  });

  test('PNG/JPEG署名だけを画像候補として識別する', () => {
    expect(imageStorage.detectImageFormat(PNG_BUFFER)).toBe('png');
    expect(imageStorage.detectImageFormat(JPEG_BUFFER)).toBe('jpeg');
    expect(imageStorage.detectImageFormat(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });

  test('HTML内容は申告MIMEや元拡張子に関係なく拒否する', async () => {
    await expect(
      imageStorage.sanitizeImage({
        buffer: Buffer.from('<!doctype html><script>alert(1)</script>'),
        mimetype: 'image/png',
        originalname: 'attack.html',
      })
    ).rejects.toEqual(expect.any(AppError));
    expect(mockSharp).not.toHaveBeenCalled();
  });

  test('PNGをデコード確認して再エンコードする', async () => {
    const result = await imageStorage.sanitizeImage({ buffer: PNG_BUFFER });

    expect(result).toEqual({ buffer: mockOutputBuffer, extension: '.png', format: 'png' });
    expect(mockSharp).toHaveBeenCalledWith(
      PNG_BUFFER,
      expect.objectContaining({ failOn: 'error', limitInputPixels: IMAGE_MAX_PIXELS })
    );
    expect(mockSharp.instances[1].rotate).toHaveBeenCalled();
    expect(mockSharp.instances[1].png).toHaveBeenCalledWith({ compressionLevel: 9 });
  });

  test('JPEGをデコード確認して.jpgへ再エンコードする', async () => {
    mockMetadata = { format: 'jpeg', width: 1, height: 1 };

    const result = await imageStorage.sanitizeImage({ buffer: JPEG_BUFFER });

    expect(result).toEqual({ buffer: mockOutputBuffer, extension: '.jpg', format: 'jpeg' });
    expect(mockSharp.instances[1].jpeg).toHaveBeenCalledWith({ quality: 90 });
  });

  test('署名とデコーダ結果が一致しない画像を拒否する', async () => {
    mockMetadata = { format: 'jpeg', width: 1, height: 1 };
    await expect(imageStorage.sanitizeImage({ buffer: PNG_BUFFER })).rejects.toHaveProperty('status', 400);
  });

  test('保存先構成要素がObjectIdでない場合は拒否する', () => {
    expect(() => imageStorage.resolveSafeImageDir(BASE_DIR, ['../outside'])).toThrow(AppError);
  });

  test('元拡張子を無視し、再エンコード形式のサーバ生成名で保存する', async () => {
    const result = await imageStorage.saveSanitizedImage({
      file: { buffer: PNG_BUFFER, originalname: 'attack.html', mimetype: 'image/png' },
      baseDir: BASE_DIR,
      segments: [FLOOR_ID],
      userId: USER_ID,
    });

    expect(result.filename).toMatch(new RegExp(`^\\d+_${USER_ID}\\.png$`));
    expect(result.filename).not.toContain('.html');
    expect(mockMkdir).toHaveBeenCalledWith(path.join(BASE_DIR, FLOOR_ID), { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(result.path, mockOutputBuffer, { flag: 'wx' });
  });

  test('サムネイルも安全な同一形式で生成して排他的に保存する', async () => {
    const result = await imageStorage.saveSanitizedImage({
      file: { buffer: PNG_BUFFER },
      baseDir: BASE_DIR,
      segments: [FLOOR_ID],
      userId: USER_ID,
      createThumbnail: true,
    });

    expect(result.thumbnailFilename).toMatch(/_thumbnail\.png$/);
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockSharp.instances[2].resize).toHaveBeenCalledWith({
      width: 400, height: 400, fit: 'inside', withoutEnlargement: true,
    });
  });

  test('保存途中で失敗した場合は本体とサムネイルを削除する', async () => {
    mockWriteFile.mockResolvedValueOnce().mockRejectedValueOnce(new Error('write failed'));

    await expect(
      imageStorage.saveSanitizedImage({
        file: { buffer: PNG_BUFFER },
        baseDir: BASE_DIR,
        segments: [FLOOR_ID],
        userId: USER_ID,
        createThumbnail: true,
      })
    ).rejects.toThrow('write failed');
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });
});
