const { classifyPcm, describeAcousticProfile } = require('../../../../services/analysis/acousticProfile');
const rate = 16000;
const pcm = (seconds, sample) => {
  const buffer = Buffer.alloc(Math.round(seconds * rate) * 2);
  for (let i = 0; i < buffer.length / 2; i += 1) buffer.writeInt16LE(Math.round(sample(i / rate, i)), i * 2);
  return buffer;
};
const tone = (frequency, amplitude = 4000) => t => amplitude * Math.sin(2 * Math.PI * frequency * t + 0.7);

describe('音声データの保守的な波形確認', () => {
  test.each([220, 880, 523.25])('連続した単一の正弦波 %s Hzを計測する', frequency => {
    const result = classifyPcm(pcm(1.137, tone(frequency)));
    expect(result.kind).toBe('steady-tone');
    expect(result.frequencyHz).toBeCloseTo(Math.round(frequency), 0);
    expect(describeAcousticProfile(result)).toContain('音源を特定できません');
    expect(describeAcousticProfile(result)).not.toMatch(/話し声|会話|屋内|屋外/);
  });

  test('デジタルゼロだけを無音とし、微小音は無音扱いしない', () => {
    expect(classifyPcm(pcm(2, () => 0))).toEqual({ kind: 'digital-silence' });
    expect(classifyPcm(pcm(2, tone(880, 1)))).toEqual({ kind: 'unknown' });
  });

  test.each([
    ['間欠音', t => t % 1 < 0.25 ? tone(880)(t) : 0],
    ['変調音', t => tone(880)(t) * (1 + 0.5 * Math.sin(6 * Math.PI * t))],
    ['倍音を含む音', t => tone(220)(t) + tone(440, 1000)(t) + tone(660, 1000)(t)],
    ['周波数が変わる音', t => 4000 * Math.sin(2 * Math.PI * (220 * t + 300 * t * t))],
    ['後半で別の音が加わる音', t => tone(880)(t) + (t > 1.5 ? tone(521, 2000)(t) : 0)],
  ])('%sから声や音源の有無を決めず、外部解析の対象として残す', (_label, sample) => {
    expect(classifyPcm(pcm(2, sample))).toEqual({ kind: 'unknown' });
    expect(describeAcousticProfile(classifyPcm(pcm(2, sample)))).toBeNull();
  });

  test('短い音・不正なPCM・根拠のないプロフィールを確定説明へ変換しない', () => {
    expect(classifyPcm(pcm(0.2, tone(880)))).toEqual({ kind: 'unknown' });
    expect(classifyPcm(Buffer.alloc(0))).toEqual({ kind: 'unknown' });
    expect(classifyPcm(Buffer.alloc(3))).toEqual({ kind: 'unknown' });
    expect(describeAcousticProfile({ kind: 'steady-tone', frequencyHz: NaN })).toBeNull();
  });
});
