// 解析用MP3をデコードしたモノラル16 kHz・16 bit PCMの保守的な波形確認。声の検出器ではない。
// デジタル無音と単一の持続音だけを判定し、それ以外は「不明」として外部の音解析へ渡す。
const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 1280; // 80 ms
const FRAME_TAIL_SLACK = 320; // 末尾の短い余りは最後のフレームへ吸収する
const MIN_TONE_FRAMES = 10; // 先頭・末尾を除いた判定対象が1秒未満なら不明
const FULL_SCALE = 32768;
const MIN_DBFS = -200; // -Infinity はJSON化できないため、全サンプル0はこの値へ丸める
const LOW_LEVEL_PEAK_DBFS = -50;
const LOW_LEVEL_NOTE_JA = '録音レベルが非常に低いため、説明の確度は低いです。';
const TONE_MIN_HZ = 80;
const TONE_MAX_HZ = 4000;
// 短い電子音の繰り返し（ビープ列）の判定。10 msごとの包絡で音の区間と無音の区間を分ける。
const ENVELOPE_HOP = 160; // 10 ms
const PULSE_ON_DBFS = -40; // これ以上を音の区間とする
const GAP_MAX_DBFS = -60; // 音の区間の外はこれ以下（実質無音）でなければ判定しない
const PULSE_EDGE_FRAMES = 2; // 区間の両端20 msは立ち上がり・立ち下がりとして正弦波の照合から除く
const PULSE_MIN_FRAMES = 8; // 80 ms 以上
const PULSE_MAX_FRAMES = 150; // 1.5 s 以下
const PULSE_TONE_EXPLAINED = 0.98; // MP3 を経た短音はわずかに崩れるため一定音より緩める
const MIN_PULSES = 2;
const INTERVAL_REGULARITY = 0.2; // 間隔の変動係数がこれ以下なら「約N秒間隔」と述べる

const toDbfs = (ratio) => (ratio > 0 ? Math.round(20 * Math.log10(ratio) * 10) / 10 : MIN_DBFS);

const measureTone = (samples, { minExplained = 0.995 } = {}) => {
  let energy = 0;
  const crossings = [];
  for (let i = 0; i < samples.length; i += 1) {
    energy += samples[i] ** 2;
    if (i && samples[i - 1] <= 0 && samples[i] > 0) {
      crossings.push(i - 1 - samples[i - 1] / (samples[i] - samples[i - 1]));
    }
  }
  if (crossings.length < 4 || energy / samples.length < 32 ** 2) return null;
  const period = (crossings.at(-1) - crossings[0]) / (crossings.length - 1);
  const frequency = SAMPLE_RATE / period;
  if (frequency < TONE_MIN_HZ || frequency > TONE_MAX_HZ) return null;
  if (crossings.slice(1).some((x, i) => Math.abs((x - crossings[i]) / period - 1) > 0.01)) return null;
  let ss = 0;
  let cc = 0;
  let sc = 0;
  let xs = 0;
  let xc = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const phase = (2 * Math.PI * frequency * i) / SAMPLE_RATE;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    ss += s * s;
    cc += c * c;
    sc += s * c;
    xs += samples[i] * s;
    xc += samples[i] * c;
  }
  const determinant = ss * cc - sc * sc;
  if (determinant <= 0) return null;
  const a = (xs * cc - xc * sc) / determinant;
  const b = (xc * ss - xs * sc) / determinant;
  const explained = (a * xs + b * xc) / energy;
  if (explained < minExplained) return null;
  return { frequency, rms: Math.sqrt(energy / samples.length) };
};

const readSamples = (pcm, start, length) => {
  const samples = new Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = pcm.readInt16LE((start + i) * 2);
  return samples;
};

// 10 msごとの実効値（dBFS）。
const envelopeDbfs = (pcm, count) => {
  const frames = Math.floor(count / ENVELOPE_HOP);
  const levels = new Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let squareSum = 0;
    for (let i = f * ENVELOPE_HOP; i < (f + 1) * ENVELOPE_HOP; i += 1) {
      const sample = pcm.readInt16LE(i * 2);
      squareSum += sample * sample;
    }
    levels[f] = toDbfs(Math.sqrt(squareSum / ENVELOPE_HOP) / FULL_SCALE);
  }
  return levels;
};

// 同じ高さの短い純音が、実質無音を挟んで2回以上鳴る場合だけ「短い電子音の繰り返し」とする。
// 背景音がある録音、途中に別の音がある録音、音の高さが揺れる録音は判定しない。
const classifyPulsedTone = (pcm, count) => {
  const levels = envelopeDbfs(pcm, count);
  if (levels.length < MIN_PULSES * (PULSE_MIN_FRAMES + 1)) return null;
  const on = levels.map((level) => level >= PULSE_ON_DBFS);
  const runs = [];
  for (let f = 0; f < on.length; f += 1) {
    if (!on[f]) continue;
    const start = f;
    while (f + 1 < on.length && on[f + 1]) f += 1;
    runs.push({ start, end: f + 1 });
  }
  if (runs.length < MIN_PULSES) return null;
  for (const run of runs) {
    const length = run.end - run.start;
    if (length < PULSE_MIN_FRAMES || length > PULSE_MAX_FRAMES) return null;
  }
  // 音の区間と、その両端に接する立ち上がり・立ち下がり以外は実質無音でなければならない。
  for (let f = 0; f < levels.length; f += 1) {
    if (on[f] || levels[f] <= GAP_MAX_DBFS) continue;
    const nearPulse = runs.some((run) => f >= run.start - PULSE_EDGE_FRAMES && f < run.end + PULSE_EDGE_FRAMES);
    if (!nearPulse) return null;
  }
  const tones = [];
  for (const run of runs) {
    const start = (run.start + PULSE_EDGE_FRAMES) * ENVELOPE_HOP;
    const length = (run.end - run.start - 2 * PULSE_EDGE_FRAMES) * ENVELOPE_HOP;
    const tone = measureTone(readSamples(pcm, start, length), { minExplained: PULSE_TONE_EXPLAINED });
    if (!tone) return null;
    tones.push(tone);
  }
  const frequencies = tones.map((tone) => tone.frequency);
  const frequency = frequencies.reduce((sum, value) => sum + value, 0) / tones.length;
  if (Math.max(...frequencies) - Math.min(...frequencies) > Math.max(1, frequency * 0.01)) return null;
  const onsets = runs.map((run) => run.start * ENVELOPE_HOP / SAMPLE_RATE);
  const intervals = onsets.slice(1).map((onset, i) => onset - onsets[i]);
  let intervalSec = null;
  if (intervals.length >= 1) {
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const deviation = Math.sqrt(intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length);
    if (mean > 0 && deviation / mean <= INTERVAL_REGULARITY) intervalSec = Math.round(mean * 10) / 10;
  }
  return { kind: 'pulsed-tone', frequencyHz: Math.round(frequency), pulses: runs.length, intervalSec };
};

// 80 msごとのフレーム境界。末尾の余りが短い場合は最後のフレームに含める。
const splitFrames = (count) => {
  const frames = [];
  for (let start = 0; start < count;) {
    const length = count - start < FRAME_SAMPLES + FRAME_TAIL_SLACK ? count - start : FRAME_SAMPLES;
    frames.push({ start, length });
    start += length;
  }
  return frames;
};

const unknownProfile = (levels) => ({ kind: 'unknown', ...levels });

// pcm は s16le・モノラル・16 kHz の Buffer。
const classifyPcm = (pcm) => {
  if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length % 2) {
    return { kind: 'unknown', peakDbfs: MIN_DBFS, rmsDbfs: MIN_DBFS, lowLevel: false };
  }
  const count = pcm.length / 2;
  let peak = 0;
  let squareSum = 0;
  for (let i = 0; i < count; i += 1) {
    const sample = pcm.readInt16LE(i * 2);
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
    squareSum += sample * sample;
  }
  const peakDbfs = toDbfs(peak / FULL_SCALE);
  const rmsDbfs = toDbfs(Math.sqrt(squareSum / count) / FULL_SCALE);
  const levels = { peakDbfs, rmsDbfs, lowLevel: peakDbfs < LOW_LEVEL_PEAK_DBFS };
  // デジタルゼロだけを無音とする。小さい音は無音扱いしない。
  if (peak === 0) return { kind: 'digital-silence', ...levels };

  // 1秒未満は判定しない。一定音では先頭と末尾の各1フレームをフェードとして判定から除外する。
  if (count < SAMPLE_RATE) return unknownProfile(levels);
  const steady = classifySteadyTone(pcm, count);
  if (steady) return { ...steady, ...levels };
  const pulsed = classifyPulsedTone(pcm, count);
  if (pulsed) return { ...pulsed, ...levels };
  return unknownProfile(levels);
};

const classifySteadyTone = (pcm, count) => {
  const frames = splitFrames(count).slice(1, -1);
  if (frames.length < MIN_TONE_FRAMES) return null;
  const tones = [];
  for (const { start, length } of frames) {
    const tone = measureTone(readSamples(pcm, start, length));
    if (!tone) return null;
    tones.push(tone);
  }
  const frequencies = tones.map((tone) => tone.frequency);
  const rmsValues = tones.map((tone) => tone.rms);
  const frequency = frequencies.reduce((sum, value) => sum + value, 0) / tones.length;
  if (Math.max(...frequencies) - Math.min(...frequencies) > Math.max(1, frequency * 0.005)) return null;
  if (Math.max(...rmsValues) / Math.min(...rmsValues) > 1.1) return null;
  return { kind: 'steady-tone', frequencyHz: Math.round(frequency) };
};

const validFrequency = (profile) =>
  Number.isInteger(profile?.frequencyHz) && profile.frequencyHz >= TONE_MIN_HZ && profile.frequencyHz <= TONE_MAX_HZ;

// 測定で確定した持続音・短い電子音の繰り返しだけを固定文にする。
// digital-silence と低レベルは呼び出し側で status として扱う。
const describeAcousticProfile = (profile) => {
  if (profile?.kind === 'steady-tone' && validFrequency(profile)) {
    return `波形を確認すると、約${profile.frequencyHz} Hzの、ほぼ一定の高さと強さの音が続いています。この特徴だけでは音源を特定できません。`;
  }
  if (profile?.kind === 'pulsed-tone' && validFrequency(profile) && Number.isInteger(profile.pulses) && profile.pulses >= MIN_PULSES) {
    const interval = Number.isFinite(profile.intervalSec) && profile.intervalSec > 0 ? `、約${profile.intervalSec}秒間隔で` : '';
    return `波形を確認すると、約${profile.frequencyHz} Hzの短い電子音が${profile.pulses}回${interval}鳴っています。この特徴だけでは音源を特定できません。`;
  }
  return null;
};

module.exports = {
  LOW_LEVEL_NOTE_JA,
  LOW_LEVEL_PEAK_DBFS,
  classifyPcm,
  describeAcousticProfile,
};
