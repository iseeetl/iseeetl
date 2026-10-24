const {
  LOW_LEVEL_NOTE_JA,
  LOW_LEVEL_PEAK_DBFS,
  classifyPcm,
  describeAcousticProfile,
} = require('../../../../services/analysis/acousticProfile');

const RATE = 16000;
const FULL_SCALE = 32768;

// seconds秒分のs16le PCMをsample(t, i)から合成する。
const pcm = (seconds, sample) => {
  const count = Math.round(seconds * RATE);
  const buffer = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i += 1) {
    const value = Math.max(-32768, Math.min(32767, Math.round(sample(i / RATE, i))));
    buffer.writeInt16LE(value, i * 2);
  }
  return buffer;
};
const tone = (frequency, amplitude = 4000) => (t) => amplitude * Math.sin(2 * Math.PI * frequency * t + 0.7);
// 両端10 msのフェード。
const fade = (seconds) => (t) => Math.min(1, t / 0.01, (seconds - t) / 0.01);
const dbfsAmplitude = (dbfs) => FULL_SCALE * 10 ** (dbfs / 20);
// 決定的な擬似乱数（LCG）で白色雑音を作る。
const noise = (amplitude) => {
  let state = 12345;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return (state / 2147483648 * 2 - 1) * amplitude;
  };
};

describe('音声データの保守的な波形確認', () => {
  test('全サンプルがゼロならデジタル無音とし、レベルは-200 dBFSへ丸める', () => {
    expect(classifyPcm(pcm(2, () => 0))).toEqual({
      kind: 'digital-silence', peakDbfs: -200, rmsDbfs: -200, lowLevel: true,
    });
  });

  test('両端10 msフェード付きの880 Hz正弦波6秒を一定音として計測する', () => {
    const result = classifyPcm(pcm(6, (t) => tone(880)(t) * fade(6)(t)));
    expect(result).toMatchObject({ kind: 'steady-tone', frequencyHz: 880, lowLevel: false });
    expect(result.peakDbfs).toBeCloseTo(20 * Math.log10(4000 / FULL_SCALE), 0);
    expect(result.rmsDbfs).toBeLessThan(result.peakDbfs);
    expect(describeAcousticProfile(result)).toBe(
      '波形を確認すると、約880 Hzの、ほぼ一定の高さと強さの音が続いています。この特徴だけでは音源を特定できません。'
    );
  });

  test('220 Hzの正弦波を一定音として計測する', () => {
    const result = classifyPcm(pcm(2, tone(220)));
    expect(result).toMatchObject({ kind: 'steady-tone', frequencyHz: 220, lowLevel: false });
    expect(describeAcousticProfile(result)).toContain('約220 Hz');
  });

  test.each([
    ['1200 Hzのビープ列（0.2秒×6）', 2.4, (t) => (t % 0.4 < 0.2 ? tone(1200)(t) : 0)],
    ['白色雑音', 2, noise(8000)],
    ['ダイヤルトーン（350+440 Hz）', 2, (t) => tone(350)(t) + tone(440)(t)],
    ['周波数が変わる音', 2, (t) => 4000 * Math.sin(2 * Math.PI * (220 * t + 300 * t * t))],
  ])('%sは不明として外部解析へ渡す', (_label, seconds, sample) => {
    const result = classifyPcm(pcm(seconds, sample));
    expect(result).toMatchObject({ kind: 'unknown', lowLevel: false });
    expect(describeAcousticProfile(result)).toBeNull();
  });

  test('-60 dBFSの雑音は不明としつつ低レベルを示す', () => {
    const result = classifyPcm(pcm(2, noise(dbfsAmplitude(-60))));
    expect(result.kind).toBe('unknown');
    expect(result.lowLevel).toBe(true);
    expect(result.peakDbfs).toBeLessThan(LOW_LEVEL_PEAK_DBFS);
    expect(result.peakDbfs).toBeGreaterThan(-70);
    expect(LOW_LEVEL_NOTE_JA).toBe('録音レベルが非常に低いため、説明の確度は低いです。');
  });

  test('微小な一定音は無音にせず、低レベルの不明として残す', () => {
    const result = classifyPcm(pcm(2, tone(880, 1)));
    expect(result).toMatchObject({ kind: 'unknown', lowLevel: true });
  });

  test('1秒未満の音は一定音と判定しない', () => {
    expect(classifyPcm(pcm(0.9, tone(880)))).toMatchObject({ kind: 'unknown', lowLevel: false });
    expect(classifyPcm(pcm(0.2, tone(880))).kind).toBe('unknown');
    expect(classifyPcm(pcm(1.0, tone(880))).kind).toBe('steady-tone');
  });

  test('奇数バイト・空・Buffer以外は不明にし、低レベル扱いもしない', () => {
    const expected = { kind: 'unknown', peakDbfs: -200, rmsDbfs: -200, lowLevel: false };
    expect(classifyPcm(Buffer.alloc(0))).toEqual(expected);
    expect(classifyPcm(Buffer.alloc(3))).toEqual(expected);
    expect(classifyPcm('not a buffer')).toEqual(expected);
    expect(classifyPcm(undefined)).toEqual(expected);
  });

  test('根拠のないプロファイルと無音は固定文に変換しない', () => {
    expect(describeAcousticProfile({ kind: 'steady-tone', frequencyHz: NaN })).toBeNull();
    expect(describeAcousticProfile({ kind: 'steady-tone', frequencyHz: 20 })).toBeNull();
    expect(describeAcousticProfile({ kind: 'digital-silence' })).toBeNull();
    expect(describeAcousticProfile({ kind: 'unknown' })).toBeNull();
    expect(describeAcousticProfile(undefined)).toBeNull();
  });
});
