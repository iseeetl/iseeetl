import { expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES } from '@/constants/languages.js';

const readContent = (locale, fileName) =>
  fs.readFileSync(path.resolve(process.cwd(), 'src', 'content', 'static', locale, fileName), 'utf8');

const PURPOSE_MARKERS = Object.freeze({
  de: 'den Website-Dienst zu verbessern',
  en: 'improve the site service',
  es: 'mejorar el servicio del sitio',
  fr: "améliorer le service du site",
  he: 'לשפר את שירות האתר',
  hi: 'साइट सेवा में सुधार',
  it: 'migliorare il servizio del sito',
  ja: 'サイトサービスを改善',
  ko: '사이트 서비스를 개선',
  pt: 'melhorar o serviço do site',
  ru: 'улучшать сервис сайта',
  sv: 'förbättra webbplatstjänsten',
  tr: 'site hizmetini iyileştirmek',
  uk: 'покращувати сервіс сайту',
  vi: 'cải thiện dịch vụ của trang web',
  zh: '改进网站服务',
});

const COOKIE_PURPOSE_MARKERS = Object.freeze({
  ...PURPOSE_MARKERS,
  ja: 'サイトをより使いやすくするため',
});

const ANALYTICS_RETENTION_MARKERS = Object.freeze({
  de: '14 Monate',
  en: '14 months',
  es: '14 meses',
  fr: '14 mois',
  he: '14 חודשים',
  hi: '14 महीने',
  it: '14 mesi',
  ja: '14か月',
  ko: '14개월',
  pt: '14 meses',
  ru: '14 месяцев',
  sv: '14 månader',
  tr: '14 ay',
  uk: '14 місяців',
  vi: '14 tháng',
  zh: '14 个月',
});

const COOKIE_MEANING_IDS = [
  'cookie-storage',
  'cookie-essential',
  'cookie-browser-storage',
  'cookie-analytics',
  'analytics-data-sent',
  'analytics-data-not-sent',
  'analytics-retention',
  'cookie-external-services',
  'cookie-controls',
];

const EXTERNAL_SERVICE_IDS = [
  'external-display-login',
  'external-enabled-features',
  'external-user-sharing',
];

const PRIVACY_MEANING_IDS = [
  'privacy-information-handled',
  'privacy-data-account',
  'privacy-data-content',
  'privacy-data-usage',
  'privacy-data-inquiry',
  'privacy-use-purposes',
  'privacy-cookie-external-summary',
];

const THIRD_PARTY_MARKERS = [
  'Google Analytics',
  'Google Fonts',
  'Google Identity Services',
  'LINE',
  'OneSignal',
  'Google Cloud Translation',
  'OpenAI',
  'X',
  'iOS',
];

const INTERNAL_IMPLEMENTATION_MARKERS = [
  'guest_refresh',
  'iseeetl_',
  'iseeetl:',
  'line_oauth_',
  '_ga',
  '/media',
  'HttpOnly',
  'localStorage',
  'sessionStorage',
  'Backend',
  'Capability',
  'Analytics configuration API',
  'Enhanced Measurement',
  'Reset user data on new activity',
  'browser history',
  'page_view',
  'product runtime',
];

const expectIdsInOrder = (html, locale, ids) => {
  let previousIndex = -1;
  ids.forEach((id) => {
    const occurrences = html.split(`id="${id}"`).length - 1;
    const index = html.indexOf(`id="${id}"`);
    expect(occurrences, `${locale}: ${id}の件数`).to.equal(1);
    expect(index, `${locale}: ${id}`).to.be.greaterThan(previousIndex);
    previousIndex = index;
  });
};

const expectSafeStaticHtml = (html, locale) => {
  expect(html, `${locale}: 記事`).not.to.match(/<article\b/iu);
  expect(html, `${locale}: h1の重複`).not.to.match(/<h1\b/iu);
  expect(html, `${locale}: スクリプト`).not.to.match(/<script\b/iu);
  expect(html, `${locale}: インラインのイベントハンドラ`).not.to.match(/\son[a-z]+\s*=/iu);
};

const readElementText = (html, locale, id) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  const element = root.querySelector(`#${id}`);
  expect(element, `${locale}: ${id}要素`).not.to.be.null;
  const text = element.textContent.replace(/\s+/gu, ' ').trim();
  expect(text, `${locale}: ${id}のテキスト`).not.to.equal('');
  return text;
};

const readIdRangeText = (html, locale, startId, endId) => {
  const startAttribute = html.indexOf(`id="${startId}"`);
  const endAttribute = html.indexOf(`id="${endId}"`, startAttribute + 1);
  expect(startAttribute, `${locale}: ${startId}の範囲の開始`).to.be.greaterThan(-1);
  expect(endAttribute, `${locale}: ${endId}の範囲の終了`).to.be.greaterThan(startAttribute);

  const start = html.lastIndexOf('<', startAttribute);
  const end = html.lastIndexOf('<', endAttribute);
  const root = document.createElement('div');
  root.innerHTML = html.slice(start, end);
  return root.textContent.replace(/\s+/gu, ' ').trim();
};

describe('公開するCookieポリシー', () => {
  it('全言語でCookie・ブラウザ保存領域・アクセス解析の説明に必要な項目がある', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const html = readContent(locale, 'cookie.html');

      expectIdsInOrder(html, locale, COOKIE_MEANING_IDS);
      expect(html.match(/<section\b/gu) ?? [], `${locale}: 4つの簡潔な節`).to.have.lengthOf(4);
      COOKIE_MEANING_IDS.forEach((id) => readElementText(html, locale, id));
      const analyticsRecipient = locale === 'ja' ? 'Google Analytics' : 'GA4';
      expect(readElementText(html, locale, 'analytics-data-sent'), `${locale}: アナリティクスの送信先`).to.include(
        analyticsRecipient
      );
      const pushControl = locale === 'ja' ? 'プッシュ通知' : 'Web Push';
      expect(readElementText(html, locale, 'cookie-controls'), `${locale}: プッシュ通知の設定`).to.include(pushControl);
      expect(
        readElementText(html, locale, 'analytics-retention'),
        `${locale}: アナリティクスの保存期間`
      ).to.include(ANALYTICS_RETENTION_MARKERS[locale]);
      expect(html, `${locale}: サイトのサービス改善`).to.include(COOKIE_PURPOSE_MARKERS[locale]);
      expect(html, `${locale}: Googleのプライバシーポリシー`).to.include('policies.google.com/privacy');
      expect(html, `${locale}: アナリティクスのパートナーポリシー`).to.include(
        'policies.google.com/technologies/partner-sites'
      );
      expect(html, `${locale}: 問い合わせ先`).to.include('href="/contact"');
      expect(html, `${locale}: 実装コードのマークアップ`).not.to.include('<code>');
      INTERNAL_IMPLEMENTATION_MARKERS.forEach((marker) => {
        expect(html, `${locale}: 内部用の目印${marker}`).not.to.include(marker);
      });
      expectSafeStaticHtml(html, locale);
    });
  });

  it('全言語で外部サービスと利用者が開始する共有について説明している', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const html = readContent(locale, 'cookie.html');

      expectIdsInOrder(html, locale, EXTERNAL_SERVICE_IDS);
      EXTERNAL_SERVICE_IDS.forEach((id) => readElementText(html, locale, id));
      const displayAndLogin = readIdRangeText(
        html,
        locale,
        'external-display-login',
        'external-enabled-features'
      );
      ['Google Fonts', 'Google Identity Services', 'LINE'].forEach((marker) => {
        expect(displayAndLogin, `${locale}: 表示・ログイン${marker}`).to.include(marker);
      });
      const enabledFeatures = readIdRangeText(
        html,
        locale,
        'external-enabled-features',
        'external-user-sharing'
      );
      ['OneSignal', 'Google Cloud Translation', 'OpenAI'].forEach((marker) => {
        expect(enabledFeatures, `${locale}: 有効な機能${marker}`).to.include(marker);
      });
      const userSharing = readIdRangeText(html, locale, 'external-user-sharing', 'cookie-controls');
      ['X', 'iOS'].forEach((marker) => {
        expect(userSharing, `${locale}: ユーザ間の共有${marker}`).to.include(marker);
      });
      THIRD_PARTY_MARKERS.forEach((marker) => {
        expect(html, `${locale}: ${marker}`).to.include(marker);
      });
    });
  });

  it('日本語のCookieポリシーにCookieと外部サービスの説明がある', () => {
    const html = readContent('ja', 'cookie.html');
    const sentData = readElementText(html, 'ja', 'analytics-data-sent');
    const dataNotSent = readElementText(html, 'ja', 'analytics-data-not-sent');

    expect(sentData).to.include('フロア、ルーム、タグ、単語ボタンの名称やこれらを区別するための情報');
    expect(sentData).to.include('本サービスのアカウントを区別する情報をそのまま送らず、分析用に置き換えて使用');
    expect(dataNotSent).to.include('本サービスのアカウントやゲスト利用を区別する情報そのもの');
    expect(sentData).not.to.include('Floor・Room・Tag・QuickText');
    [
      'アクセス解析が有効な環境',
      'GA4へ送信できない場合',
      'サイトサービス',
      '仮名の利用者識別情報',
      '生の利用者ID',
      '利用者ID',
      'ゲストID',
      '識別情報',
      '媒体',
      '通常の通信情報',
      'IPアドレス',
      'Google Fontsには画面表示時',
      'Googleログインが利用可能な画面で通信',
      '認証情報を処理',
      '各機能が有効',
      'ブラウザ保存領域',
    ].forEach((implementationPhrase) => {
      expect(html, `ja: ${implementationPhrase}`).not.to.include(implementationPhrase);
    });
    expect(html, 'ja: アナリティクスの目的を強調していない').not.to.include('<strong>');
  });

  it('全言語のプライバシーポリシーで取扱情報を示し、詳細はCookieポリシーへ案内する', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const html = readContent(locale, 'privacy.html');

      expectIdsInOrder(html, locale, PRIVACY_MEANING_IDS);
      PRIVACY_MEANING_IDS.forEach((id) => readElementText(html, locale, id));
      expect(html, `${locale}: Cookieポリシーのリンク`).to.include('href="/cookie"');
      expect(html, `${locale}: Google Analyticsの概要`).to.match(/Google\s+Analytics/u);
      expect(html, `${locale}: サイトのサービス改善`).to.include(PURPOSE_MARKERS[locale]);
      INTERNAL_IMPLEMENTATION_MARKERS.forEach((marker) => {
        expect(html, `${locale}: 内部用の目印${marker}`).not.to.include(marker);
      });
      expectSafeStaticHtml(html, locale);
    });
  });
});
