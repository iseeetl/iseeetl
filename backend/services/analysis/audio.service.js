const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const { analyzeWithProvider } = require('./provider.service');
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

const transcodeToAnalysisMp3 = async ({ inputPath, outputPath, signal } = {}) => {
  const command = ffmpeg(inputPath)
    .noVideo()
    .audioChannels(1)
    .audioFrequency(AUDIO_SAMPLE_RATE)
    .audioCodec('libmp3lame')
    .audioBitrate(AUDIO_BIT_RATE)
    .outputOptions(['-map', '0:a:0', '-map_metadata', '-1', '-vn', '-sn', '-dn'])
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

const prepareAudioFileForAnalysis = async ({ filePath, workspace, signal } = {}) => {
  const inputPath = path.join(workspace, 'source-audio.mp3');
  const outputPath = path.join(workspace, 'analysis-audio.mp3');
  await copySafeRegularFile({ filePath, destination: inputPath, maxBytes: AUDIO_MAX_BYTES, signal });
  validateMp3Probe(await probeMediaFile(inputPath, { signal }));
  await transcodeToAnalysisMp3({ inputPath, outputPath, signal });
  return {
    audioBuffer: await readPreparedMp3({ outputPath, signal }),
    audioFileName: 'audio.mp3',
  };
};

const extractVideoAudioForAnalysis = async ({ videoPath, workspace, signal } = {}) => {
  const outputPath = path.join(workspace, 'analysis-video-audio.mp3');
  await transcodeToAnalysisMp3({ inputPath: videoPath, outputPath, signal });
  return {
    audioBuffer: await readPreparedMp3({ outputPath, signal }),
    audioFileName: 'audio.mp3',
  };
};

const transcribePreparedAudio = ({ audioBuffer, audioFileName = 'audio.mp3' }, { language, additionalPrompt, signal } = {}) =>
  analyzeWithProvider({
    kind: 'speech',
    language,
    additionalPrompt,
    media: { audioBuffer, audioFileName },
    signal,
  });

const describePreparedAudioScene = ({ audioBuffer, audioFileName = 'audio.mp3' }, { additionalPrompt, signal } = {}) =>
  analyzeWithProvider({
    kind: 'audioScene',
    additionalPrompt,
    media: { audioBuffer, audioFileName },
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
