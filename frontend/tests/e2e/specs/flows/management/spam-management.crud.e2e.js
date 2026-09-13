const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const {
  clickSingleVisible,
  clickSingleVisibleAfterExactControls,
} = require('../../helpers/dialog-focus');

const EDIT_DIALOG = '[role="dialog"][aria-labelledby="spam-management-edit-dialog-title"]';
const DELETE_DIALOG = '[role="dialog"][aria-labelledby="spam-management-delete-dialog-title"]';

const openSpamManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/spam`;
  navigateToApp(browser, url).waitForElementVisible('[data-testid="management-spam-create"]', 10000);
};

const waitForListIdle = (browser, label, attempt = 0, onDone) => {
  const maxAttempts = 24;
  browser.execute(
    function () {
      const regions = Array.from(document.querySelectorAll('.management-list-results'));
      return {
        count: regions.length,
        idle: regions.length === 1 && regions[0].getAttribute('aria-busy') === 'false',
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { count: 0, idle: false };
      if (state.count === 1 && state.idle) {
        browser.assert.ok(true, `${label}: 管理画面の一覧の読み込みが完了しました。`);
        onDone(true);
        return;
      }
      if (state.count > 1 || attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `${label}: 管理画面の一覧の読み込みが完了しませんでした（count=${state.count}）。`
        );
        onDone(false);
        return;
      }
      browser.pause(250, () => waitForListIdle(browser, label, attempt + 1, onDone));
    }
  );
};

const waitForDialog = (browser, selector, label, expectedWord, attempt = 0, onDone) => {
  const maxAttempts = 20;
  browser.execute(
    function (payload) {
      const isVisible = (element) =>
        !!(element && (element.offsetParent || element.getClientRects().length));
      const dialogs = Array.from(document.querySelectorAll(payload.selector)).filter(isVisible);
      const inputs =
        dialogs.length === 1
          ? Array.from(dialogs[0].querySelectorAll('#spam-word')).filter(isVisible)
          : [];
      return {
        dialogCount: dialogs.length,
        inputCount: inputs.length,
        inputMatches:
          payload.expectedWord === null ||
          (inputs.length === 1 && String(inputs[0].value) === payload.expectedWord),
      };
    },
    [{ selector, expectedWord: expectedWord === null ? null : String(expectedWord) }],
    (result) => {
      const state = result && result.value
        ? result.value
        : { dialogCount: 0, inputCount: 0, inputMatches: false };
      const ready =
        state.dialogCount === 1 &&
        (expectedWord === null || (state.inputCount === 1 && state.inputMatches));
      if (ready) {
        browser.assert.ok(true, `${label}: 想定したダイアログが1件だけ表示されています。`);
        onDone(true);
        return;
      }
      if (state.dialogCount > 1 || state.inputCount > 1 || attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `${label}: 想定したダイアログを操作できませんでした（dialogs=${state.dialogCount}, inputs=${state.inputCount}, valueMatched=${state.inputMatches}）。`
        );
        onDone(false);
        return;
      }
      browser.pause(250, () =>
        waitForDialog(browser, selector, label, expectedWord, attempt + 1, onDone)
      );
    }
  );
};

const waitForDialogClosed = (browser, selector, label, attempt = 0, onDone) => {
  const maxAttempts = 24;
  browser.execute(
    function (dialogSelector) {
      const visible = Array.from(document.querySelectorAll(dialogSelector)).filter(
        (dialog) => dialog.offsetParent || dialog.getClientRects().length
      );
      return { count: visible.length };
    },
    [selector],
    (result) => {
      const count = result && result.value ? Number(result.value.count) : -1;
      if (count === 0) {
        browser.assert.equal(count, 0, `${label}: ダイアログが閉じました。`);
        onDone(true);
        return;
      }
      if (count > 1 || attempt >= maxAttempts) {
        browser.assert.equal(count, 0, `${label}: ダイアログが閉じています。`);
        onDone(false);
        return;
      }
      browser.pause(250, () => waitForDialogClosed(browser, selector, label, attempt + 1, onDone));
    }
  );
};

const setDialogWord = (browser, word, label, onDone) => {
  browser.execute(
    function (payload) {
      const isVisible = (element) =>
        !!(element && (element.offsetParent || element.getClientRects().length));
      const dialogs = Array.from(document.querySelectorAll(payload.dialogSelector)).filter(isVisible);
      if (dialogs.length !== 1) {
        return { ok: false, reason: `dialog-count:${dialogs.length}` };
      }
      const inputs = Array.from(dialogs[0].querySelectorAll('#spam-word')).filter(
        (input) =>
          isVisible(input) &&
          !input.disabled &&
          input.getAttribute('aria-disabled') !== 'true'
      );
      if (inputs.length !== 1) return { ok: false, reason: `input-count:${inputs.length}` };
      inputs[0].value = payload.word;
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: String(inputs[0].value) === payload.word, reason: 'value-mismatch' };
    },
    [{ dialogSelector: EDIT_DIALOG, word }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'execute-failed' };
      browser.assert.ok(state.ok, `${label}: スパムワードを設定しました（${state.reason || 'set'}）。`);
      onDone(state.ok === true);
    }
  );
};

const submitSpamWord = (browser, word, label, onDone) => {
  clickSingleVisibleAfterExactControls(
    browser,
    {
      rootSelector: EDIT_DIALOG,
      expectedControls: [{ selector: '#spam-word', value: word }],
      submitSelector: '[data-testid="management-spam-submit"]',
      label,
    },
    (state) => onDone(state.clicked === true)
  );
};

const applyExactSearch = (browser, word, label, onDone) => {
  browser.execute(
    function (term) {
      const isVisible = (element) =>
        !!(element && (element.offsetParent || element.getClientRects().length));
      const inputs = Array.from(document.querySelectorAll('#management-search-input')).filter(
        (input) =>
          isVisible(input) &&
          !input.disabled &&
          input.getAttribute('aria-disabled') !== 'true'
      );
      if (inputs.length !== 1) return { ok: false, reason: `input-count:${inputs.length}` };
      inputs[0].value = term;
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: String(inputs[0].value) === term, reason: 'value-mismatch' };
    },
    [word],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'execute-failed' };
      browser.assert.ok(state.ok, `${label}: 検索語を設定しました（${state.reason || 'set'}）。`);
      if (!state.ok) return onDone(false);
      clickSingleVisibleAfterExactControls(
        browser,
        {
          rootSelector: '.view',
          expectedControls: [{ selector: '#management-search-input', value: word }],
          submitSelector: '[data-testid="management-search-submit"]',
          label: `${label}: 完全一致の検索`,
        },
        (clickState) => onDone(clickState.clicked === true)
      );
    }
  );
};

const waitForExactSearchResult = (browser, word, label, attempt = 0, onDone) => {
  const maxAttempts = 24;
  browser.execute(
    function (term) {
      const region = document.querySelector('.management-list-results');
      const words = Array.from(document.querySelectorAll('table.management-table tbody tr'))
        .map((row) => row.querySelector('td'))
        .filter(Boolean)
        .map((cell) => cell.textContent.trim());
      return {
        busy: !region || region.getAttribute('aria-busy') === 'true',
        exactCount: words.filter((candidate) => candidate === term).length,
        query: new URLSearchParams(window.location.search).get('q') || '',
        rowCount: words.length,
      };
    },
    [word],
    (result) => {
      const state = result && result.value
        ? result.value
        : { busy: true, exactCount: 0, query: '', rowCount: 0 };
      const ready =
        !state.busy && state.query === word && state.rowCount === 1 && state.exactCount === 1;
      if (ready) {
        browser.assert.equal(state.query, word, `${label}: URLが検索語をそのまま維持しています。`);
        browser.assert.equal(state.rowCount, 1, `${label}: 検索結果が1行だけ表示されています。`);
        browser.assert.equal(state.exactCount, 1, `${label}: 対象のスパムワードが1件だけ表示されています。`);
        onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `${label}: 対象の検索結果を取得できませんでした（busy=${state.busy}, queryMatched=${state.query === word}, rows=${state.rowCount}, exact=${state.exactCount}）。`
        );
        onDone(false);
        return;
      }
      browser.pause(250, () =>
        waitForExactSearchResult(browser, word, label, attempt + 1, onDone)
      );
    }
  );
};

const waitForNoSearchResult = (browser, word, attempt = 0, onDone) => {
  const maxAttempts = 24;
  browser.execute(
    function (term) {
      const region = document.querySelector('.management-list-results');
      const words = Array.from(document.querySelectorAll('table.management-table tbody tr'))
        .map((row) => row.querySelector('td'))
        .filter(Boolean)
        .map((cell) => cell.textContent.trim());
      return {
        busy: !region || region.getAttribute('aria-busy') === 'true',
        matchingCount: words.filter((candidate) => candidate === term).length,
        query: new URLSearchParams(window.location.search).get('q') || '',
        rowCount: words.length,
      };
    },
    [word],
    (result) => {
      const state = result && result.value
        ? result.value
        : { busy: true, matchingCount: 1, query: '', rowCount: 1 };
      const ready =
        !state.busy && state.query === word && state.matchingCount === 0 && state.rowCount === 0;
      if (ready) {
        browser.assert.equal(state.query, word, '削除の確認中も検索語をそのまま維持しています。');
        browser.assert.equal(state.matchingCount, 0, '削除したスパムワードが表示されていません。');
        browser.assert.equal(state.rowCount, 0, '削除したスパムワードの検索結果は0件です。');
        onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `削除したスパムワードが残っています（busy=${state.busy}, queryMatched=${state.query === word}, rows=${state.rowCount}, matches=${state.matchingCount}）。`
        );
        onDone(false);
        return;
      }
      browser.pause(250, () => waitForNoSearchResult(browser, word, attempt + 1, onDone));
    }
  );
};

const openExactRow = (browser, word, label, onDone) => {
  browser.execute(
    function (term) {
      const matches = Array.from(document.querySelectorAll('table.management-table tbody tr')).filter(
        (row) => {
          const cell = row.querySelector('td');
          return (
            !!(row.offsetParent || row.getClientRects().length) &&
            cell &&
            cell.textContent.trim() === term
          );
        }
      );
      const buttons = matches.length === 1
        ? Array.from(matches[0].querySelectorAll('button.management-row-action-button')).filter(
            (button) => button.getAttribute('aria-label') === `スパムワード「${term}」を編集` &&
              button.getClientRects().length && !button.disabled && button.getAttribute('aria-disabled') !== 'true'
          )
        : [];
      if (buttons.length === 1) buttons[0].click();
      return { count: matches.length, buttonCount: buttons.length };
    },
    [word],
    (result) => {
      const count = result && result.value ? Number(result.value.count) : -1;
      browser.assert.equal(count, 1, `${label}: スパムワードの行を1件だけ開きました。`);
      const buttonCount = result && result.value ? result.value.buttonCount : -1;
      browser.assert.equal(buttonCount, 1, '表示中の有効なスパムワードの編集ボタンを1件だけクリックしました。');
      onDone(count === 1 && buttonCount === 1);
    }
  );
};

const requestPersistedSpamDeletion = (browser, word, onDone) => {
  clickSingleVisibleAfterExactControls(browser, {
    rootSelector: EDIT_DIALOG,
    expectedControls: [{ selector: '#spam-word', value: word }],
    submitSelector: '[data-testid="base-edit-dialog-cancel"]',
    label: '保存済みのスパムワードの編集画面を閉じる',
  }, (closed) => {
    if (!closed.clicked) return onDone(closed);
    waitForDialogClosed(browser, EDIT_DIALOG, '保存済みのスパムワードの編集画面', 0, (hidden) => {
      if (!hidden) return onDone({ clicked: false });
      clickSingleVisibleAfterExactControls(browser, {
        rootSelector: 'table.management-table tbody tr',
        expectedControls: [{ selector: 'td:first-child', property: 'textContent', value: word }],
        submitSelector: '[data-testid="management-spam-delete"]',
        label: '保存済みのスパムワードを対象行から削除',
      }, onDone);
    });
  });
};

module.exports = {
  'スパム管理で作成・編集・再表示・削除ができる': (browser) => {
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const word = `e2e-c12-spam-${Date.now().toString(36)}`;
    const updatedWord = `${word}-updated`;
    const finish = () => browser.end();

    loginByForm(browser, { mail: adminMail, password: adminPassword });
    openSpamManagement(browser);
    waitForListIdle(browser, '初回読み込み', 0, (initialReady) => {
      if (!initialReady) return finish();
      clickSingleVisible(browser, '[data-testid="management-spam-create"]', 'スパムワードの作成');
      waitForDialog(browser, EDIT_DIALOG, '作成', null, 0, (createVisible) => {
        if (!createVisible) return finish();
        setDialogWord(browser, word, 'create', (wordSet) => {
          if (!wordSet) return finish();
          submitSpamWord(browser, word, '対象のスパムワードを作成', (created) => {
            if (!created) return finish();
            waitForDialogClosed(browser, EDIT_DIALOG, '作成', 0, (createClosed) => {
              if (!createClosed) return finish();
              waitForListIdle(browser, '作成後の再読み込み', 0, (createRefreshed) => {
                if (!createRefreshed) return finish();
                applyExactSearch(browser, word, '作成したスパムワード', (searchApplied) => {
                  if (!searchApplied) return finish();
                  waitForExactSearchResult(browser, word, '作成したスパムワード', 0, (createdListed) => {
                    if (!createdListed) return finish();
                    openExactRow(browser, word, '作成したスパムワード', (createdOpened) => {
                      if (!createdOpened) return finish();
                      waitForDialog(browser, EDIT_DIALOG, '編集', word, 0, (editVisible) => {
                        if (!editVisible) return finish();
                        setDialogWord(browser, updatedWord, 'edit', (updatedWordSet) => {
                          if (!updatedWordSet) return finish();
                          submitSpamWord(browser, updatedWord, '対象のスパムワードを更新', (updated) => {
                            if (!updated) return finish();
                            waitForDialogClosed(browser, EDIT_DIALOG, '編集', 0, (editClosed) => {
                              if (!editClosed) return finish();
                              waitForListIdle(browser, '編集後の再読み込み', 0, (editRefreshed) => {
                                if (!editRefreshed) return finish();
                                applyExactSearch(browser, updatedWord, '更新したスパムワード', (updatedSearchApplied) => {
                                  if (!updatedSearchApplied) return finish();
                                  waitForExactSearchResult(
                                    browser,
                                    updatedWord,
                                    '更新したスパムワード',
                                    0,
                                    (updatedListed) => {
                                      if (!updatedListed) return finish();
                                      openExactRow(browser, updatedWord, '更新したスパムワード', (updatedOpened) => {
                                        if (!updatedOpened) return finish();
                                        waitForDialog(
                                          browser,
                                          EDIT_DIALOG,
                                          '再度開いて保存状態を確認',
                                          updatedWord,
                                          0,
                                          (persisted) => {
                                            if (!persisted) return finish();
                                            requestPersistedSpamDeletion(
                                              browser,
                                              updatedWord,
                                              (deleteOpened) => {
                                                if (!deleteOpened.clicked) return finish();
                                                waitForDialog(
                                                  browser,
                                                  DELETE_DIALOG,
                                                  '削除の確認',
                                                  null,
                                                  0,
                                                  (deleteVisible) => {
                                                    if (!deleteVisible) return finish();
                                                    clickSingleVisibleAfterExactControls(
                                                      browser,
                                                      {
                                                        rootSelector: DELETE_DIALOG,
                                                        expectedControls: [
                                                          {
                                                            selector: '#spam-management-delete-target-context .dialog-target-context__name',
                                                            property: 'textContent',
                                                            value: updatedWord,
                                                          },
                                                        ],
                                                        submitSelector:
                                                          '[data-testid="management-spam-delete-confirm"]',
                                                        label: '対象のスパムワードの削除を確定',
                                                      },
                                                      (deleted) => {
                                                        if (!deleted.clicked) return finish();
                                                        waitForDialogClosed(
                                                          browser,
                                                          DELETE_DIALOG,
                                                          '削除の確認',
                                                          0,
                                                          (deleteClosed) => {
                                                            if (!deleteClosed) return finish();
                                                            waitForListIdle(
                                                              browser,
                                                              '削除後の再読み込み',
                                                              0,
                                                              (deleteRefreshed) => {
                                                                if (!deleteRefreshed) return finish();
                                                                applyExactSearch(
                                                                  browser,
                                                                  updatedWord,
                                                                  '削除したスパムワード',
                                                                  (deleteSearchApplied) => {
                                                                    if (!deleteSearchApplied) return finish();
                                                                    waitForNoSearchResult(
                                                                      browser,
                                                                      updatedWord,
                                                                      0,
                                                                      finish
                                                                    );
                                                                  }
                                                                );
                                                              }
                                                            );
                                                          }
                                                        );
                                                      }
                                                    );
                                                  }
                                                );
                                              }
                                            );
                                          }
                                        );
                                      });
                                    }
                                  );
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },
};
