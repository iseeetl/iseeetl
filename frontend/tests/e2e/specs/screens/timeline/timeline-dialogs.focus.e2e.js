const { requireEnv, loginToTimeline } = require('../../helpers/login');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const {
  clickSingleVisibleAfterExactControls,
  openDialogByTrigger,
  waitForDialogClosed,
  assertDialogKeyboardBehavior,
} = require('../../helpers/dialog-focus');

const getRoleCredentials = (options = {}) => {
  const mailKey = options.mailKey || 'E2E_USER_MAIL';
  const passwordKey = options.passwordKey || 'E2E_USER_PASSWORD';
  return {
    mail: requireEnv(mailKey),
    password: requireEnv(passwordKey),
  };
};

const getEditorCredentials = () =>
  getRoleCredentials({
    mailKey: 'E2E_FLOOR_EDITOR_MAIL',
    passwordKey: 'E2E_FLOOR_EDITOR_PASSWORD',
  });

const waitForTimelineReady = (browser) => {
  browser.waitForElementPresent('[data-testid="timeline-connected"]', 20000);
};

const assertMountedDialogAriaReferences = (browser, label) => {
  browser.execute(
    function () {
      const panels = Array.from(document.querySelectorAll('[role="dialog"]'));
      const failures = [];
      const countId = (root, id) =>
        Array.from(root.querySelectorAll('[id]')).filter((element) => element.id === id).length;

      panels.forEach((panel, index) => {
        const titleId = panel.getAttribute('aria-labelledby') || '';
        const descriptionIds = (panel.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        const panelLabel = panel.getAttribute('data-testid') || titleId || `dialog-${index}`;
        const referenceIds = titleId ? [titleId].concat(descriptionIds) : descriptionIds;

        if (!titleId) {
          failures.push(`${panelLabel}:missing-aria-labelledby`);
        }
        referenceIds.forEach((id) => {
          const panelCount = countId(panel, id);
          const documentCount = countId(document, id);
          if (panelCount !== 1 || documentCount !== 1) {
            failures.push(`${panelLabel}:${id}:panel=${panelCount}:document=${documentCount}`);
          }
        });
      });

      return { dialogCount: panels.length, failures };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { dialogCount: 0, failures: ['execute-failed'] };
      browser.assert.ok(state.dialogCount > 0, `タイムラインのダイアログが描画されています（${label}）。`);
      browser.assert.ok(
        state.failures.length === 0,
        `タイムラインのダイアログのARIAの参照先がそれぞれ1件です（${label}）: ${JSON.stringify(state.failures)}`
      );
    }
  );
  assertAccessibilityIntegrity(browser, {
    rootSelector: '.timeline-page',
    label: `描画されたタイムラインの画面（${label}）`,
  });
};

const closeSoundCautionIfVisible = (browser) => {
  browser.execute(
    function () {
      const dialog = document.querySelector('[data-testid="dialog-sound-caution"]');
      return Boolean(dialog && dialog.getClientRects().length);
    },
    [],
    (result) => {
      if (result && result.value) {
        clickSingleVisibleAfterExactControls(browser, {
          anchorSelector: '#sound_caution_confirm_title',
          submitSelector: '[data-testid="dialog-sound-caution-confirm"]',
          expectedControls: [],
          label: '音声に関する注意を確認',
        });
        browser.waitForElementNotVisible('[data-testid="dialog-sound-caution"]', 10000);
      }
    }
  );
};

const waitForXpathVisible = (browser, xpath, label) => {
  browser.useXpath().waitForElementVisible(xpath, 10000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `要素が表示されていません${label ? ` (${label})` : ''}: ${xpath}`);
    }
  });
  browser.useCss();
};

const openDialogFromXpath = (browser, triggerXpath, dialogSelector, label) => {
  browser.useXpath().waitForElementVisible(triggerXpath, 10000);
  browser.click(triggerXpath);
  browser.useCss().waitForElementVisible(dialogSelector, 10000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `ダイアログが開きませんでした${label ? ` (${label})` : ''}: ${dialogSelector}`);
    }
  });
};

const submitDialogBySelector = (
  browser,
  { anchorSelector, submitSelector, dialogSelector, inputSelector, expectedValue, label }
) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector,
    submitSelector,
    expectedControls: [{ selector: inputSelector, value: expectedValue }],
    label,
  });
  waitForDialogClosed(browser, dialogSelector, label);
};

const createPost = (browser, text) => {
  openDialogByTrigger(browser, '[data-testid="timeline-post-button"]', '[data-testid="dialog-edit-post"]', '投稿');
  browser.clearValue('#post_content').setValue('#post_content', text);
  submitDialogBySelector(browser, {
    anchorSelector: '#edit_post_dialog_title',
    submitSelector: '[data-testid="dialog-edit-post-submit"]',
    dialogSelector: '[data-testid="dialog-edit-post"]',
    inputSelector: '#post_content',
    expectedValue: text,
    label: '投稿を送信',
  });
};

const createReply = (browser, postXpath, text) => {
  openDialogFromXpath(
    browser,
    `${postXpath}//button[@data-testid='timeline-post-reply-button']`,
    '[data-testid="dialog-edit-reply"]',
    '返信'
  );
  browser.clearValue('#reply_content').setValue('#reply_content', text);
  submitDialogBySelector(browser, {
    anchorSelector: '#edit_reply_dialog_title',
    submitSelector: '[data-testid="dialog-edit-reply-submit"]',
    dialogSelector: '[data-testid="dialog-edit-reply"]',
    inputSelector: '#reply_content',
    expectedValue: text,
    label: '返信を送信',
  });
};

const createSupplementFromPost = (browser, postXpath, text) => {
  openDialogFromXpath(
    browser,
    `${postXpath}//button[@data-testid='timeline-post-supplement-button']`,
    '[data-testid="dialog-edit-supplement"]',
    '付加情報'
  );
  browser.clearValue('#supplement_content').setValue('#supplement_content', text);
  submitDialogBySelector(browser, {
    anchorSelector: '#edit_supplement_dialog_title',
    submitSelector: '[data-testid="dialog-edit-supplement-submit"]',
    dialogSelector: '[data-testid="dialog-edit-supplement"]',
    inputSelector: '#supplement_content',
    expectedValue: text,
    label: '付加情報を送信',
  });
};

const assertTagTargetReady = (browser, text) => {
  browser.execute(
    function (targetText) {
      const articles = Array.from(document.querySelectorAll('article')).filter((article) => {
        const textNode = article.querySelector('.text');
        return textNode && textNode.textContent && textNode.textContent.includes(targetText);
      });
      return {
        timelineFound: !!document.querySelector('.timeline-page'),
        matchingArticleCount: articles.length,
        tagButtonCount: articles.reduce(
          (count, article) => count + article.querySelectorAll('[data-testid="timeline-post-tag-button"]').length,
          0
        ),
      };
    },
    [text],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(
        state.timelineFound &&
          state.matchingArticleCount > 0 &&
          state.tagButtonCount > 0,
        `タグの対象が引き続き編集可能です: ${JSON.stringify(state)}`
      );
    }
  );
};

const runTimelineDialogFocus = (browser, credentials, tagAuthorCredentials) => {
  const stamp = String(Date.now()).slice(-6);
  const postText = `E2E Focus Post ${stamp}`;
  const tagPostText = `E2E Focus Tag Post ${stamp}`;
  const replyText = `E2E Focus Reply ${stamp}`;
  const supplementText = `E2E Focus Supplement ${stamp}`;

  const postXpath = `//article[.//div[contains(@class,'text') and contains(., "${postText}")]]`;
  const tagPostXpath = `//article[.//div[contains(@class,'text') and contains(., "${tagPostText}")]]`;
  const replyXpath = `//article[contains(@class,'wrapper')][.//div[contains(@class,'text') and contains(., "${replyText}")]]`;
  const supplementXpath =
    "//article[contains(@class,'supplement')][.//div[contains(@class,'supplement-content') and contains(., '" +
    supplementText +
    "')]]";

  loginToTimeline(browser, {
    ...tagAuthorCredentials,
    floorId: credentials.floorId,
    roomId: credentials.roomId,
  });
  waitForTimelineReady(browser);
  assertMountedDialogAriaReferences(browser, 'タグの投稿者のタイムライン');
  closeSoundCautionIfVisible(browser);
  createPost(browser, tagPostText);
  waitForXpathVisible(browser, tagPostXpath, 'タグの対象投稿を作成');

  loginToTimeline(browser, credentials);
  waitForTimelineReady(browser);
  assertMountedDialogAriaReferences(browser, '権限別のタイムライン');
  closeSoundCautionIfVisible(browser);
  waitForXpathVisible(browser, tagPostXpath, 'タグの対象投稿を表示');

  openDialogByTrigger(browser, '[data-testid="timeline-post-button"]', '[data-testid="dialog-edit-post"]', '投稿を編集');
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-edit-post"]', '投稿を編集');

  createPost(browser, postText);
  waitForXpathVisible(browser, postXpath, '投稿を作成');

  openDialogFromXpath(
    browser,
    `${postXpath}//button[@data-testid='timeline-post-edit-button']`,
    '[data-testid="dialog-edit-post"]',
    '項目から投稿を編集'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-edit-post"]', '項目から投稿を編集');

  openDialogFromXpath(
    browser,
    `${postXpath}//button[@data-testid='timeline-post-delete-button']`,
    '[data-testid="dialog-delete-post"]',
    '投稿を削除'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-delete-post"]', '投稿を削除');

  openDialogFromXpath(
    browser,
    `${postXpath}//button[@data-testid='timeline-post-reply-button']`,
    '[data-testid="dialog-edit-reply"]',
    '返信'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-edit-reply"]', '返信');

  createReply(browser, postXpath, replyText);
  waitForXpathVisible(browser, replyXpath, '返信を作成');

  openDialogFromXpath(
    browser,
    `${replyXpath}//button[@data-testid='timeline-reply-edit-button']`,
    '[data-testid="dialog-edit-reply"]',
    '返信を編集'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-edit-reply"]', '返信を編集');

  openDialogFromXpath(
    browser,
    `${replyXpath}//button[@data-testid='timeline-reply-delete-button']`,
    '[data-testid="dialog-delete-reply"]',
    '返信を削除'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-delete-reply"]', '返信を削除');

  openDialogFromXpath(
    browser,
    `${postXpath}//button[@data-testid='timeline-post-supplement-button']`,
    '[data-testid="dialog-edit-supplement"]',
    '付加情報'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-edit-supplement"]', '付加情報');

  createSupplementFromPost(browser, postXpath, supplementText);
  waitForXpathVisible(browser, supplementXpath, '付加情報を作成');

  openDialogFromXpath(
    browser,
    `${supplementXpath}//button[@data-testid='timeline-supplement-edit-button']`,
    '[data-testid="dialog-edit-supplement"]',
    '付加情報を編集'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-edit-supplement"]', '付加情報を編集');

  openDialogFromXpath(
    browser,
    `${supplementXpath}//button[@data-testid='timeline-supplement-delete-button']`,
    '[data-testid="dialog-delete-supplement"]',
    '付加情報を削除'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-delete-supplement"]', '付加情報を削除');

  assertTagTargetReady(browser, tagPostText);
  openDialogFromXpath(
    browser,
    `${tagPostXpath}//button[@data-testid='timeline-post-tag-button']`,
    '[data-testid="dialog-edit-tag"]',
    'タグを編集'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-edit-tag"]', 'タグを編集');

  openDialogByTrigger(browser, '[data-testid="timeline-filter-button"]', '[data-testid="dialog-filter"]', 'フィルタ');
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-filter"]', 'フィルタ');

  openDialogByTrigger(
    browser,
    '[data-testid="timeline-sound-tag-button"]',
    '[data-testid="dialog-sound-tag"]',
    '音を鳴らすタグ'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-sound-tag"]', '音を鳴らすタグ');

  openDialogByTrigger(
    browser,
    '[data-testid="timeline-setting-button"]',
    '[data-testid="dialog-timeline-setting"]',
    'タイムライン設定'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-timeline-setting"]', 'タイムライン設定');

  openDialogByTrigger(
    browser,
    '[data-testid="timeline-room-info-button"]',
    '[data-testid="dialog-room-info"]',
    'ルーム情報'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-room-info"]', 'ルーム情報');

  openDialogByTrigger(
    browser,
    '[data-testid="timeline-speech-toggle-button"]',
    '[data-testid="dialog-speech"]',
    '読み上げ'
  );
  assertDialogKeyboardBehavior(browser, '[data-testid="dialog-speech"]', '読み上げ');

  closeSoundCautionIfVisible(browser);
};

const runWithPreparedFloorRoom = (browser, fixtureLabel, roleCredentials, tagAuthorCredentials) => {
  const editorCredentials = getEditorCredentials();

  const stamp = String(Date.now()).slice(-6);
  const floorTitle = `E2E Timeline Focus Floor ${fixtureLabel} ${stamp}`;
  const roomTitle = `E2E Timeline Focus Room ${fixtureLabel} ${stamp}`;
  const state = prepareFloorRoom(browser, {
    editorMail: editorCredentials.mail,
    editorPassword: editorCredentials.password,
    floorTitle,
    roomTitle,
    targetLangs: [],
    logoutAfter: true,
  });

  browser.perform((done) => {
    if (!state.floorId || !state.roomId) {
      browser.assert.ok(false, 'テスト用のフロアIDまたはルームIDを取得できませんでした。');
      done();
      return;
    }
    runTimelineDialogFocus(
      browser,
      {
        mail: roleCredentials.mail,
        password: roleCredentials.password,
        floorId: state.floorId,
        roomId: state.roomId,
      },
      tagAuthorCredentials
    );
    done();
  });

  browser.end();
};

module.exports = {
  '一般ユーザがタイムラインのダイアログをキーボードで操作できる': (browser) => {
    const fixtureLabel = 'Timeline dialogs keyboard behavior (user)';
    const credentials = getRoleCredentials();
    const tagAuthorCredentials = getEditorCredentials();
    runWithPreparedFloorRoom(browser, fixtureLabel, credentials, tagAuthorCredentials);
  },

  'フロア編集ユーザがタイムラインのダイアログをキーボードで操作できる': (browser) => {
    const fixtureLabel = 'Timeline dialogs keyboard behavior (floor editor)';
    const credentials = getRoleCredentials({
      mailKey: 'E2E_FLOOR_EDITOR_MAIL',
      passwordKey: 'E2E_FLOOR_EDITOR_PASSWORD',
    });
    const tagAuthorCredentials = getRoleCredentials();
    runWithPreparedFloorRoom(browser, fixtureLabel, credentials, tagAuthorCredentials);
  },

  '管理者がタイムラインのダイアログをキーボードで操作できる': (browser) => {
    const fixtureLabel = 'Timeline dialogs keyboard behavior (admin)';
    const credentials = getRoleCredentials({
      mailKey: 'E2E_ADMIN_MAIL',
      passwordKey: 'E2E_ADMIN_PASSWORD',
    });
    const tagAuthorCredentials = getRoleCredentials();
    runWithPreparedFloorRoom(browser, fixtureLabel, credentials, tagAuthorCredentials);
  },
};
