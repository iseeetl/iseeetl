import { expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { baseParse, NodeTypes } from '@vue/compiler-dom';
import { parse as parseSfc } from '@vue/compiler-sfc';

import { DEFAULT_GUEST_NAMES, resolveDefaultGuestName } from '@/constants/defaultGuestNames.js';
import { LANGUAGES } from '@/constants/languages.js';
import {
  createApplicationI18n,
  createI18nTranslator,
  localeMessages,
} from '@/i18n.js';

const USER_VISIBLE_STATIC_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'cancel-label',
  'confirm-label',
  'error-message',
  'label',
  'message',
  'placeholder',
  'title',
]);

const JAPANESE_TEXT = /[ぁ-んァ-ヶ一-龯]/u;
const LETTER_TEXT = /\p{L}/u;
const ALLOWED_LITERAL_TEMPLATE_TEXT = new Set(['Helvetica', 'ISeee', 'JSON', 'TimeLine']);

const MANAGEMENT_LIST_KEYS = [
  '一覧結果',
  '読み込み中です',
  '更新中です',
  'データがありません',
  '条件に一致するデータがありません',
  '前回取得した結果を表示しています',
  '再試行',
  '検索を実行',
  '検索条件をクリア',
  '全{total}件',
  '{current} / {last}ページ',
];

const BULK_DISPLAY_KEYS = [
  '全フロア表示',
  '全フロアを表示に変更しました',
  '全フロアの表示変更に失敗しました',
  '作成したフロアの全てを表示します',
  '全ルーム表示',
  '全ルームを表示に変更しました',
  '全ルームの表示変更に失敗しました',
  '現在のフロア内に存在する全てのルームを表示します',
];

const DEPRECATED_BULK_PUBLIC_KEYS = [
  '全フロア公開',
  '全フロアを公開に変更しました',
  '全フロアの公開変更に失敗しました',
  '作成したフロアの全てを公開します',
  '全ルーム公開',
  '全ルームを公開に変更しました',
  '全ルームの公開変更に失敗しました',
  '現在のフロア内に存在する全てのルームを公開します',
];

const ACCESSIBILITY_KEYS = [
  '画面を更新できませんでした',
  'ネットワーク接続を確認してから、再試行してください。',
  '新しい画面データを読み込めませんでした。再試行してください。',
  '対象の投稿へ移動',
  '対象の返信へ移動',
  '{title}の先頭へ移動',
];

const ROOM_DIALOG_UI_KEYS = [
  'このルームを削除しますか？',
  'フロアタグにないルームタグは一覧から外れます。',
  'ルームを作成',
  'ルームを削除',
  'ルームを編集',
  'ルームタグを作成',
  'ルームタグを編集',
  '削除すると一覧から外れ、通常操作ではこのルームとタイムラインを利用できなくなります。',
  '単語を削除',
  '単語グループを削除',
  '参加・投稿設定',
  '基本情報',
  '変更内容を破棄しますか？',
  '対象タグ',
  '対象設定',
  '画像',
  '表示・通知',
  'roomMemberDialogs.empty',
  'roomMemberDialogs.deleteMemberAria',
  'roomMemberDialogs.inviteUrl',
  'roomMemberDialogs.inviteCreated',
  'roomMemberDialogs.invitePeriodChanged',
  'roomMemberDialogs.deleteTitle',
  'roomMemberDialogs.targetMember',
];

const ROOM_DIALOG_DYNAMIC_KEYS = [
  'ルームタグ一覧',
  '対象ルーム',
  'ルームタグ',
  'フロアタグに戻す',
  'フロアタグへ戻しました',
  'フロアタグへ戻すのに失敗しました',
  'ルームタグの取得に失敗しました',
  'ルームタグを更新しました',
  'ルームタグを作成しました',
  'ルームタグの更新に失敗しました',
  'ルームタグの作成に失敗しました',
  'ルームタグを削除しました',
  'ルームタグの削除に失敗しました',
  'CSVファイルのインポートに失敗しました',
  'CSVファイルのエクスポートに失敗しました',
  '単語グループの取得に失敗しました',
  '単語グループを更新しました',
  '単語グループを作成しました',
  '単語を更新しました',
  '単語を作成しました',
  '単語グループの保存に失敗しました',
  '単語の保存に失敗しました',
  '単語グループの表示順番を更新しました',
  '単語グループの表示順番の更新に失敗しました',
  '単語の表示順番を更新しました',
  '単語の表示順番の更新に失敗しました',
  '単語グループを削除しました',
  '単語を削除しました',
  '単語グループの削除に失敗しました',
  '単語の削除に失敗しました',
];

const LOGIN_CONSENT_KEY =
  'メール・パスワードまたはGoogle、LINEログインすることで、{terms}、{privacy}及び{cookie}に同意したものとみなされます。';

const GUEST_CONSENT_KEY =
  'ゲストとして投稿、返信またはリアクションを行うことで、{terms}、{privacy}及び{cookie}に同意したものとみなされます。';

const DEPRECATED_GUEST_CONSENT_KEYS = [
  'ゲストとして投稿、返信またはリアクションを行うことで、利用許諾・著作権・禁止事項・免責事項、プライバシーポリシー及びCookieポリシーに同意したものとみなされます。',
];

const DEPRECATED_LOGIN_CONSENT_KEYS = [
  'GoogleまたはLINEでログインすることで、利用許諾・著作権・禁止事項・免責事項及びプライバシー・ポリシーに同意したとみなされます',
  '{provider}でログインすることで、利用許諾・著作権・禁止事項・免責事項及びプライバシー・ポリシーに同意したとみなされます',
];

const AI_ANALYSIS_SETTING_KEYS = [
  'actions',
  'cancel',
  'close',
  'conflictReloaded',
  'create',
  'createTitle',
  'delete',
  'deleteFailed',
  'deleteSettingAria',
  'deleted',
  'edit',
  'editSettingAria',
  'editTitle',
  'empty',
  'floorButton',
  'kind',
  'kindAudioScene',
  'kindConversation',
  'kindSpeech',
  'kindVideo',
  'kindVision',
  'loadFailed',
  'loadTagsFailed',
  'loading',
  'managementResultUser',
  'managementResultUserSearchFailed',
  'managementSelectResultUser',
  'menu',
  'prompt',
  'promptDescription',
  'promptSpeechDescription',
  'resultUser',
  'resultUserSearchButton',
  'resultUserSearchEmpty',
  'resultUserSearchFailed',
  'resultUserSearchHint',
  'resultUserSearchLabel',
  'resultUserSearchResults',
  'roomButton',
  'save',
  'saveFailed',
  'saved',
  'search',
  'selectKind',
  'selectResultUser',
  'selectTag',
  'selectedResultUser',
  'tag',
  'titleCommon',
  'titleCommonManagement',
  'titleFloor',
  'titleRoom',
  'validationInvalidKind',
  'validationPromptBytes',
  'validationPromptCodePoints',
  'validationRequired',
  'validationSearchLength',
  'validationSpeechPromptBytes',
];

const AI_ANALYSIS_MANAGEMENT_MENU_MESSAGES = {
  de: 'Verwaltung der KI-Analyseeinstellungen',
  en: 'AI Analysis Settings Management',
  es: 'Gestión de la configuración de análisis con IA',
  fr: 'Gestion des paramètres d’analyse IA',
  he: 'ניהול הגדרות ניתוח AI',
  hi: 'AI विश्लेषण सेटिंग प्रबंधन',
  it: 'Gestione delle impostazioni di analisi IA',
  ja: 'AI解析設定管理',
  ko: 'AI 분석 설정 관리',
  pt: 'Gerenciamento das configurações de análise por IA',
  ru: 'Управление настройками анализа ИИ',
  sv: 'Hantera inställningar för AI-analys',
  tr: 'Yapay zekâ analiz ayarları yönetimi',
  uk: 'Керування налаштуваннями аналізу ШІ',
  vi: 'Quản lý cài đặt phân tích AI',
  zh: 'AI 分析设置管理',
};

const TIMELINE_ACCESSIBILITY_MESSAGES = {
  de: ['Zum zugehörigen Beitrag springen', 'Zur zugehörigen Antwort springen', 'Zum Anfang von {title} springen'],
  en: ['Go to the related post', 'Go to the related reply', 'Go to the start of {title}'],
  es: ['Ir a la publicación relacionada', 'Ir a la respuesta relacionada', 'Ir al inicio de {title}'],
  fr: ['Accéder à la publication associée', 'Accéder à la réponse associée', 'Accéder au début de {title}'],
  he: ['מעבר לפוסט הקשור', 'מעבר לתגובה הקשורה', 'מעבר לתחילת {title}'],
  hi: ['संबंधित पोस्ट पर जाएँ', 'संबंधित जवाब पर जाएँ', '{title} की शुरुआत पर जाएँ'],
  it: ['Vai al post correlato', 'Vai alla risposta correlata', "Vai all'inizio di {title}"],
  ja: ['対象の投稿へ移動', '対象の返信へ移動', '{title}の先頭へ移動'],
  ko: ['관련 게시물로 이동', '관련 답글로 이동', '{title}의 시작으로 이동'],
  pt: ['Ir para a publicação relacionada', 'Ir para a resposta relacionada', 'Ir para o início de {title}'],
  ru: ['Перейти к связанному сообщению', 'Перейти к связанному ответу', 'Перейти к началу раздела «{title}»'],
  sv: ['Gå till det relaterade inlägget', 'Gå till det relaterade svaret', 'Gå till början av {title}'],
  tr: ['İlgili gönderiye git', 'İlgili yanıta git', '{title} başlangıcına git'],
  uk: ['Перейти до пов’язаного допису', 'Перейти до пов’язаної відповіді', 'Перейти до початку розділу «{title}»'],
  vi: ['Đi đến bài đăng liên quan', 'Đi đến câu trả lời liên quan', 'Đi đến đầu {title}'],
  zh: ['转到相关帖子', '转到相关回复', '转到 {title} 的开头'],
};

const placeholders = (message) =>
  [...new Set([...message.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]))].sort();

const flattenMessages = (messages, prefix = '') =>
  Object.entries(messages).reduce((result, [key, value]) => {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenMessages(value, pathKey));
    } else {
      result[pathKey] = value;
    }
    return result;
  }, {});

const getMessage = (messages, key) => {
  if (Object.prototype.hasOwnProperty.call(messages, key)) return messages[key];
  return key.split('.').reduce((value, segment) => value?.[segment], messages);
};

const collectSourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : collectSourceFiles(target);
    return /\.(?:js|vue)$/u.test(entry.name) ? [target] : [];
  });

const collectLiteralTranslationKeys = () => {
  const keys = new Set();
  const literalTranslation = /\$t\(\s*(['"])(.*?)\1/gu;
  collectSourceFiles(path.resolve(process.cwd(), 'src')).forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(literalTranslation)) keys.add(match[2]);
  });
  return [...keys];
};

const collectHardcodedVueTemplateText = () => {
  const findings = [];
  collectSourceFiles(path.resolve(process.cwd(), 'src'))
    .filter((file) => file.endsWith('.vue'))
    .forEach((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const { descriptor, errors } = parseSfc(source, { filename: file });
      expect(errors, file).to.deep.equal([]);
      if (!descriptor.template) return;

      const lineOffset = descriptor.template.loc.start.line - 1;
      const visit = (node) => {
        if (
          node.type === NodeTypes.TEXT &&
          LETTER_TEXT.test(node.content) &&
          !ALLOWED_LITERAL_TEMPLATE_TEXT.has(node.content.trim())
        ) {
          findings.push(`${path.relative(process.cwd(), file)}:${node.loc.start.line + lineOffset}`);
        }
        if (
          node.type === NodeTypes.INTERPOLATION &&
          JAPANESE_TEXT.test(node.content.content) &&
          !node.content.content.includes('$t(')
        ) {
          findings.push(`${path.relative(process.cwd(), file)}:${node.loc.start.line + lineOffset}`);
        }
        if (node.type === NodeTypes.ELEMENT) {
          node.props.forEach((prop) => {
            if (
              prop.type === NodeTypes.ATTRIBUTE &&
              USER_VISIBLE_STATIC_ATTRIBUTES.has(prop.name) &&
              prop.value &&
              LETTER_TEXT.test(prop.value.content)
            ) {
              findings.push(`${path.relative(process.cwd(), file)}:${prop.loc.start.line + lineOffset}`);
            }
            if (
              prop.type === NodeTypes.DIRECTIVE &&
              prop.name === 'bind' &&
              prop.arg?.isStatic &&
              USER_VISIBLE_STATIC_ATTRIBUTES.has(prop.arg.content) &&
              prop.exp &&
              JAPANESE_TEXT.test(prop.exp.content) &&
              !prop.exp.content.includes('$t(')
            ) {
              findings.push(`${path.relative(process.cwd(), file)}:${prop.loc.start.line + lineOffset}`);
            }
          });
        }
        if (Array.isArray(node.children)) node.children.forEach(visit);
      };
      visit(baseParse(descriptor.template.content, { comments: false }));
    });
  return findings;
};

describe('多言語対応の設定と翻訳文', () => {
  it('LANGUAGESの全言語を静的mapへ一度ずつ登録する', () => {
    const languageValues = LANGUAGES.map((language) => language.value);

    expect(Object.keys(localeMessages).sort()).to.deep.equal([...languageValues].sort());
    languageValues.forEach((locale) => {
      expect(localeMessages[locale]).to.be.an('object');
      expect(Object.keys(localeMessages[locale]).length).to.be.greaterThan(0);
    });
  });

  it('Compositionモードで生成し、翻訳がない場合は日本語を使う', () => {
    const i18n = createApplicationI18n({ locale: 'en' });

    expect(i18n.mode).to.equal('composition');
    expect(i18n.global.locale.value).to.equal('en');
    expect(i18n.global.fallbackLocale.value).to.equal('ja');
  });

  it('言語切替とタイトルの翻訳で同じi18nインスタンスを使う', () => {
    const i18n = createApplicationI18n();
    const translate = createI18nTranslator(i18n);
    const key = 'アイシータイムライン';

    expect(translate(key)).to.equal(localeMessages.ja[key]);
    i18n.global.locale.value = 'en';
    expect(translate(key)).to.equal(localeMessages.en[key]);
  });

  it('複数形を持つ言語設定で件数に対応する文言を選ぶ', () => {
    const i18n = createApplicationI18n({ locale: 'en' });
    const key = '{count}人の参加者';

    expect(i18n.global.t(key, { count: '1' }, 1)).to.equal('1 participant');
    expect(i18n.global.t(key, { count: '2' }, 2)).to.equal('2 participants');

    i18n.global.locale.value = 'ru';
    expect(i18n.global.t(key, { count: '1' }, 1)).to.equal('1 участник');
    expect(i18n.global.t(key, { count: '2' }, 2)).to.equal('2 участника');
    expect(i18n.global.t(key, { count: '5' }, 5)).to.equal('5 участников');
    expect(i18n.global.t(key, { count: '21' }, 21)).to.equal('21 участник');
  });

  it('起動前の既定ゲスト名を辞書と一致させ、未知の言語には日本語を使う', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      expect(DEFAULT_GUEST_NAMES[locale], locale).to.equal(localeMessages[locale]['ゲスト']);
      expect(resolveDefaultGuestName(locale), locale).to.equal(localeMessages[locale]['ゲスト']);
    });
    expect(resolveDefaultGuestName('unknown')).to.equal(localeMessages.ja['ゲスト']);
  });

  it('全言語に通知許可再設定messageがある', () => {
    const key = 'ブラウザ設定から通知許可を再設定してください';

    LANGUAGES.forEach(({ value }) => {
      expect(localeMessages[value][key]).to.be.a('string').and.not.equal('');
    });
  });

  it('全言語に復旧画面とタイムライン操作のアクセシビリティmessageがある', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      ACCESSIBILITY_KEYS.forEach((key) => {
        const message = localeMessages[locale][key];
        expect(message, `${locale}: ${key}`).to.be.a('string').and.not.equal('');
        expect(placeholders(message), `${locale}: ${key}`).to.deep.equal(placeholders(key));
      });
    });
  });

  it('全言語にルームダイアログの固定キーと動的参照キーがある', () => {
    const keys = [...ROOM_DIALOG_UI_KEYS, ...ROOM_DIALOG_DYNAMIC_KEYS];

    LANGUAGES.forEach(({ value: locale }) => {
      keys.forEach((key) => {
        const message = getMessage(localeMessages[locale], key);
        const reference = getMessage(localeMessages.ja, key);
        expect(message, `${locale}: ${key}`).to.be.a('string').and.not.equal('');
        expect(placeholders(message), `${locale}: ${key}`).to.deep.equal(placeholders(reference));
      });
    });
  });

  it('全言語でログイン画面同意文の3リンクplaceholderを各1回保持する', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const message = localeMessages[locale][LOGIN_CONSENT_KEY];
      expect(message, locale).to.be.a('string').and.not.equal('');
      expect(
        [...message.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]).sort(),
        locale
      ).to.deep.equal(['cookie', 'privacy', 'terms']);
      DEPRECATED_LOGIN_CONSENT_KEYS.forEach((key) => {
        expect(localeMessages[locale], `${locale}: ${key}`).not.to.have.property(key);
      });
    });
  });

  it('全言語でゲスト同意文の3リンクplaceholderを各1回保持する', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const message = localeMessages[locale][GUEST_CONSENT_KEY];
      expect(message, locale).to.be.a('string').and.not.equal('');
      expect(
        [...message.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]).sort(),
        locale
      ).to.deep.equal(['cookie', 'privacy', 'terms']);
      DEPRECATED_GUEST_CONSENT_KEYS.forEach((key) => {
        expect(localeMessages[locale], `${locale}: ${key}`).not.to.have.property(key);
      });
    });
  });

  it('タイムラインの3つの操作名が所定の翻訳と一致する', () => {
    const keys = ACCESSIBILITY_KEYS.slice(3);
    Object.entries(TIMELINE_ACCESSIBILITY_MESSAGES).forEach(([locale, expected]) => {
      expect(keys.map((key) => localeMessages[locale][key]), locale).to.deep.equal(expected);
    });
  });

  it('全言語に管理一覧共通の11キーと同じplaceholderがある', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      MANAGEMENT_LIST_KEYS.forEach((key) => {
        const message = localeMessages[locale][key];
        expect(message, `${locale}: ${key}`).to.be.a('string').and.not.equal('');
        expect(placeholders(message), `${locale}: ${key}`).to.deep.equal(placeholders(key));
      });
    });
  });

  it('共通タグCSV確認の対象ファイルと対象件数を全言語で表示できる', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const namespace = localeMessages[locale].managementUi;
      expect(namespace.importFileLabel, `${locale}: managementUi.importFileLabel`)
        .to.be.a('string')
        .and.not.equal('');
      expect(namespace.importCountLabel, `${locale}: managementUi.importCountLabel`)
        .to.be.a('string')
        .and.not.equal('');
      expect(placeholders(namespace.importPreviewCount), `${locale}: managementUi.importPreviewCount`)
        .to.deep.equal(['count']);
    });

    expect(localeMessages.ja.managementUi.importFileLabel).to.equal('インポートファイル');
    expect(localeMessages.ja.managementUi.importCountLabel).to.equal('対象件数');
  });

  it('フロアとルームの一括操作を公開ではなく表示として翻訳する', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      BULK_DISPLAY_KEYS.forEach((key) => {
        expect(localeMessages[locale][key], `${locale}: ${key}`).to.be.a('string').and.not.equal('');
      });
      DEPRECATED_BULK_PUBLIC_KEYS.forEach((key) => {
        expect(localeMessages[locale], `${locale}: ${key}`).not.to.have.property(key);
      });
    });
  });

  it('全言語にAI解析設定のキーと対応する置換項目がある', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const namespace = localeMessages[locale].aiAnalysisSettings;
      expect(namespace, locale).to.be.an('object');
      expect(Object.keys(namespace).sort(), locale).to.deep.equal(AI_ANALYSIS_SETTING_KEYS);
      AI_ANALYSIS_SETTING_KEYS.forEach((key) => {
        const message = namespace[key];
        expect(message, `${locale}: aiAnalysisSettings.${key}`).to.be.a('string').and.not.equal('');
        expect(placeholders(message), `${locale}: aiAnalysisSettings.${key}`).to.deep.equal(
          placeholders(localeMessages.ja.aiAnalysisSettings[key])
        );
      });
    });
  });

  it('通常プロンプトの補足は全言語で文字数だけを案内する', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const message = localeMessages[locale].aiAnalysisSettings.promptDescription;
      expect(placeholders(message), locale).to.deep.equal(['codePoints']);
      expect(message, locale).not.to.include('UTF-8');
    });
  });

  it('解析結果の投稿者の項目名と検索結果を日本語で明確に表示する', () => {
    expect(localeMessages.ja.aiAnalysisSettings.resultUser).to.equal('解析結果の投稿者');
    expect(localeMessages.ja.aiAnalysisSettings.resultUserSearchLabel).to.equal(
      '解析結果の投稿者'
    );
    expect(localeMessages.ja.aiAnalysisSettings.prompt).to.equal('追加指示');
    expect(localeMessages.ja.aiAnalysisSettings.resultUserSearchResults).to.equal('検索結果');
    expect(localeMessages.ja.aiAnalysisSettings.search).to.equal('検索');
  });

  it('管理画面とフロア・ルーム設定で解析結果の投稿者の日本語を統一する', () => {
    expect(localeMessages.ja.aiAnalysisSettings.managementResultUser).to.equal(
      '付加情報を行うユーザ'
    );
    expect(localeMessages.ja.aiAnalysisSettings.managementSelectResultUser).to.equal(
      '付加情報を行うユーザを選択してください'
    );
    expect(localeMessages.ja.aiAnalysisSettings.managementResultUserSearchFailed).to.equal(
      '付加情報を行うユーザを検索できませんでした'
    );
  });

  it('全言語にAI解析設定管理のメニュー名がある', () => {
    const locales = LANGUAGES.map(({ value }) => value).sort();

    expect(Object.keys(AI_ANALYSIS_MANAGEMENT_MENU_MESSAGES).sort()).to.deep.equal(locales);
    LANGUAGES.forEach(({ value: locale }) => {
      expect(localeMessages[locale].aiAnalysisSettings.menu, locale).to.equal(
        AI_ANALYSIS_MANAGEMENT_MENU_MESSAGES[locale]
      );
    });
  });

  it('チュートリアルのAI解析の見出しを特定の解析種別に限定しない', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      expect(localeMessages[locale]['AI解析機能'], locale).to.be.a('string').and.not.equal('');
      expect(localeMessages[locale]['AI による画像、動画、音声解析機能'], locale).to.equal(undefined);
    });
  });

  it('日本語の全実行時キーが全言語に存在し、空値とplaceholder不整合がない', () => {
    const referenceMessages = flattenMessages(localeMessages.ja);
    const referenceKeys = Object.keys(referenceMessages);

    LANGUAGES.forEach(({ value: locale }) => {
      referenceKeys.forEach((key) => {
        const message = getMessage(localeMessages[locale], key);
        expect(message, `${locale}: ${key}`).to.be.a('string');
        expect(message.trim(), `${locale}: ${key}`).not.to.equal('');
        expect(placeholders(message), `${locale}: ${key}`).to.deep.equal(placeholders(referenceMessages[key]));
      });
    });
  });

  it('全言語に区切り見出しキーと空の翻訳がない', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      const messages = flattenMessages(localeMessages[locale]);
      expect(Object.keys(messages).some((key) => key.includes('***')), locale).to.equal(false);
      Object.entries(messages).forEach(([key, message]) => {
        expect(message, `${locale}: ${key}`).to.be.a('string');
        expect(message.trim(), `${locale}: ${key}`).not.to.equal('');
      });
    });
  });

  it('全言語の辞書にリクエストログ管理のキーがない', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      expect(localeMessages[locale], locale).not.to.have.property('ログ管理');
    });
  });

  it('ソースコードで直接使用する翻訳キーが日本語辞書に存在する', () => {
    collectLiteralTranslationKeys().forEach((key) => {
      expect(getMessage(localeMessages.ja, key), key).to.be.a('string');
    });
  });

  it('Vueテンプレートに未翻訳の固定本文と利用者向け静的属性を置かない', () => {
    expect(collectHardcodedVueTemplateText()).to.deep.equal([]);
  });

  it('成功・失敗や前後移動を表す文言を同一翻訳にしない', () => {
    const distinctKeyPairs = [
      ['フロアを更新しました', 'フロアの更新に失敗しました'],
      ['パスワード再設定メールを送信しました', 'パスワード再設定メールの送信に失敗しました'],
      ['フロアメンバーの脱退に失敗しました', 'クリップボードへのコピーに失敗しました'],
      ['前のページ', '最初のページ'],
    ];

    LANGUAGES.forEach(({ value: locale }) => {
      distinctKeyPairs.forEach(([first, second]) => {
        expect(localeMessages[locale][first], `${locale}: ${first}`).not.to.equal(localeMessages[locale][second]);
      });
    });
  });
});
