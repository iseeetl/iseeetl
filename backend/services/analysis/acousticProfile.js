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

const toDbfs = (ratio) => (ratio > 0 ? Math.round(20 * Math.log10(ratio) * 10) / 10 : MIN_DBFS);

const measureTone = (samples) => {
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
  if (explained < 0.995) return null;
  return { frequency, rms: Math.sqrt(energy / samples.length) };
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

  // 1秒未満は判定しない。先頭と末尾の各1フレームはフェードを許容するため判定から除外する。
  if (count < SAMPLE_RATE) return unknownProfile(levels);
  const frames = splitFrames(count).slice(1, -1);
  if (frames.length < MIN_TONE_FRAMES) return unknownProfile(levels);
  const tones = [];
  for (const { start, length } of frames) {
    const samples = new Array(length);
    for (let i = 0; i < length; i += 1) samples[i] = pcm.readInt16LE((start + i) * 2);
    const tone = measureTone(samples);
    if (!tone) return unknownProfile(levels);
    tones.push(tone);
  }
  const frequencies = tones.map((tone) => tone.frequency);
  const rmsValues = tones.map((tone) => tone.rms);
  const frequency = frequencies.reduce((sum, value) => sum + value, 0) / tones.length;
  if (Math.max(...frequencies) - Math.min(...frequencies) > Math.max(1, frequency * 0.005)) {
    return unknownProfile(levels);
  }
  if (Math.max(...rmsValues) / Math.min(...rmsValues) > 1.1) return unknownProfile(levels);
  return { kind: 'steady-tone', frequencyHz: Math.round(frequency), ...levels };
};

// 測定で確定した持続音だけを固定文にする。digital-silence は呼び出し側で status として扱う。
const describeAcousticProfile = (profile) => {
  if (
    profile?.kind === 'steady-tone' &&
    Number.isInteger(profile.frequencyHz) &&
    profile.frequencyHz >= TONE_MIN_HZ &&
    profile.frequencyHz <= TONE_MAX_HZ
  ) {
    return `波形を確認すると、約${profile.frequencyHz} Hzの、ほぼ一定の高さと強さの音が続いています。この特徴だけでは音源を特定できません。`;
  }
  return null;
};

module.exports = {
  LOW_LEVEL_NOTE_JA,
  LOW_LEVEL_PEAK_DBFS,
  classifyPcm,
  describeAcousticProfile,
};
