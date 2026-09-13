const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');
const { requireEnv } = require('../../helpers/login');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const DIALOG_CLOSE_TIMEOUT_MS = 15000;

const collectDialogDiagnostics = (browser, dialogSelector, callback) => {
  browser.execute(
    function (selector) {
      const getText = (node) => (node ? node.textContent.trim() : '');
      const dialog = document.querySelector(selector);
      const isVisible = dialog ? !!(dialog.offsetParent || dialog.getClientRects().length) : false;
      const submitButton = dialog ? dialog.querySelector('[data-testid$="-submit"]') : null;
      const errors = Array.from(document.querySelectorAll('[role="alert"]'))
        .map((node) => node.textContent.trim())
        .filter(Boolean);
      let storeError = null;
      try {
        const raw = localStorage.getItem('iseeetl_store');
        if (raw) {
          const data = JSON.parse(raw);
          storeError = data && data.error ? data.error.message || null : null;
        }
      } catch (err) {
        storeError = null;
      }
      return {
        url: window.location.href,
        dialogVisible: isVisible,
        dialogText: dialog ? dialog.textContent.trim().slice(0, 160) : '',
        submitTestId: submitButton ? submitButton.getAttribute('data-testid') : null,
        submitDisabled: submitButton ? submitButton.hasAttribute('disabled') : null,
        alertText: getText(document.querySelector('.screen-reader-only[role="alert"]')),
        snackbarText: getText(document.querySelector('[data-testid="app-snackbar"] span')),
        formErrors: errors,
        storeError,
      };
    },
    [dialogSelector],
    (result) => {
      const diagnostics = result && result.value ? result.value : {};
      callback(diagnostics);
    }
  );
};

const reportDialogFailure = (browser, label, diagnostics) => {
  const suffix = label ? ` (${label})` : '';
  browser.assert.ok(false, `ダイアログが閉じませんでした${suffix}: ${JSON.stringify(diagnostics)}`);
};

const waitForDialogToClose = (browser, dialogSelector, label) => {
  browser.useCss().waitForElementNotVisible(dialogSelector, DIALOG_CLOSE_TIMEOUT_MS, false);
  collectDialogDiagnostics(browser, dialogSelector, (diagnostics) => {
    if (diagnostics.dialogVisible) {
      reportDialogFailure(browser, label, diagnostics);
    }
  });
};

const clickFirstVisible = clickSingleVisible;

const clickFirstVisibleXpath = (browser, xpath, label) => {
  browser.execute(
    function (expr) {
      const result = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const candidates = [];
      for (let i = 0; i < result.snapshotLength; i += 1) {
        const node = result.snapshotItem(i);
        if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.disabled || node.getAttribute('aria-disabled') === 'true') continue;
        const style = window.getComputedStyle(node);
        if (!style || style.display === 'none' || style.visibility === 'hidden') continue;
        if (!(node.offsetParent || node.getClientRects().length)) continue;
        candidates.push(node);
      }
      if (candidates.length !== 1) return { clicked: false, count: candidates.length };
      candidates[0].click();
      return { clicked: true, count: 1 };
    },
    [xpath],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, count: -1 };
      const suffix = label ? ` (${label})` : '';
      browser.assert.ok(
        state.clicked && state.count === 1,
        `表示中で有効なダイアログを開くボタンが1件だけあります${suffix}: ${xpath}（count: ${state.count}）`
      );
    }
  );
};

const openDialogFromCss = (browser, triggerSelector, dialogSelector) => {
  browser
    .useCss()
    .waitForElementVisible(triggerSelector, 10000)
    .perform((done) => {
      clickFirstVisible(browser, triggerSelector, '開く');
      done();
    })
    .waitForElementVisible(dialogSelector, 10000, false, (result) => {
      if (typeof result.status === 'number' && result.status !== 0) {
        clickFirstVisible(browser, triggerSelector, '再試行');
        browser.waitForElementVisible(dialogSelector, 10000);
      }
    });
};

const openDialogFromXpath = (browser, triggerXpath, dialogSelector) => {
  browser
    .useXpath()
    .waitForElementVisible(triggerXpath, 10000)
    .perform((done) => {
      clickFirstVisibleXpath(browser, triggerXpath, 'open');
      done();
    })
    .useCss()
    .waitForElementVisible(dialogSelector, 10000, false, (result) => {
      if (typeof result.status === 'number' && result.status !== 0) {
        clickFirstVisibleXpath(browser, triggerXpath, 'retry');
        browser.useCss().waitForElementVisible(dialogSelector, 10000);
      }
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

const waitForTimelineReady = (browser) => {
  browser.waitForElementPresent('[data-testid="timeline-connected"]', 20000);
};

const submitExactContentDialog = (
  browser,
  { anchorSelector, submitSelector, inputSelector, expectedValue, label }
) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector,
    submitSelector,
    expectedControls: [{ selector: inputSelector, value: expectedValue }],
    label,
  });
};

const confirmExactDialog = (browser, { anchorSelector, submitSelector, label }) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector,
    submitSelector,
    expectedControls: [],
    label,
  });
};

const runCrudFlow = (
  browser,
  postXpath,
  postEditedXpath,
  replyXpath,
  replyEditedXpath,
  supplementXpath,
  supplementEditedXpath,
  postText,
  postTextEdited,
  replyText,
  replyTextEdited,
  supplementText,
  supplementTextEdited
) => {
  openDialogFromCss(browser, '[data-testid="timeline-post-button"]', '[data-testid="dialog-edit-post"]');
  browser.clearValue('#post_content').setValue('#post_content', postText);
  submitExactContentDialog(browser, {
    anchorSelector: '#edit_post_dialog_title',
    submitSelector: '[data-testid="dialog-edit-post-submit"]',
    inputSelector: '#post_content',
    expectedValue: postText,
    label: '投稿を作成',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', '投稿を作成');

  browser.useXpath().waitForElementVisible(postXpath, 10000);
  openDialogFromXpath(
    browser,
    `${postXpath}//button[@data-testid='timeline-post-edit-button']`,
    '[data-testid="dialog-edit-post"]'
  );
  browser.clearValue('#post_content').setValue('#post_content', postTextEdited);
  submitExactContentDialog(browser, {
    anchorSelector: '#edit_post_dialog_title',
    submitSelector: '[data-testid="dialog-edit-post-submit"]',
    inputSelector: '#post_content',
    expectedValue: postTextEdited,
    label: '投稿を編集',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', '投稿を編集');

  browser.useXpath().waitForElementVisible(postEditedXpath, 10000);
  openDialogFromXpath(
    browser,
    `${postEditedXpath}//button[@data-testid='timeline-post-reply-button']`,
    '[data-testid="dialog-edit-reply"]'
  );
  browser.clearValue('#reply_content').setValue('#reply_content', replyText);
  submitExactContentDialog(browser, {
    anchorSelector: '#edit_reply_dialog_title',
    submitSelector: '[data-testid="dialog-edit-reply-submit"]',
    inputSelector: '#reply_content',
    expectedValue: replyText,
    label: '返信を作成',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-reply"]', '返信を作成');

  browser.useXpath().waitForElementVisible(replyXpath, 10000);
  openDialogFromXpath(
    browser,
    `${replyXpath}//button[@data-testid='timeline-reply-edit-button']`,
    '[data-testid="dialog-edit-reply"]'
  );
  browser.clearValue('#reply_content').setValue('#reply_content', replyTextEdited);
  submitExactContentDialog(browser, {
    anchorSelector: '#edit_reply_dialog_title',
    submitSelector: '[data-testid="dialog-edit-reply-submit"]',
    inputSelector: '#reply_content',
    expectedValue: replyTextEdited,
    label: '返信を編集',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-reply"]', '返信を編集');

  browser.useXpath().waitForElementVisible(replyEditedXpath, 10000);
  openDialogFromXpath(
    browser,
    `${postEditedXpath}//button[@data-testid='timeline-post-supplement-button']`,
    '[data-testid="dialog-edit-supplement"]'
  );
  browser.clearValue('#supplement_content').setValue('#supplement_content', supplementText);
  submitExactContentDialog(browser, {
    anchorSelector: '#edit_supplement_dialog_title',
    submitSelector: '[data-testid="dialog-edit-supplement-submit"]',
    inputSelector: '#supplement_content',
    expectedValue: supplementText,
    label: '付加情報を作成',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-supplement"]', '付加情報を作成');

  browser.useXpath().waitForElementVisible(supplementXpath, 10000);
  openDialogFromXpath(
    browser,
    `${supplementXpath}//button[@data-testid='timeline-supplement-edit-button']`,
    '[data-testid="dialog-edit-supplement"]'
  );
  browser.clearValue('#supplement_content').setValue('#supplement_content', supplementTextEdited);
  submitExactContentDialog(browser, {
    anchorSelector: '#edit_supplement_dialog_title',
    submitSelector: '[data-testid="dialog-edit-supplement-submit"]',
    inputSelector: '#supplement_content',
    expectedValue: supplementTextEdited,
    label: '付加情報を編集',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-supplement"]', '付加情報を編集');

  browser.useXpath().waitForElementVisible(supplementEditedXpath, 10000);
  openDialogFromXpath(
    browser,
    `${supplementEditedXpath}//button[@data-testid='timeline-supplement-delete-button']`,
    '[data-testid="dialog-delete-supplement"]'
  );
  confirmExactDialog(browser, {
    anchorSelector: '#delete_supplement_dialog_title',
    submitSelector: '[data-testid="dialog-delete-supplement-confirm"]',
    label: '付加情報を削除',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-delete-supplement"]', '付加情報を削除');

  browser
    .useXpath()
    .waitForElementNotPresent(supplementEditedXpath, 10000)
    .waitForElementVisible(replyEditedXpath, 10000);
  openDialogFromXpath(
    browser,
    `${replyEditedXpath}//button[@data-testid='timeline-reply-delete-button']`,
    '[data-testid="dialog-delete-reply"]'
  );
  confirmExactDialog(browser, {
    anchorSelector: '#delete_reply_dialog_title',
    submitSelector: '[data-testid="dialog-delete-reply-confirm"]',
    label: '返信を削除',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-delete-reply"]', '返信を削除');

  browser.useXpath().waitForElementNotPresent(replyEditedXpath, 10000).waitForElementVisible(postEditedXpath, 10000);
  openDialogFromXpath(
    browser,
    `${postEditedXpath}//button[@data-testid='timeline-post-delete-button']`,
    '[data-testid="dialog-delete-post"]'
  );
  confirmExactDialog(browser, {
    anchorSelector: '#delete_post_dialog_title',
    submitSelector: '[data-testid="dialog-delete-post-confirm"]',
    label: '投稿を削除',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-delete-post"]', '投稿を削除');
  browser.useXpath().waitForElementNotPresent(postEditedXpath, 10000).useCss();
};

module.exports = {
  'タイムラインのダイアログで作成・編集・削除ができる': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const userMail = requireEnv('E2E_USER_MAIL');
    const userPassword = requireEnv('E2E_USER_PASSWORD');

    const stamp = Date.now();
    const postText = `E2E Post ${stamp}`;
    const postTextEdited = `${postText} edited`;
    const replyText = `E2E Reply ${stamp}`;
    const replyTextEdited = `${replyText} edited`;
    const supplementText = `E2E Supplement ${stamp}`;
    const supplementTextEdited = `${supplementText} edited`;
    const floorTitle = `E2E Timeline Crud Floor ${stamp}`;
    const roomTitle = `E2E Timeline Crud Room ${stamp}`;

    const postXpath = `//article[.//div[contains(@class,'text') and contains(., "${postText}")]]`;
    const postEditedXpath = `//article[.//div[contains(@class,'text') and contains(., "${postTextEdited}")]]`;
    const replyXpath = `//article[contains(@class,'wrapper')][.//div[contains(@class,'text') and contains(., "${replyText}")]]`;
    const replyEditedXpath = `//article[contains(@class,'wrapper')][.//div[contains(@class,'text') and contains(., "${replyTextEdited}")]]`;
    const supplementXpath =
      "//article[contains(@class,'supplement')][.//div[contains(@class,'supplement-content') and contains(., '" +
      supplementText +
      "')]]";
    const supplementEditedXpath =
      "//article[contains(@class,'supplement')][.//div[contains(@class,'supplement-content') and contains(., '" +
      supplementTextEdited +
      "')]]";

    prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    closeSoundCautionIfVisible(browser);
    waitForTimelineReady(browser);
    browser.waitForElementVisible('[data-testid="timeline-post-button"]', 10000);
    runCrudFlow(
      browser,
      postXpath,
      postEditedXpath,
      replyXpath,
      replyEditedXpath,
      supplementXpath,
      supplementEditedXpath,
      postText,
      postTextEdited,
      replyText,
      replyTextEdited,
      supplementText,
      supplementTextEdited
    );
    finish();
  },
};
