const mockMetadata = jest.fn();
const mockToBuffer = jest.fn();
const mockPipeline = {
  destroy: jest.fn(),
  jpeg: jest.fn(),
  metadata: mockMetadata,
  resize: jest.fn(),
  rotate: jest.fn(),
  toBuffer: mockToBuffer,
};
mockPipeline.rotate.mockReturnValue(mockPipeline);
mockPipeline.resize.mockReturnValue(mockPipeline);
mockPipeline.jpeg.mockReturnValue(mockPipeline);

const mockSharp = jest.fn(() => mockPipeline);
jest.mock('sharp', () => mockSharp);
jest.mock('../../../../services/analysis/provider.service', () => ({
  analyzeWithProvider: jest.fn(),
}));

const {
  IMAGE_MAX_EDGE,
  IMAGE_OUTPUT_MAX_BYTES,
  convertImageBufferForAnalysis,
  detectImageFormat,
} = require('../../../../services/analysis/image.service');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('fixture')]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fixture'),
]);

describe('AI解析用の画像変換', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPipeline.rotate.mockReturnValue(mockPipeline);
    mockPipeline.resize.mockReturnValue(mockPipeline);
    mockPipeline.jpeg.mockReturnValue(mockPipeline);
    mockMetadata.mockResolvedValue({ format: 'png', pages: 1, width: 1000, height: 500 });
    mockToBuffer.mockResolvedValue(Buffer.from('sanitized-jpeg'));
  });

  test('JPEGとPNGの識別情報だけを受け付ける', () => {
    expect(detectImageFormat(JPEG)).toBe('jpeg');
    expect(detectImageFormat(PNG)).toBe('png');
    expect(detectImageFormat(Buffer.from('not-image'))).toBeNull();
  });

  test('静止JPEG/PNGをメタデータなし・最大512pxのJPEGへ変換する', async () => {
    await expect(convertImageBufferForAnalysis(PNG)).resolves.toEqual(Buffer.from('sanitized-jpeg'));
    expect(mockSharp).toHaveBeenCalledWith(
      PNG,
      expect.objectContaining({ animated: true, failOn: 'error' })
    );
    expect(mockPipeline.rotate).toHaveBeenCalled();
    expect(mockPipeline.resize).toHaveBeenCalledWith({
      width: IMAGE_MAX_EDGE,
      height: IMAGE_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
    expect(mockPipeline.jpeg).toHaveBeenCalledWith({ quality: 85, progressive: false });
    expect(mockPipeline).not.toHaveProperty('withMetadata');
  });

  test('ファイルの識別情報と復号した形式の不一致や複数フレームを拒否する', async () => {
    mockMetadata.mockResolvedValueOnce({ format: 'jpeg', pages: 1, width: 1, height: 1 });
    await expect(convertImageBufferForAnalysis(PNG)).rejects.toMatchObject({
      code: 'AI_ANALYSIS_IMAGE_INVALID',
    });

    mockMetadata.mockResolvedValueOnce({ format: 'png', pages: 2, width: 1, height: 1 });
    await expect(convertImageBufferForAnalysis(PNG)).rejects.toMatchObject({
      code: 'AI_ANALYSIS_IMAGE_INVALID',
    });
  });

  test('1MiB以下になる画質を採用し、収まらなければ拒否する', async () => {
    mockToBuffer.mockResolvedValue(Buffer.alloc(IMAGE_OUTPUT_MAX_BYTES + 1));
    await expect(convertImageBufferForAnalysis(PNG)).rejects.toMatchObject({
      code: 'AI_ANALYSIS_IMAGE_OUTPUT_TOO_LARGE',
    });
    expect(mockPipeline.jpeg).toHaveBeenCalledTimes(4);
  });

  test('AbortSignalを変換へ伝播する', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      convertImageBufferForAnalysis(PNG, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(mockToBuffer).not.toHaveBeenCalled();
  });

  test('メタデータ処理中に中断されたらsharpの変換処理を破棄してAbortErrorを返す', async () => {
    let rejectMetadata;
    mockMetadata.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectMetadata = reject;
        })
    );
    mockPipeline.destroy.mockImplementationOnce(() => rejectMetadata(new Error('destroyed')));
    const controller = new AbortController();
    const result = convertImageBufferForAnalysis(PNG, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(mockPipeline.destroy).toHaveBeenCalledTimes(1);
    expect(mockToBuffer).not.toHaveBeenCalled();
  });
});
