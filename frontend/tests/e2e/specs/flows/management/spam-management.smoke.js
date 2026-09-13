const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const {
  clickSingleVisible,
  clickSingleVisibleAfterExactControls,
} = require('../../helpers/dialog-focus');

const EDIT_DIALOG = '[role="dialog"][aria-labelledby="spam-management-edit-dialog-title"]';

const openManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/spam`;
  navigateToApp(browser, url).waitForElementVisible('[data-testid="management-spam-create"]', 10000);
};

const waitForListIdle = (browser, attempt = 0, onDone) => {
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
        onDone(true);
        return;
      }
      if (state.count > 1 || attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `スパムワードの基本動作テストで一覧の読み込みが完了しませんでした（count=${state.count}）。`
        );
        onDone(false);
        return;
      }
      browser.pause(250, () => waitForListIdle(browser, attempt + 1, onDone));
    }
  );
};

const setExactControlValue = (browser, selector, word, label, onDone) => {
  browser.execute(
    function (payload) {
      const isVisible = (element) =>
        !!(element && (element.offsetParent || element.getClientRects().length));
      const controls = Array.from(document.querySelectorAll(payload.selector)).filter(
        (control) =>
          isVisible(control) &&
          !control.disabled &&
          control.getAttribute('aria-disabled') !== 'true'
      );
      if (controls.length !== 1) {
        return { ok: false, reason: `control-count:${controls.length}` };
      }
      controls[0].value = payload.word;
      controls[0].dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: String(controls[0].value) === payload.word, reason: 'value-mismatch' };
    },
    [{ selector, word }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'execute-failed' };
      browser.assert.ok(state.ok, `${label}を設定しました（${state.reason || 'set'}）。`);
      onDone(state.ok === true);
    }
  );
};

const waitForExactRow = (browser, word, attempt = 0, onDone) => {
  const maxAttempts = 24;
  browser.execute(
    function (term) {
      const region = document.querySelector('.management-list-results');
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const matches = rows.filter((row) => {
        const cell = row.querySelector('td');
        return cell && cell.textContent.trim() === term;
      });
      return {
        busy: !region || region.getAttribute('aria-busy') === 'true',
        matchCount: matches.length,
        query: new URLSearchParams(window.location.search).get('q') || '',
        rowCount: rows.filter((row) => row.querySelector('td')).length,
      };
    },
    [word],
    (result) => {
      const state = result && result.value
        ? result.value
        : { busy: true, matchCount: 0, query: '', rowCount: 0 };
      const ready =
        !state.busy && state.query === word && state.rowCount === 1 && state.matchCount === 1;
      if (ready) {
        browser.assert.equal(state.rowCount, 1, 'スパムワードの基本動作テストの検索で、専用の行が1件表示されています。');
        browser.assert.equal(state.matchCount, 1, '専用のスパムワードのテストデータが1件だけ一致しました。');
        onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `専用のスパムワードの行を取得できませんでした（busy=${state.busy}, queryMatched=${state.query === word}, rows=${state.rowCount}, matches=${state.matchCount}）。`
        );
        onDone(false);
        return;
      }
      browser.pause(250, () => waitForExactRow(browser, word, attempt + 1, onDone));
    }
  );
};

const openExactRow = (browser, word, onDone) => {
  browser.execute(
    function (term) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr')).filter(
        (row) => {
          const cell = row.querySelector('td');
          return (
            !!(row.offsetParent || row.getClientRects().length) &&
            cell &&
            cell.textContent.trim() === term
          );
        }
      );
      const buttons = rows.length === 1
        ? Array.from(rows[0].querySelectorAll('button.management-row-action-button')).filter(
            (button) => button.getAttribute('aria-label') === `スパムワード「${term}」を編集` &&
              button.getClientRects().length && !button.disabled && button.getAttribute('aria-disabled') !== 'true'
          )
        : [];
      if (buttons.length === 1) buttons[0].click();
      return { count: rows.length, buttonCount: buttons.length };
    },
    [word],
    (result) => {
      const count = result && result.value ? Number(result.value.count) : -1;
      browser.assert.equal(count, 1, '専用のスパムワードの行を1件だけ開きました。');
      const buttonCount = result && result.value ? result.value.buttonCount : -1;
      browser.assert.equal(buttonCount, 1, '表示中の有効なスパムワードの編集ボタンを1件だけクリックしました。');
      onDone(count === 1 && buttonCount === 1);
    }
  );
};

const waitForPersistedDialog = (browser, word, attempt = 0, onDone) => {
  const maxAttempts = 20;
  browser.execute(
    function (payload) {
      const dialogs = Array.from(document.querySelectorAll(payload.dialogSelector)).filter(
        (dialog) => dialog.offsetParent || dialog.getClientRects().length
      );
      const inputs =
        dialogs.length === 1
          ? Array.from(dialogs[0].querySelectorAll('#spam-word')).filter(
              (input) => input.offsetParent || input.getClientRects().length
            )
          : [];
      return {
        dialogCount: dialogs.length,
        inputCount: inputs.length,
        valueMatched: inputs.length === 1 && String(inputs[0].value) === payload.word,
      };
    },
    [{ dialogSelector: EDIT_DIALOG, word }],
    (result) => {
      const state = result && result.value
        ? result.value
        : { dialogCount: 0, inputCount: 0, valueMatched: false };
      if (state.dialogCount === 1 && state.inputCount === 1 && state.valueMatched) {
        browser.assert.ok(true, '再度開いたダイアログでも専用のスパムワードのテストデータが保存されています。');
        onDone(true);
        return;
      }
      if (state.dialogCount > 1 || state.inputCount > 1 || attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `専用のスパムワードのダイアログが想定した状態ではありません（dialogs=${state.dialogCount}, inputs=${state.inputCount}, valueMatched=${state.valueMatched}）。`
        );
        onDone(false);
        return;
      }
      browser.pause(250, () => waitForPersistedDialog(browser, word, attempt + 1, onDone));
    }
  );
};

module.exports = {
  'スパム管理のダイアログを表示する': (browser) => {
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const word = `e2e-c12-spam-smoke-${Date.now().toString(36)}`;
    const finish = () => browser.end();

    loginByForm(browser, { mail: adminMail, password: adminPassword });
    openManagement(browser);
    waitForListIdle(browser, 0, (initialReady) => {
      if (!initialReady) return finish();
      clickSingleVisible(browser, '[data-testid="management-spam-create"]', 'スパムワードの基本動作テスト用のデータを作成');
      browser.waitForElementVisible(`${EDIT_DIALOG} #spam-word`, 10000);
      setExactControlValue(browser, `${EDIT_DIALOG} #spam-word`, word, '専用のスパムワードのテストデータ', (wordSet) => {
        if (!wordSet) return finish();
        clickSingleVisibleAfterExactControls(
          browser,
          {
            rootSelector: EDIT_DIALOG,
            expectedControls: [{ selector: '#spam-word', value: word }],
            submitSelector: '[data-testid="management-spam-submit"]',
            label: 'スパムワードの基本動作テスト用の専用データを作成',
          },
          (created) => {
            if (!created.clicked) return finish();
            browser.waitForElementNotVisible(EDIT_DIALOG, 10000);
            waitForListIdle(browser, 0, (createRefreshed) => {
              if (!createRefreshed) return finish();
              setExactControlValue(
                browser,
                '#management-search-input',
                word,
                '専用のスパムワードの検索',
                (searchSet) => {
                  if (!searchSet) return finish();
                  clickSingleVisibleAfterExactControls(
                    browser,
                    {
                      rootSelector: '.view',
                      expectedControls: [
                        { selector: '#management-search-input', value: word },
                      ],
                      submitSelector: '[data-testid="management-search-submit"]',
                      label: 'スパムワードの基本動作テスト用の専用データを検索',
                    },
                    (searched) => {
                      if (!searched.clicked) return finish();
                      waitForExactRow(browser, word, 0, (rowReady) => {
                        if (!rowReady) return finish();
                        openExactRow(browser, word, (rowOpened) => {
                          if (!rowOpened) return finish();
                          waitForPersistedDialog(browser, word, 0, (dialogReady) => {
                            if (!dialogReady) return finish();
                            clickSingleVisibleAfterExactControls(
                              browser,
                              {
                                rootSelector: EDIT_DIALOG,
                                expectedControls: [{ selector: '#spam-word', value: word }],
                                submitSelector: '[data-testid="base-edit-dialog-cancel"]',
                                label: 'スパムワードの基本動作テスト用の専用ダイアログをキャンセル',
                              },
                              (cancelled) => {
                                if (!cancelled.clicked) return finish();
                                browser.waitForElementNotVisible(EDIT_DIALOG, 10000).end();
                              }
                            );
                          });
                        });
                      });
                    }
                  );
                }
              );
            });
          }
        );
      });
    });
  },
};
