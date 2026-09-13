import { expect } from 'vitest';
import { applyTimelineSettings, readTimelineSettings, resolveTimelineTextStyle } from '@/features/timeline/settings';

describe('タイムラインの設定保存と適用', () => {
  it('resolveTimelineTextStyle はストレージからスタイルを組み立てる', () => {
    const result = resolveTimelineTextStyle({
      storage: { timelineFontFamily: 'Noto', timelineFontSize: '14px' },
    });

    expect(result).to.deep.equal({
      fontFamily: 'font-family:Noto;',
      fontSize: 'font-size:14px;',
    });
  });

  it('resolveTimelineTextStyle はローカルフォントサイズを優先する', () => {
    const result = resolveTimelineTextStyle({
      storage: { timelineFontSize: '12px' },
      localFontSize: '18px',
    });

    expect(result.fontSize).to.equal('font-size:18px;');
  });

  it('resolveTimelineTextStyle は未設定なら空文字を返す', () => {
    const result = resolveTimelineTextStyle({});

    expect(result).to.deep.equal({ fontFamily: '', fontSize: '' });
  });

  it('applyTimelineSettings はタイムラインの状態を更新する', () => {
    const timeline = { fontFamily: '', fontSize: '' };
    const ui = { localFontSize: '20px' };

    applyTimelineSettings({
      timeline,
      ui,
      storage: { timelineFontFamily: 'M+1', timelineFontSize: '11px' },
    });

    expect(timeline.fontFamily).to.equal('font-family:M+1;');
    expect(timeline.fontSize).to.equal('font-size:20px;');
  });

  it('readTimelineSettings はストレージが無ければ空を返す', () => {
    const result = readTimelineSettings({ localStorageRef: null });
    expect(result).to.deep.equal({});
  });

  it('readTimelineSettings はJSONを読み取る', () => {
    const result = readTimelineSettings({
      localStorageRef: {
        getItem: () => JSON.stringify({ timelineFontFamily: 'Noto' }),
      },
      storageKey: 'custom',
    });

    expect(result).to.deep.equal({ timelineFontFamily: 'Noto' });
  });

  it('readTimelineSettings は不正なJSONを空にする', () => {
    const result = readTimelineSettings({
      localStorageRef: {
        getItem: () => '{bad json',
      },
    });

    expect(result).to.deep.equal({});
  });

  it('readTimelineSettings は非オブジェクトを空にする', () => {
    const result = readTimelineSettings({
      localStorageRef: {
        getItem: () => JSON.stringify('text'),
      },
    });

    expect(result).to.deep.equal({});
  });
});
