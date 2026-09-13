import { expect } from 'vitest';
import DateUtil from '@/utils/dateUtil';

describe('日時の整形（DateUtil）', () => {
  let originalDateTimeFormat;

  beforeEach(() => {
    originalDateTimeFormat = Intl.DateTimeFormat;
  });

  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
  });

  it('getLocalDate はタイムゾーン付きで日付を整形する', () => {
    Intl.DateTimeFormat = function (...args) {
      const instance = new originalDateTimeFormat(...args);
      const originalResolvedOptions = instance.resolvedOptions.bind(instance);
      instance.resolvedOptions = () => ({ ...originalResolvedOptions(), timeZone: 'UTC' });
      return instance;
    };
    Intl.DateTimeFormat.supportedLocalesOf = originalDateTimeFormat.supportedLocalesOf;

    const result = DateUtil.getLocalDate(new Date('2024-01-01T00:00:00Z'), 'en', 'date');
    expect(result).to.equal('01/01/2024');
  });

  it('ヘブライ語とトルコ語もIntlの言語設定形式で整形する', () => {
    const date = new Date(2024, 0, 2, 12, 0, 0);
    expect(DateUtil.getLocalDate(date, 'he', 'date')).to.equal('02.01.2024');
    expect(DateUtil.getLocalDate(date, 'tr', 'date')).to.equal('02.01.2024');
  });

  it('未知の言語には英語を使い、無効な日付には空文字を返す', () => {
    expect(DateUtil.getLocalDate(new Date(2024, 0, 1, 12, 0, 0), 'xx', 'date')).to.equal('01/01/2024');
    expect(DateUtil.getLocalDate('invalid-date', 'ja', 'date')).to.equal('');
  });
});
