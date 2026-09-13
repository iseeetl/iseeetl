const NOTIFICATION_MESSAGES = require('../../../constants/notificationMessages');
const { ALLOWED_LANGUAGES } = require('../../../constants/languages');

const expectedLanguageCodes = ALLOWED_LANGUAGES.map((language) => (language === 'zh' ? 'zh-Hans' : language));

describe('通知メッセージの翻訳', () => {
  test('すべての対応言語に空でない通知文がある', () => {
    const keys = [
      'SUPPLEMENT_POST_AUTHOR',
      'SUPPLEMENT_REPLY_AUTHOR',
      'SUPPLEMENT_PUSHFILTER',
      'POST_FILTER_MATCH',
      'REPLY_FILTER_MATCH',
      'REPLY_POST_AUTHOR',
      'REPLY_REPLIERS',
    ];

    keys.forEach((key) => {
      expect(Object.keys(NOTIFICATION_MESSAGES[key])).toEqual(expectedLanguageCodes);
      expectedLanguageCodes.forEach((lang) => {
        expect(typeof NOTIFICATION_MESSAGES[key][lang]).toBe('string');
        expect(NOTIFICATION_MESSAGES[key][lang].length).toBeGreaterThan(0);
      });
    });
  });

  test('CONTENT_TEMPLATES はテンプレート文字列を返す', () => {
    const { CONTENT_TEMPLATES } = NOTIFICATION_MESSAGES;
    const defaultMessage = CONTENT_TEMPLATES.DEFAULT({ senderName: 'Alice', snippet: 'Hi' });
    const compactMessage = CONTENT_TEMPLATES.COMPACT({ senderName: 'Bob', snippet: 'Ok' });

    expect(defaultMessage.ja).toContain('Alice');
    expect(defaultMessage.ja).toContain('Hi');
    expect(defaultMessage.en).toContain('Alice');
    expect(defaultMessage.en).toContain('Hi');

    expect(compactMessage.ja).toContain('Bob');
    expect(compactMessage.ja).toContain('Ok');
    expect(compactMessage.en).toContain('Bob');
    expect(compactMessage.en).toContain('Ok');
    expect(Object.keys(defaultMessage)).toEqual(expectedLanguageCodes);
    expect(Object.keys(compactMessage)).toEqual(expectedLanguageCodes);
  });

  test('applicationのzhをOneSignalの簡体中国語コードへ変換する', () => {
    expect(NOTIFICATION_MESSAGES.ONE_SIGNAL_LANGUAGES).toContain('zh-Hans');
    expect(NOTIFICATION_MESSAGES.ONE_SIGNAL_LANGUAGES).not.toContain('zh');
  });
});
