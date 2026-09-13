const {
  prepareTimelineRoom,
  submitPost,
  waitForPostVisibleByText,
  waitForReactionCount,
  toggleReactionByExisting,
} = require('../../helpers/timeline-helpers');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');
const { sendKeysToActiveElement } = require('../../helpers/dialog-focus');

const sendReactionKey = (browser, key, label) => {
  browser.perform((done) => {
    sendKeysToActiveElement(browser, key, (state) => {
      browser.assert.ok(state.ok, `${label}: ${state.reason || 'W3Cのキー操作が完了しました'}`);
      done();
    });
  });
};

const focusReactionTriggerForPost = (browser, text) => {
  browser.execute(
    function (targetText) {
      const xpath = `//article[.//div[contains(@class,'text') and contains(., "${targetText}")]]`;
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const post = result.singleNodeValue;
      const container = post && post.querySelector('.reaction-container');
      const trigger = container && container.querySelector('button[aria-expanded]');
      if (!trigger) return { focused: false, reason: 'trigger-not-found' };
      trigger.focus();
      return {
        focused: document.activeElement === trigger,
        expanded: trigger.getAttribute('aria-expanded'),
        reason: '',
      };
    },
    [text],
    (result) => {
      const state = result && result.value ? result.value : { focused: false, reason: 'execute-failed' };
      browser.assert.ok(state.focused, `リアクションを開くボタンへフォーカスが移りました（${state.reason || 'ok'}）。`);
      browser.assert.equal(state.expanded, 'false', '選択画面を閉じた状態では、開くボタンのaria-expandedはfalseです。');
    }
  );
};

const assertReactionPickerState = (browser, text, { expectedFocus = 'first', label }) => {
  browser.execute(
    function (targetText, focusExpectation) {
      const xpath = `//article[.//div[contains(@class,'text') and contains(., "${targetText}")]]`;
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const post = result.singleNodeValue;
      const container = post && post.querySelector('.reaction-container');
      const trigger = container && container.querySelector('button[aria-expanded]');
      const pickerId = trigger ? trigger.getAttribute('aria-controls') : '';
      const picker = pickerId
        ? Array.from(document.querySelectorAll('[id]')).find((element) => element.id === pickerId)
        : null;
      const buttons = picker ? Array.from(picker.querySelectorAll('button:not([disabled])')) : [];
      const activeIndex = buttons.indexOf(document.activeElement);
      return {
        pickerFound: !!picker,
        pickerId,
        pickerIdCount: pickerId
          ? Array.from(document.querySelectorAll('[id]')).filter((element) => element.id === pickerId).length
          : 0,
        role: picker ? picker.getAttribute('role') : '',
        expanded: trigger ? trigger.getAttribute('aria-expanded') : '',
        activeIndex,
        focusMatches:
          focusExpectation === 'first'
            ? activeIndex === 0
            : focusExpectation === 'next'
              ? activeIndex === 1
              : activeIndex >= 0,
      };
    },
    [text, expectedFocus],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(state.pickerFound, `リアクションの選択画面があります（${label}）。`);
      browser.assert.ok(!!state.pickerId, `リアクションを開くボタンが対応する選択画面を参照しています（${label}）。`);
      browser.assert.equal(state.pickerIdCount, 1, `リアクションの選択画面のIDが重複していません（${label}）。`);
      browser.assert.equal(state.role, 'group', `リアクションの選択画面はグループとしての意味を持ちます（${label}）。`);
      browser.assert.equal(state.expanded, 'true', `リアクションを開くボタンはaria-expanded=trueです（${label}）。`);
      browser.assert.ok(state.focusMatches, `リアクションの選択画面で通常のTabキーによるフォーカス移動ができます（${label}）: ${state.activeIndex}`);
    }
  );
};

const assertReactionTriggerRestored = (browser, text) => {
  browser.execute(
    function (targetText) {
      const xpath = `//article[.//div[contains(@class,'text') and contains(., "${targetText}")]]`;
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const post = result.singleNodeValue;
      const container = post && post.querySelector('.reaction-container');
      const trigger = container && container.querySelector('button[aria-expanded]');
      return {
        found: !!trigger,
        expanded: trigger ? trigger.getAttribute('aria-expanded') : '',
        controls: trigger ? trigger.getAttribute('aria-controls') : null,
        focused: document.activeElement === trigger,
      };
    },
    [text],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(state.found, '閉じた後もリアクションを開くボタンが残っています。');
      browser.assert.equal(state.expanded, 'false', '選択画面を閉じた状態では、開くボタンのaria-expandedはfalseです。');
      browser.assert.equal(state.controls, null, '閉じた状態のボタンが、存在しないリアクションの選択画面を参照していません。');
      browser.assert.ok(state.focused, 'リアクションの選択画面を閉じると、開くボタンへフォーカスが戻ります。');
    }
  );
};

module.exports = {
  'タイムラインでリアクションを追加・解除できる': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインのリアクションのテストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Timeline Reaction Floor ${stamp}`;
    const roomTitle = `E2E Timeline Reaction Room ${stamp}`;
    const postText = `E2E Reaction ${stamp}`;

    prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
      targetLangs: [],
    });

    submitPost(browser, postText);
    waitForPostVisibleByText(browser, postText, '投稿');

    focusReactionTriggerForPost(browser, postText);
    sendReactionKey(browser, browser.Keys.ENTER, 'Enterキーでリアクションの選択画面を開く');
    browser.waitForElementVisible('.reaction-picker', 10000);
    assertReactionPickerState(browser, postText, { expectedFocus: 'first', label: 'Enterキーで開いた状態' });
    assertAccessibilityIntegrity(browser, {
      rootSelector: '.reaction-picker',
      label: 'リアクションの選択画面',
      checkControlNames: true,
    });

    sendReactionKey(browser, browser.Keys.TAB, 'Tabキーで次のリアクションへ移動');
    assertReactionPickerState(browser, postText, { expectedFocus: 'next', label: '通常のTabキー操作' });
    sendReactionKey(browser, browser.Keys.ESCAPE, 'Escapeキーでリアクションの選択画面を閉じる');
    browser.waitForElementNotPresent('.reaction-picker', 10000);
    assertReactionTriggerRestored(browser, postText);

    sendReactionKey(browser, browser.Keys.ENTER, 'Enterキーでリアクションの選択画面を再度開く');
    browser.waitForElementVisible('.reaction-picker', 10000);
    assertReactionPickerState(browser, postText, { expectedFocus: 'first', label: 'Enterキーで再度開いた状態' });
    sendReactionKey(browser, browser.Keys.ENTER, 'Enterキーでリアクションを選択');
    browser.waitForElementNotPresent('.reaction-picker', 10000);
    waitForReactionCount(browser, postText, 1, '追加');

    toggleReactionByExisting(browser, postText);
    waitForReactionCount(browser, postText, 0, '削除');

    browser.end();
  },
};
