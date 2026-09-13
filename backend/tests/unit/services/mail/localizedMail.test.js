const { ALLOWED_LANGUAGES } = require('../../../../constants/languages');
const {
  buildPasswordChangedMail,
  buildPasswordResetCompletedMail,
  buildPasswordResetMail,
  buildRegistrationMail,
  normalizeMailLocale,
} = require('../../../../services/mail/localizedMail');

const base = {
  appName: 'ISeeeTimeLine',
  noReplyMail: 'noreply@example.com',
};

describe('言語別の通知メール', () => {
  test.each(ALLOWED_LANGUAGES)('%sの登録確認メールとパスワード通知メールを生成する', (locale) => {
    const mails = [
      buildRegistrationMail({ ...base, locale, activateUrl: 'https://example.com/activate' }),
      buildPasswordResetMail({ ...base, locale, resetUrl: 'https://example.com/reset' }),
      buildPasswordResetCompletedMail({ ...base, locale }),
      buildPasswordChangedMail({ ...base, locale }),
    ];

    mails.forEach((mail) => {
      expect(mail.from).toEqual(expect.objectContaining({ address: base.noReplyMail }));
      expect(mail.subject).toEqual(expect.any(String));
      expect(mail.subject.length).toBeGreaterThan(base.appName.length);
      expect(mail.html).toContain(`lang="${locale}"`);
      expect(mail.html).toContain(`dir="${locale === 'he' ? 'rtl' : 'ltr'}"`);
    });
  });

  test('未知言語設定は日本語を代わりに使う', () => {
    expect(normalizeMailLocale('unknown')).toBe('ja');
    expect(normalizeMailLocale(null)).toBe('ja');
    expect(normalizeMailLocale('HE-il')).toBe('he');
  });

  test('日本語メールは利用者向けの登録・パスワード文言を使用する', () => {
    const registration = buildRegistrationMail({
      ...base,
      locale: 'ja',
      activateUrl: 'https://example.com/activate',
    });
    const resetCompleted = buildPasswordResetCompletedMail({ ...base, locale: 'ja' });
    const changed = buildPasswordChangedMail({ ...base, locale: 'ja' });

    expect(registration.subject).toContain('仮登録のご案内');
    expect(registration.html).toContain('仮登録ありがとうございます。');
    expect(registration.html).toContain('以下のURLから本登録を完了してください。');
    expect(resetCompleted.html).toContain('パスワードが再設定されました。');
    expect(changed.html).toContain('パスワードが変更されました。');
  });

  test('HTMLへ埋め込む名前とURLをエスケープする', () => {
    const mail = buildRegistrationMail({
      ...base,
      locale: 'he',
      appName: '<App>',
      activateUrl: 'https://example.com/?a="<x>"',
      room: {
        url: 'https://example.com/room?a=<x>',
        floorTitle: '<script>floor</script>',
        roomTitle: 'room & more',
      },
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;App&gt;');
    expect(mail.html).toContain('&lt;script&gt;floor&lt;/script&gt;');
    expect(mail.html).toContain('room &amp; more');
    expect(mail.html).toContain('<bdi dir="ltr">');
  });
});
