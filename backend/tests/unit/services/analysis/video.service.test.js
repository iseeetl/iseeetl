const fs = require('fs');
const path = require('path');

const { createTestRuntime } = require('../../../_helpers/testRuntime');

jest.mock('fluent-ffmpeg', () => jest.fn());
jest.mock('../../../../services/analysis/provider.service', () => ({
  analyzeWithProvider: jest.fn(),
}));
jest.mock('../../../../services/analysis/image.service', () => ({
  convertImageBufferForAnalysis: jest.fn(),
}));
jest.mock('../../../../services/analysis/ffmpegRunner', () => ({
  probeMediaFile: jest.fn(),
  runFfmpegCommand: jest.fn(),
}));

const {
  VIDEO_MAX_DURATION_SECONDS,
  readEbmlDocType,
  readIsoBmffBrands,
  validateVideoProbe,
} = require('../../../../services/analysis/video.service');

const runtime = createTestRuntime('backend/analysis-video-service');

const video = (codecName, extra = {}) => ({ codec_type: 'video', codec_name: codecName, ...extra });
const audio = (codecName) => ({ codec_type: 'audio', codec_name: codecName });
const probe = ({ formatName, duration = 30, streams }) => ({
  format: {
    format_name: formatName,
    format_long_name: formatName.includes('webm') ? 'Matroska / WebM' : 'QuickTime / MOV',
    duration,
    ...(formatName.includes('webm') ? { tags: { doc_type: 'webm' } } : {}),
  },
  ...(formatName.includes('webm') ? { ebmlDocType: 'webm' } : {}),
  ...(formatName.includes('mov') || formatName.includes('mp4')
    ? { isoBmffBrands: { majorBrand: 'isom', compatibleBrands: ['isom', 'iso2', 'avc1', 'mp41'] } }
    : {}),
  streams,
});

const ftypBox = (majorBrand, compatibleBrands = []) => {
  const size = 16 + compatibleBrands.length * 4;
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32BE(size, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write(majorBrand, 8, 'ascii');
  buffer.writeUInt32BE(0, 12);
  compatibleBrands.forEach((brand, index) => buffer.write(brand, 16 + index * 4, 'ascii'));
  return buffer;
};

describe('AI解析用の動画検証', () => {
  afterEach(async () => {
    await runtime.removeDirSafe(runtime.testRuntimePath());
  });

  test.each([
    ['mov,mp4,m4a,3gp,3g2,mj2', [video('h264')]],
    ['mov,mp4,m4a,3gp,3g2,mj2', [video('h264'), audio('aac')]],
    ['mov,mp4,m4a,3gp,3g2,mj2', [video('h264'), audio('mp3')]],
    ['matroska,webm', [video('vp8')]],
    ['matroska,webm', [video('vp9'), audio('opus')]],
    ['matroska,webm', [video('vp9'), audio('vorbis')]],
  ])('許可されたコンテナとコーデックの組み合わせを受け付ける: %s', (formatName, streams) => {
    expect(validateVideoProbe(probe({ formatName, streams }))).toMatchObject({
      audioStreamCount: streams.filter((stream) => stream.codec_type === 'audio').length,
      duration: 30,
      skip: false,
    });
  });

  test.each([
    ['mov,mp4', [video('vp9')]],
    ['mov,mp4', [video('h264'), audio('opus')]],
    ['matroska,webm', [video('h264')]],
    ['matroska,webm', [video('vp9'), audio('aac')]],
    ['avi', [video('h264')]],
  ])('許可されていないコンテナとコーデックの組み合わせを拒否する: %s', (formatName, streams) => {
    expect(() => validateVideoProbe(probe({ formatName, streams }))).toThrow(
      expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' })
    );
  });

  test.each([
    ['mov,mp4', 'h264', { codec_type: 'audio' }],
    ['mov,mp4', 'h264', audio('')],
    ['matroska,webm', 'vp9', { codec_type: 'audio' }],
    ['matroska,webm', 'vp9', audio('')],
  ])('音声ストリームがある場合はコーデック情報の欠落と空値を拒否する: %s', (formatName, videoCodec, audioStream) => {
    expect(() =>
      validateVideoProbe(probe({ formatName, streams: [video(videoCodec), audioStream] }))
    ).toThrow(expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' }));
  });

  test.each([
    ['M4A ', ['M4A ', 'isom']],
    ['3gp6', ['3gp6', 'isom']],
    ['3g2a', ['3g2a', 'isom']],
  ])('ffprobeが汎用のMOV・MP4名を返しても、許可されていないftypブランドを拒否する: %s', (majorBrand, compatibleBrands) => {
    const entry = probe({ formatName: 'mov,mp4,m4a,3gp,3g2,mj2', streams: [video('h264')] });
    entry.isoBmffBrands = { majorBrand, compatibleBrands };
    expect(() => validateVideoProbe(entry)).toThrow(
      expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' })
    );
  });

  test('ftypの欠落と互換ブランドへのM4A・3GPの混入を拒否する', () => {
    const missing = probe({ formatName: 'mov,mp4,m4a,3gp,3g2,mj2', streams: [video('h264')] });
    delete missing.isoBmffBrands;
    expect(() => validateVideoProbe(missing)).toThrow(
      expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' })
    );

    const mixed = probe({ formatName: 'mov,mp4,m4a,3gp,3g2,mj2', streams: [video('h264')] });
    mixed.isoBmffBrands.compatibleBrands.push('M4A ');
    expect(() => validateVideoProbe(mixed)).toThrow(
      expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' })
    );
  });

  test('実ファイルのftypボックスからMP4・QuickTimeのブランドを安全に取得する', async () => {
    const directory = runtime.ensureDirSync(runtime.testRuntimePath('iso-bmff-fixtures'));
    const mp4Path = path.join(directory, 'fixture.mp4');
    const quickTimePath = path.join(directory, 'fixture.mov');
    const m4aPath = path.join(directory, 'fixture.m4a');
    await fs.promises.writeFile(mp4Path, ftypBox('isom', ['isom', 'iso2', 'avc1', 'mp41']));
    await fs.promises.writeFile(quickTimePath, ftypBox('qt  ', ['qt  ']));
    await fs.promises.writeFile(m4aPath, ftypBox('M4A ', ['M4A ', 'isom']));

    await expect(readIsoBmffBrands(mp4Path)).resolves.toEqual({
      majorBrand: 'isom',
      compatibleBrands: ['isom', 'iso2', 'avc1', 'mp41'],
    });
    await expect(readIsoBmffBrands(quickTimePath)).resolves.toEqual({
      majorBrand: 'qt  ',
      compatibleBrands: ['qt  '],
    });
    await expect(readIsoBmffBrands(m4aPath)).resolves.toEqual({
      majorBrand: 'M4A ',
      compatibleBrands: ['M4A ', 'isom'],
    });
  });

  test('別のボックス内にある偽のftyp情報をコンテナのブランドとして使わない', async () => {
    const directory = runtime.ensureDirSync(runtime.testRuntimePath('iso-bmff-payload-fixtures'));
    const filePath = path.join(directory, 'disguised.3gp');
    const fakeFtyp = ftypBox('isom', ['isom']);
    const mdat = Buffer.alloc(8 + fakeFtyp.length);
    mdat.writeUInt32BE(mdat.length, 0);
    mdat.write('mdat', 4, 'ascii');
    fakeFtyp.copy(mdat, 8);
    await fs.promises.writeFile(filePath, mdat);
    await expect(readIsoBmffBrands(filePath)).resolves.toBeNull();
  });

  test('動画1本・音声1本以下・禁止ストリームなし・30秒以内を要求する', () => {
    const invalid = [
      probe({ formatName: 'mov,mp4', streams: [] }),
      probe({ formatName: 'mov,mp4', streams: [video('h264'), video('h264')] }),
      probe({ formatName: 'mov,mp4', streams: [video('h264'), audio('aac'), audio('aac')] }),
      probe({
        formatName: 'mov,mp4',
        streams: [video('h264'), { codec_type: 'subtitle', codec_name: 'mov_text' }],
      }),
      probe({ formatName: 'mov,mp4', streams: [video('h264')], duration: VIDEO_MAX_DURATION_SECONDS + 0.001 }),
      probe({
        formatName: 'mov,mp4',
        streams: [video('h264', { disposition: { attached_pic: 1 } })],
      }),
    ];
    invalid.forEach((entry) => {
      expect(() => validateVideoProbe(entry)).toThrow(
        expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' })
      );
    });
  });

  test('形式と各ストリームの最長時間を使い、30.000秒を許可して30.001秒を拒否する', () => {
    expect(
      validateVideoProbe(
        probe({ formatName: 'mov,mp4', duration: 30, streams: [video('h264', { duration: 29.9 })] })
      ).duration
    ).toBe(30);
    expect(() =>
      validateVideoProbe(
        probe({ formatName: 'mov,mp4', duration: 29, streams: [video('h264', { duration: 30.001 })] })
      )
    ).toThrow(expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' }));
  });

  test('Matroskaの解析名にwebmが含まれていてもDocTypeがWebMでなければ拒否する', () => {
    const disguised = probe({ formatName: 'matroska,webm', streams: [video('vp9')] });
    disguised.ebmlDocType = 'matroska';
    expect(() => validateVideoProbe(disguised)).toThrow(
      expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' })
    );
  });

  test('EBMLヘッダのDocType要素から実際のWebM形式を判定する', async () => {
    const directory = runtime.ensureDirSync(runtime.testRuntimePath('fixtures'));
    const webmPath = path.join(directory, 'fixture.webm');
    const matroskaPath = path.join(directory, 'fixture.mkv');
    await fs.promises.writeFile(
      webmPath,
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])
    );
    await fs.promises.writeFile(
      matroskaPath,
      Buffer.from([
        0x1a, 0x45, 0xdf, 0xa3, 0x8b, 0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f,
        0x73, 0x6b, 0x61,
      ])
    );
    await expect(readEbmlDocType(webmPath)).resolves.toBe('webm');
    await expect(readEbmlDocType(matroskaPath)).resolves.toBe('matroska');
  });

  test('EBMLヘッダの外にある偽のDocType情報を使わない', async () => {
    const directory = runtime.ensureDirSync(runtime.testRuntimePath('payload-fixtures'));
    const filePath = path.join(directory, 'disguised.mkv');
    await fs.promises.writeFile(
      filePath,
      Buffer.from([
        0x1a, 0x45, 0xdf, 0xa3, 0x8b, 0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f,
        0x73, 0x6b, 0x61,
        0x18, 0x53, 0x80, 0x67, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
      ])
    );
    await expect(readEbmlDocType(filePath)).resolves.toBe('matroska');
  });

  test('Oggは通常のアップロード処理を変更せず、AI解析だけを省く', () => {
    expect(
      validateVideoProbe(probe({ formatName: 'ogg', streams: [video('theora')] }))
    ).toEqual({ skip: true, reason: 'ogg' });
  });
});
