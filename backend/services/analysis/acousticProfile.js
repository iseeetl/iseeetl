// Conservative measurements of decoded mono 16 kHz PCM, not a speech detector.
const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 1280;

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
  if (frequency < 80 || frequency > 4000) return null;
  if (crossings.slice(1).some((x, i) => Math.abs((x - crossings[i]) / period - 1) > 0.01)) return null;
  let ss = 0; let cc = 0; let sc = 0; let xs = 0; let xc = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const phase = 2 * Math.PI * frequency * i / SAMPLE_RATE;
    const s = Math.sin(phase); const c = Math.cos(phase);
    ss += s * s; cc += c * c; sc += s * c;
    xs += samples[i] * s; xc += samples[i] * c;
  }
  const determinant = ss * cc - sc * sc;
  if (determinant <= 0) return null;
  const a = (xs * cc - xc * sc) / determinant;
  const b = (xc * ss - xs * sc) / determinant;
  const explained = (a * xs + b * xc) / energy;
  if (explained < 0.995) return null;
  return { frequency, rms: Math.sqrt(energy / samples.length) };
};

const classifyPcm = (pcm) => {
  if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length % 2) return { kind: 'unknown' };
  const count = pcm.length / 2;
  let peak = 0;
  for (let i = 0; i < count; i += 1) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)));
  // Only digital zero is called silent. Quiet recordings are not discarded.
  if (peak === 0) return { kind: 'digital-silence' };
  if (count < SAMPLE_RATE) return { kind: 'unknown' };
  const frames = [];
  for (let start = 0; start < count;) {
    const length = count - start < FRAME_SAMPLES + 320 ? count - start : FRAME_SAMPLES;
    const samples = Array.from({ length }, (_, i) => pcm.readInt16LE((start + i) * 2));
    const tone = measureTone(samples);
    if (!tone) return { kind: 'unknown' };
    frames.push(tone);
    start += length;
  }
  const frequencies = frames.map(frame => frame.frequency);
  const levels = frames.map(frame => frame.rms);
  const frequency = frequencies.reduce((sum, value) => sum + value, 0) / frames.length;
  if (Math.max(...frequencies) - Math.min(...frequencies) > Math.max(1, frequency * 0.005)) return { kind: 'unknown' };
  if (Math.max(...levels) / Math.min(...levels) > 1.1) return { kind: 'unknown' };
  return { kind: 'steady-tone', frequencyHz: Math.round(frequency) };
};

const describeAcousticProfile = (profile) => {
  if (profile?.kind === 'digital-silence') return '解析用の音声データは無音です。音源や周囲の状況は判断できません。';
  if (profile?.kind === 'steady-tone' && Number.isInteger(profile.frequencyHz) && profile.frequencyHz >= 80 && profile.frequencyHz <= 4000) {
    return `波形を確認すると、約${profile.frequencyHz} Hzの、ほぼ一定の高さと強さの音が続いています。この特徴だけでは音源を特定できません。`;
  }
  return null;
};

module.exports = { classifyPcm, describeAcousticProfile };
