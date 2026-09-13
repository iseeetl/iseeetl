import { expect } from 'vitest';
import { formatDateValue, createManagementDateFormatterMethods } from '@/utils/managementDateFormat';

describe('管理画面の日付整形', () => {
  it('formatDateValue は無効値で空文字を返す', () => {
    expect(formatDateValue(null)).to.equal('');
    expect(formatDateValue('invalid-date')).to.equal('');
  });

  it('formatDateValue は言語設定とタイムゾーンを使って整形する', () => {
    const date = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));
    expect(formatDateValue(date, { locale: 'ja', timeZone: 'UTC' })).to.equal('2024/01/02 03:04:05');
    expect(formatDateValue(date, { locale: 'en', timeZone: 'UTC' })).to.equal('01/02/2024, 03:04:05 AM');
    expect(formatDateValue(date, { locale: 'he', timeZone: 'UTC' })).to.equal('02.01.2024, 03:04:05');
  });

  it('createManagementDateFormatterMethods は現在の言語と画面のtimezoneを使う', () => {
    const helpers = createManagementDateFormatterMethods();
    const ctx = {
      $i18n: { locale: 'tr' },
      $data: { dateTimeZone: 'UTC' },
      ...helpers,
    };
    const date = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));

    expect(ctx.formatManagementDate(date)).to.equal('02.01.2024 03:04:05');
  });
});
