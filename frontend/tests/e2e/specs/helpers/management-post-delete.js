const { getBaseUrl, navigateToApp } = require('./login');
const { openTimeline, waitForTimelineReady } = require('./guest-helpers');
const { clickFirstVisible, submitPost, waitForDialogClosed } = require('./timeline-helpers');

const openManagement = (browser, userName) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const query = userName ? `?page=1&q=${encodeURIComponent(userName)}` : '';
  navigateToApp(browser, `${base}/management/post${query}`).waitForElementVisible('table.management-table', 10000);
};

const clickPostAction = (browser, postText, testId, label) => {
  browser.execute(
    function (targetText, targetTestId) {
      const articles = Array.from(document.querySelectorAll('.timeline-content article'));
      const matches = articles.filter((article) => {
        const text = article.querySelector('.post .text');
        return text && String(text.textContent || '').trim() === targetText;
      });
      if (matches.length !== 1) {
        return { clicked: false, reason: 'post-match-count', postCount: matches.length, buttonCount: 0 };
      }
      const buttons = Array.from(matches[0].querySelectorAll(`[data-testid="${targetTestId}"]`)).filter(
        (button) =>
          (button.offsetParent || button.getClientRects().length) &&
          !button.disabled &&
          button.getAttribute('aria-disabled') !== 'true'
      );
      if (buttons.length !== 1) {
        return { clicked: false, reason: 'button-match-count', postCount: 1, buttonCount: buttons.length };
      }
      buttons[0].click();
      return { clicked: true, postCount: 1, buttonCount: 1 };
    },
    [postText, testId],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'no-result' };
      browser.assert.equal(state.postCount, 1, `${label}: 投稿の完全一致件数を確認します。`);
      browser.assert.equal(state.buttonCount, 1, `${label}: 表示中の有効な操作要素の件数を確認します。`);
      browser.assert.ok(state.clicked, `${label}: ${state.reason || 'clicked'}`);
    }
  );
};

const createFixture = (browser, { type, postText, childText }) => {
  submitPost(browser, postText);
  if (type === 'post') return;

  const isReply = type === 'reply';
  clickPostAction(
    browser,
    postText,
    isReply ? 'timeline-post-reply-button' : 'timeline-post-supplement-button',
    `${type}のテストデータのダイアログを開く`
  );
  const dialog = isReply ? '[data-testid="dialog-edit-reply"]' : '[data-testid="dialog-edit-supplement"]';
  const input = isReply ? '#reply_content' : '#supplement_content';
  const submit = isReply
    ? '.desktop-item[data-testid="dialog-edit-reply-submit"]'
    : '.desktop-item[data-testid="dialog-edit-supplement-submit"]';
  browser
    .waitForElementVisible(dialog, 10000)
    .clearValue(input)
    .setValue(input, childText)
    .perform((done) => {
      clickFirstVisible(browser, submit, `${type}のテストデータを送信`);
      done();
    });
  waitForDialogClosed(browser, dialog, `${type}のテストデータを送信`);
};

const resolveCurrentUserName = (browser, callback) => {
  browser.execute(
    function () {
      try {
        const persisted = JSON.parse(window.localStorage.getItem('iseeetl_store') || '{}');
        return { userName: persisted.user && persisted.user.name ? String(persisted.user.name) : '' };
      } catch (_) {
        return { userName: '' };
      }
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { userName: '' };
      callback(state.userName || '');
    }
  );
};

const readTarget = (browser, target, callback) => {
  browser.execute(
    function (expected) {
      const view = document.querySelector('.view');
      const busy = view ? view.getAttribute('aria-busy') === 'true' : null;
      const expectedType = expected.type === 'post' ? '投稿' : expected.type === 'reply' ? '返信' : '付加情報';
      const expectedText = expected.type === 'post' ? expected.postText : expected.childText;
      const matches = Array.from(document.querySelectorAll('table.post-management tbody tr')).filter((candidate) => {
        const cells = candidate.querySelectorAll('td');
        const contentCell = cells[1];
        const contentNode = contentCell ? contentCell.querySelector('span[dir="auto"]') : null;
        const content = contentNode ? String(contentNode.textContent || '').trim() : '';
        const typeNode = contentCell ? contentCell.querySelector('strong') : null;
        const type = typeNode ? String(typeNode.textContent || '').trim() : '';
        return type === expectedType && content === expectedText;
      });
      const row = matches.length === 1 ? matches[0] : null;
      return {
        found: !!row,
        count: matches.length,
        fetching: busy,
        deleted: !!(row && row.classList.contains('soft-delete')),
        reason: row ? '' : matches.length > 1 ? 'row-not-unique' : 'row-not-found',
      };
    },
    [target],
    (result) => callback(result && result.value ? result.value : { found: false, reason: 'no-result' })
  );
};

const waitForTarget = (browser, target, attempt = 0, onReady) => {
  readTarget(browser, target, (state) => {
    if (state.found) {
      browser.assert.ok(true, `管理画面に専用の${target.type}のテストデータが見つかりました。`);
      onReady({ ...target, ...state });
      return;
    }
    if (state.count > 1) {
      browser.assert.equal(state.count, 1, `専用の${target.type}のテストデータが1行だけ一致する必要があります。`);
      onReady(null);
      return;
    }
    if (attempt >= 80) {
      browser.assert.ok(false, `専用の${target.type}のテストデータが見つかりません: ${state.reason || 'unknown'}`);
      onReady(null);
      return;
    }
    browser.pause(500, () => waitForTarget(browser, target, attempt + 1, onReady));
  });
};

const openDeleteDialog = (browser, target, onReady) => {
  browser.execute(
    function (expected) {
      const expectedType = expected.type === 'post' ? '投稿' : expected.type === 'reply' ? '返信' : '付加情報';
      const expectedText = expected.type === 'post' ? expected.postText : expected.childText;
      const matches = Array.from(document.querySelectorAll('table.post-management tbody tr')).filter((candidate) => {
        const cells = candidate.querySelectorAll('td');
        const contentCell = cells[1];
        const contentNode = contentCell ? contentCell.querySelector('span[dir="auto"]') : null;
        const content = contentNode ? String(contentNode.textContent || '').trim() : '';
        const typeNode = contentCell ? contentCell.querySelector('strong') : null;
        const type = typeNode ? String(typeNode.textContent || '').trim() : '';
        return type === expectedType && content === expectedText;
      });
      const row = matches.length === 1 ? matches[0] : null;
      const buttons = row
        ? Array.from(row.querySelectorAll('button.management-row-action-button')).filter(
            (button) =>
              (button.offsetParent || button.getClientRects().length) &&
              !button.disabled &&
              button.getAttribute('aria-disabled') !== 'true'
          )
        : [];
      const opened = matches.length === 1 && buttons.length === 1;
      if (opened) buttons[0].click();
      return { opened, rowCount: matches.length, buttonCount: buttons.length };
    },
    [target],
    (result) => {
      const state =
        result && result.value ? result.value : { opened: false, rowCount: 0, buttonCount: 0 };
      browser.assert.equal(state.rowCount, 1, '専用の管理対象が1行だけ一致しました。');
      browser.assert.equal(state.buttonCount, 1, '専用の管理対象に、表示中の有効な操作要素が1件あります。');
      browser.assert.ok(state.opened, '専用の管理対象の削除ダイアログが開きました。');
      onReady(!!state.opened);
    }
  );
};

const waitForDeleteState = (browser, target, expected, attempt = 0, onReady) => {
  browser.execute(
    function (payload) {
      const expectedType = payload.type === 'post' ? '投稿' : payload.type === 'reply' ? '返信' : '付加情報';
      const expectedText = payload.type === 'post' ? payload.postText : payload.childText;
      const matches = Array.from(document.querySelectorAll('table.post-management tbody tr')).filter((candidate) => {
        const cells = candidate.querySelectorAll('td');
        const contentCell = cells[1];
        const contentNode = contentCell ? contentCell.querySelector('span[dir="auto"]') : null;
        const content = contentNode ? String(contentNode.textContent || '').trim() : '';
        const typeNode = contentCell ? contentCell.querySelector('strong') : null;
        const type = typeNode ? String(typeNode.textContent || '').trim() : '';
        return type === expectedType && content === expectedText;
      });
      const row = matches.length === 1 ? matches[0] : null;
      return { count: matches.length, deleted: !!(row && row.classList.contains('soft-delete')) };
    },
    [target],
    (result) => {
      const state = result && result.value ? result.value : { count: 0, deleted: false };
      if (state.count === 1 && state.deleted === expected) {
        browser.assert.ok(true, `管理画面の削除フラグが一致しました: ${expected}。`);
        onReady(true);
        return;
      }
      if (state.count > 1) {
        browser.assert.equal(state.count, 1, `専用の${target.type}のテストデータが1行だけ一致する必要があります。`);
        onReady(false);
        return;
      }
      if (attempt >= 20) {
        browser.assert.ok(false, `管理画面の削除フラグが${expected}になりませんでした。`);
        onReady(false);
        return;
      }
      browser.pause(500, () => waitForDeleteState(browser, target, expected, attempt + 1, onReady));
    }
  );
};

const setDeleteState = (browser, target, expected, onDone) => {
  openDeleteDialog(browser, target, (opened) => {
    if (!opened) return onDone(false);
    const dialogSelector = '[data-testid="management-lifecycle-dialog"] [role="dialog"]';
    browser.waitForElementVisible(dialogSelector, 10000);
    browser.execute(
      function (payload) {
        const isVisible = function (node) {
          return !!(node && (node.offsetParent || node.getClientRects().length));
        };
        const dialogs = Array.from(document.querySelectorAll(payload.dialogSelector)).filter(isVisible);
        if (dialogs.length !== 1) {
          return { dialogCount: dialogs.length, titleCount: 0, confirmCount: 0, clicked: false };
        }
        const dialog = dialogs[0];
        const titleId = dialog.getAttribute('aria-labelledby') || '';
        const titles = Array.from(document.querySelectorAll('[id]')).filter(
          (element) => element.id === titleId && dialog.contains(element)
        );
        const confirms = Array.from(
          dialog.querySelectorAll('[data-testid="management-lifecycle-confirm"]')
        ).filter(
          (button) =>
            isVisible(button) &&
            !button.disabled &&
            button.getAttribute('aria-disabled') !== 'true' &&
            (button.getAttribute('aria-label') === payload.confirmLabel ||
              String(button.textContent || '').trim() === payload.confirmLabel)
        );
        const valid = titles.length === 1 && confirms.length === 1;
        if (valid) confirms[0].click();
        return { dialogCount: 1, titleCount: titles.length, confirmCount: confirms.length, clicked: valid };
      },
      [{ dialogSelector, confirmLabel: expected ? '削除' : '復元' }],
      (result) => {
        const state =
          result && result.value
            ? result.value
            : { dialogCount: 0, titleCount: 0, confirmCount: 0, clicked: false };
        browser.assert.equal(state.dialogCount, 1, '削除・復元ダイアログが1件だけ表示されています。');
        browser.assert.equal(state.titleCount, 1, 'ダイアログに削除・復元のタイトルが1件あります。');
        browser.assert.equal(state.confirmCount, 1, '削除・復元の確定ボタンが1件表示されています。');
        browser.assert.ok(state.clicked, `削除・復元操作で削除状態が${expected}に変わりました。`);
        if (!state.clicked) {
          onDone(false);
          return;
        }
        waitForDialogClosed(browser, dialogSelector, '管理画面の削除・復元操作');
        waitForDeleteState(browser, target, expected, 0, onDone);
      }
    );
  });
};

const readTimelineContent = (browser, text, callback) => {
  browser.execute(
    function (expectedText) {
      const contents = Array.from(document.querySelectorAll('.timeline-content article'))
        .map((article) => article.textContent || '')
        .join('\n');
      return {
        ready: !!document.querySelector('[data-testid="timeline-connected"]') &&
          !!document.querySelector('.scroll-sentinel'),
        present: contents.includes(expectedText),
      };
    },
    [text],
    (result) => callback(result && result.value ? result.value : { ready: false, present: false })
  );
};

const verifyTimelineContent = (browser, options, attempt = 0, onDone) => {
  if (attempt === 0) {
    const base = getBaseUrl(browser).replace(/\/$/, '');
    navigateToApp(
      browser,
      `${base}/floor/${encodeURIComponent(options.floorId)}/room/${encodeURIComponent(options.roomId)}`
    )
      .waitForElementVisible('.timeline-page', 20000)
      .waitForElementPresent('[data-testid="timeline-connected"]', 20000)
      .pause(1000);
  }
  readTimelineContent(browser, options.text, (state) => {
    if (state.ready && state.present === options.expected && attempt >= 2) {
      browser.assert.ok(true, `タイムラインの内容の有無が一致しました: ${options.expected}。`);
      onDone(true);
      return;
    }
    if (attempt >= 30) {
      browser.assert.ok(false, `タイムラインの内容の有無が${options.expected}になりませんでした。`);
      onDone(false);
      return;
    }
    browser.pause(500, () => verifyTimelineContent(browser, options, attempt + 1, onDone));
  });
};

const runDeleteRestoreScenario = (
  browser,
  { floorId, roomId, finish, type, postText, childText = '', timelineText }
) => {
  const target = { type, postText, childText };
  openTimeline(browser, floorId, roomId);
  waitForTimelineReady(browser);
  createFixture(browser, target);
  resolveCurrentUserName(browser, (userName) => {
    browser.assert.ok(!!userName, `専用の${type}の投稿者を管理画面の検索に使用できます。`);
    if (!userName) return finish();
    openManagement(browser, userName);
    waitForTarget(browser, target, 0, (initial) => {
      if (!initial) return finish();
      browser.assert.ok(!initial.deleted, `専用の${type}のテストデータは有効な状態で開始します。`);
      setDeleteState(browser, initial, true, (deleted) => {
        if (!deleted) return finish();
        verifyTimelineContent(browser, { floorId, roomId, text: timelineText, expected: false }, 0, (hidden) => {
          if (!hidden) return finish();
          openManagement(browser, userName);
          waitForTarget(browser, target, 0, (deletedTarget) => {
            if (!deletedTarget) return finish();
            setDeleteState(browser, deletedTarget, false, (restored) => {
              if (!restored) return finish();
              verifyTimelineContent(browser, { floorId, roomId, text: timelineText, expected: true }, 0, () =>
                finish()
              );
            });
          });
        });
      });
    });
  });
};

module.exports = {
  runDeleteRestoreScenario,
};
