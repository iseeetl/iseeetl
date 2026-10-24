const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const { analyzeWithProvider } = require('./provider.service');
const { classifyPcm } = require('./acousticProfile');
const {
  copySafeRegularFile,
  mediaError,
  readSafeRegularFile,
} = require('./mediaPath');
const { probeMediaFile, runFfmpegCommand } = require('./ffmpegRunner');

const AUDIO_MAX_BYTES = 6 * 1024 * 1024;
const AUDIO_SAMPLE_RATE = 16000;
const AUDIO_BIT_RATE = '64k';

const splitFormatNames = (probe) =>
  String(probe?.format?.format_name || '')
    .toLowerCase()
    .split(',')
    .filter(Boolean);

const classifyStreams = (probe) => {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  return {
    audio: streams.filter((stream) => stream.codec_type === 'audio'),
    other: streams.filter((stream) => stream.codec_type !== 'audio'),
  };
};

const validateMp3Probe = (probe, { transcoded = false } = {}) => {
  const { audio, other } = classifyStreams(probe);
  const stream = audio[0];
  const validBase =
    splitFormatNames(probe).includes('mp3') &&
    audio.length === 1 &&
    other.length === 0 &&
    stream?.codec_name === 'mp3';
  const validTranscode =
    !transcoded ||
    (Number(stream?.sample_rate) === AUDIO_SAMPLE_RATE && Number(stream?.channels) === 1);
  if (!validBase || !validTranscode) throw mediaError('AI_ANALYSIS_AUDIO_INVALID');
  return probe;
};

const transcodeToAnalysisMp3 = async ({ inputPath, outputPath, streamIndex, signal } = {}) => {
  const command = ffmpeg(inputPath)
    .noVideo()
    .audioChannels(1)
    .audioFrequency(AUDIO_SAMPLE_RATE)
    .audioCodec('libmp3lame')
    .audioBitrate(AUDIO_BIT_RATE)
    .outputOptions(['-map', streamIndex == null ? '0:a:0' : `0:${streamIndex}`, '-map_metadata', '-1', '-vn', '-sn', '-dn'])
    .format('mp3')
    .output(outputPath);
  await runFfmpegCommand(command, { signal });
  return outputPath;
};

const readPreparedMp3 = async ({ outputPath, signal } = {}) => {
  const stat = await fs.promises.lstat(outputPath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0 || stat.size > AUDIO_MAX_BYTES) {
    throw mediaError('AI_ANALYSIS_AUDIO_OUTPUT_TOO_LARGE');
  }
  validateMp3Probe(await probeMediaFile(outputPath, { signal }), { transcoded: true });
  return readSafeRegularFile({ filePath: outputPath, maxBytes: AUDIO_MAX_BYTES, signal });
};

// 解析用MP3をモノラル16 kHzのs16le PCMへ復号し、波形の特徴（無音・持続音・録音レベル）を測る。
// PCMは作業ディレクトリ内に置き、MP3上限の4倍までを読み込む。
const prepareAcousticProfile = async ({ inputPath, workspace, signal } = {}) => {
  const outputPath = path.join(workspace, 'analysis-profile.pcm');
  const command = ffmpeg(inputPath)
    .noVideo()
    .audioChannels(1)
    .audioFrequency(AUDIO_SAMPLE_RATE)
    .audioCodec('pcm_s16le')
    .outputOptions(['-map', '0:a:0', '-map_metadata', '-1', '-vn', '-sn', '-dn'])
    .format('s16le')
    .output(outputPath);
  await runFfmpegCommand(command, { signal });
  const pcm = await readSafeRegularFile({ filePath: outputPath, maxBytes: AUDIO_MAX_BYTES * 4, signal });
  return classifyPcm(pcm);
};

const readPreparedAudio = async ({ outputPath, workspace, includeAcousticProfile, signal }) => ({
  audioBuffer: await readPreparedMp3({ outputPath, signal }),
  audioFileName: 'audio.mp3',
  ...(includeAcousticProfile
    ? { acousticProfile: await prepareAcousticProfile({ inputPath: outputPath, workspace, signal }) }
    : {}),
});

// includeAcousticProfileは音解析（audioScene）だけがtrueにする。文字起こしでは波形判定をしない。
const prepareAudioFileForAnalysis = async ({
  filePath, workspace, signal, includeAcousticProfile = false,
} = {}) => {
  const inputPath = path.join(workspace, 'source-audio.mp3');
  const outputPath = path.join(workspace, 'analysis-audio.mp3');
  await copySafeRegularFile({ filePath, destination: inputPath, maxBytes: AUDIO_MAX_BYTES, signal });
  validateMp3Probe(await probeMediaFile(inputPath, { signal }));
  await transcodeToAnalysisMp3({ inputPath, outputPath, signal });
  return readPreparedAudio({ outputPath, workspace, includeAcousticProfile, signal });
};

const extractVideoAudioForAnalysis = async ({
  videoPath, streamIndex, workspace, signal, includeAcousticProfile = false,
} = {}) => {
  const outputPath = path.join(workspace, 'analysis-video-audio.mp3');
  await transcodeToAnalysisMp3({ inputPath: videoPath, outputPath, streamIndex, signal });
  return readPreparedAudio({ outputPath, workspace, includeAcousticProfile, signal });
};

const transcribePreparedAudio = ({ audioBuffer, audioFileName = 'audio.mp3' }, { language, additionalPrompt, signal } = {}) =>
  analyzeWithProvider({
    kind: 'speech',
    language,
    additionalPrompt,
    media: { audioBuffer, audioFileName },
    signal,
  });

const describePreparedAudioScene = (
  { audioBuffer, audioFileName = 'audio.mp3', acousticProfile },
  { additionalPrompt, signal } = {}
) =>
  analyzeWithProvider({
    kind: 'audioScene',
    additionalPrompt,
    media: { audioBuffer, audioFileName, acousticProfile },
    signal,
  });

module.exports = {
  AUDIO_BIT_RATE,
  AUDIO_MAX_BYTES,
  AUDIO_SAMPLE_RATE,
  describePreparedAudioScene,
  extractVideoAudioForAnalysis,
  prepareAudioFileForAnalysis,
  transcribePreparedAudio,
  transcodeToAnalysisMp3,
  validateMp3Probe,
};
