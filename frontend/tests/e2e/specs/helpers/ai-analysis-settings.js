const {
  clickSingleVisible,
  clickSingleVisibleAfterExactControls,
  waitForConfirmDialog,
} = require('./dialog-focus');

const createCategoryTagByApiActor = (
  browser,
  { actorMail, actorPassword, name, order = 80 },
  label = 'AI解析用の共通タグのテストデータ'
) => {
  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin' });
        return;
      }

      const requestJson = function (path, options) {
        return fetch(`${window.location.origin}${path}`, options).then(function (response) {
          return response
            .json()
            .catch(function () {
              return null;
            })
            .then(function (body) {
              return { status: response.status, body };
            });
        });
      };

      requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mail: payload.actorMail, password: payload.actorPassword }),
      })
        .then(function (loginResult) {
          const token = loginResult.body && loginResult.body.token ? String(loginResult.body.token) : '';
          if (loginResult.status !== 200 || !token) {
            done({ ok: false, stage: 'login', loginStatus: loginResult.status });
            return null;
          }

          return requestJson('/api/categorytag/management/create', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ order: payload.order, name: payload.name }),
          }).then(function (createResult) {
            done({
              ok: createResult.status === 200 && !!(createResult.body && createResult.body._id),
              stage: 'create',
              loginStatus: loginResult.status,
              requestStatus: createResult.status,
            });
            return null;
          });
        })
        .catch(function () {
          done({ ok: false, stage: 'request' });
        });
    },
    [{ actorMail, actorPassword, name, order }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result' };
      browser.assert.ok(
        state.ok,
        `${label}: stage=${state.stage || 'unknown'} login=${state.loginStatus || 0} request=${
          state.requestStatus || 0
        }.`
      );
    }
  );
};

const assertOpenAIProviderDisabled = (browser) => {
  browser.executeAsync(
    function (done) {
      fetch(`${window.location.origin}/api/capabilities`)
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return null;
            })
            .then(function (body) {
              done({
                ok:
                  response.status === 200 &&
                  body &&
                  body.openaiAnalysis === false &&
                  body.openaiTranscription === false,
                status: response.status,
              });
            });
        })
        .catch(function () {
          done({ ok: false, status: 0 });
        });
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, status: 0 };
      browser.assert.ok(state.ok, `coreのE2EではOpenAI機能が無効です（status=${state.status}）。`);
    }
  );
};

const waitForCommonSetting = (browser, expected, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function (payload) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const matches = rows.filter((row) => {
        const cells = row.querySelectorAll('td');
        return cells.length === 5 && cells[0].textContent.trim() === payload.tagName;
      });
      if (matches.length !== 1) return { ready: false, count: matches.length };
      const row = matches[0];
      const cells = row.querySelectorAll('td');
      return {
        ready:
          cells[2].textContent.trim() === payload.prompt,
        count: 1,
        prompt: cells[2].textContent.trim(),
        resultUserPresent: cells[3].textContent.trim().length > 0,
      };
    },
    [expected],
    (result) => {
      const state = result && result.value ? result.value : { ready: false, count: 0 };
      if (state.ready && state.resultUserPresent) {
        browser.assert.ok(
          true,
          `共通AI設定を確認しました: tag=${expected.tagName}。`
        );
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `共通AI設定が一致しません: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(300, () => waitForCommonSetting(browser, expected, attempt + 1));
    }
  );
};

const waitForCommonSettingAbsent = (browser, tagName, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function (targetTagName) {
      return Array.from(document.querySelectorAll('table.management-table tbody tr')).filter((row) => {
        const firstCell = row.querySelector('td');
        return firstCell && firstCell.textContent.trim() === targetTagName;
      }).length;
    },
    [tagName],
    (result) => {
      const count = result && Number.isInteger(result.value) ? result.value : -1;
      if (count === 0) {
        browser.assert.ok(true, `共通AI設定が一覧から削除されました: ${tagName}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.equal(count, 0, `共通AI解析設定がありません: ${tagName}。`);
        return;
      }
      browser.pause(300, () => waitForCommonSettingAbsent(browser, tagName, attempt + 1));
    }
  );
};

const clickCommonSettingAction = (browser, tagName, action) => {
  browser.execute(
    function (payload) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr')).filter((row) => {
        const firstCell = row.querySelector('td');
        return firstCell && firstCell.textContent.trim() === payload.tagName;
      });
      if (rows.length !== 1) return { ok: false, reason: `row-count:${rows.length}` };
      const buttons = Array.from(rows[0].querySelectorAll('button')).filter(
        (button) =>
          button.textContent.trim() === payload.action &&
          !button.disabled &&
          (button.offsetParent || button.getClientRects().length)
      );
      if (buttons.length !== 1) return { ok: false, reason: `button-count:${buttons.length}` };
      buttons[0].click();
      return { ok: true };
    },
    [{ tagName, action }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'no-result' };
      browser.assert.ok(state.ok, `共通設定の${action}操作: ${state.reason || 'clicked'}。`);
    }
  );

  if (action === '削除') {
    waitForConfirmDialog(
      browser,
      '[data-testid="management-lifecycle-dialog"]',
      `共通AI設定の${action}の確認`
    );
    clickSingleVisible(
      browser,
      '[data-testid="management-lifecycle-confirm"]',
      `共通AI設定の${action}を確定`
    );
  }
};

const waitForCommonDialog = (browser, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      const title = document.querySelector('#ai-analysis-setting-dialog-title');
      const tag = document.querySelector('#ai-analysis-setting-tag');
      const kind = document.querySelector('#ai-analysis-setting-kind');
      const prompt = document.querySelector('#ai-analysis-setting-prompt');
      const resultUserSearch = document.querySelector('#ai-analysis-setting-result-user-search');
      return {
        ready:
          !!title &&
          !!tag &&
          !!kind &&
          !!prompt &&
          !!resultUserSearch &&
          (title.offsetParent || title.getClientRects().length),
      };
    },
    [],
    (result) => {
      const ready = !!(result && result.value && result.value.ready);
      if (ready) {
        browser.assert.ok(true, '共通AI設定のダイアログを操作できます。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '共通AI設定のダイアログを操作できませんでした。');
        return;
      }
      browser.pause(300, () => waitForCommonDialog(browser, attempt + 1));
    }
  );
};

const submitCommonSettingForm = (browser, { tagName, analysisKind, prompt }) => {
  waitForCommonDialog(browser);
  browser.execute(
    function () {
      const searchControl = document.querySelector(
        '.ai-analysis-setting-fields__search-control'
      );
      const buttons = searchControl
        ? Array.from(searchControl.querySelectorAll('button')).filter(
            (button) => !button.disabled && (button.offsetParent || button.getClientRects().length)
          )
        : [];
      if (buttons.length !== 1) {
        return { ok: false, reason: `search-button-count:${buttons.length}` };
      }
      buttons[0].click();
      return { ok: true };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'no-result' };
      browser.assert.ok(state.ok, `共通AI設定の結果投稿ユーザの検索: ${state.reason || 'clicked'}。`);
    }
  );
  browser.waitForElementVisible(
    '.ai-analysis-setting-fields__result-user-list input[type="radio"]',
    10000
  );
  browser.execute(
    function (payload) {
      const tag = document.querySelector('#ai-analysis-setting-tag');
      const kind = document.querySelector('#ai-analysis-setting-kind');
      const prompt = document.querySelector('#ai-analysis-setting-prompt');
      const resultUsers = Array.from(
        document.querySelectorAll(
          '.ai-analysis-setting-fields__result-user-list input[type="radio"]'
        )
      );
      if (!tag || !kind || !prompt || resultUsers.length === 0) {
        return { ok: false, reason: 'controls-missing' };
      }
      const tagOption = Array.from(tag.options).find(
        (option) => option.textContent.trim() === payload.tagName
      );
      if (!tagOption) return { ok: false, reason: 'tag-option-missing' };
      if (!Array.from(kind.options).some((option) => option.value === payload.analysisKind)) {
        return { ok: false, reason: 'kind-option-missing' };
      }
      tag.value = tagOption.value;
      tag.dispatchEvent(new Event('input', { bubbles: true }));
      tag.dispatchEvent(new Event('change', { bubbles: true }));
      kind.value = payload.analysisKind;
      kind.dispatchEvent(new Event('input', { bubbles: true }));
      kind.dispatchEvent(new Event('change', { bubbles: true }));
      prompt.value = payload.prompt;
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      const resultUser = resultUsers.find((input) => input.checked) || resultUsers[0];
      resultUser.checked = true;
      resultUser.dispatchEvent(new Event('input', { bubbles: true }));
      resultUser.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: resultUser.checked && !!resultUser.value };
    },
    [{ tagName, analysisKind, prompt }],
    (result) => {
      browser.assert.ok(!!(result && result.value && result.value.ok), '共通設定のフォームに値を設定しました。');
    }
  );

  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#ai-analysis-setting-dialog-title',
    submitSelector: '[data-testid="ai-analysis-setting-submit"]',
    expectedControls: [
      { selector: '#ai-analysis-setting-kind', property: 'value', value: analysisKind },
      { selector: '#ai-analysis-setting-prompt', property: 'value', value: prompt },
      {
        selector: '.ai-analysis-setting-fields__result-user-list input[type="radio"]:checked',
        property: 'checked',
        value: true,
      },
    ],
    label: `共通AI設定の${tagName}`,
  });
  browser.waitForElementNotVisible('#ai-analysis-setting-dialog-title', 15000);
};

const waitForScopedSetting = (
  browser,
  { scope, tagName, prompt, kindLabel, expectedResultUser },
  attempt = 0,
  onReady
) => {
  const maxAttempts = 40;
  browser.execute(
    function (payload) {
      const root = document.querySelector(`[data-testid="scoped-ai-analysis-settings-${payload.scope}"]`);
      const rows = root ? Array.from(root.querySelectorAll('table.settings-table tbody tr')) : [];
      const matches = rows.filter((row) => {
        const cells = row.querySelectorAll('td');
        return cells.length >= 5 && cells[0].textContent.trim() === payload.tagName;
      });
      if (matches.length !== 1) return { ready: false, count: matches.length };
      const cells = matches[0].querySelectorAll('td');
      return {
        ready:
          cells[1].textContent.trim() === payload.kindLabel &&
          cells[2].textContent.trim() === payload.prompt &&
          cells[3].textContent.trim().length > 0 &&
          (!payload.expectedResultUser ||
            cells[3].textContent.trim() === payload.expectedResultUser),
        count: 1,
        kind: cells[1].textContent.trim(),
        prompt: cells[2].textContent.trim(),
        resultUser: cells[3].textContent.trim(),
      };
    },
    [{ scope, tagName, prompt, kindLabel, expectedResultUser }],
    (result) => {
      const state = result && result.value ? result.value : { ready: false, count: 0 };
      if (state.ready) {
        browser.assert.ok(true, `${scope}のAI設定が${tagName}に引き継がれています。`);
        if (onReady) onReady(true, state);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${scope}のAI設定が一致しません: ${JSON.stringify(state)}`);
        if (onReady) onReady(false, state);
        return;
      }
      browser.pause(300, () =>
        waitForScopedSetting(
          browser,
          { scope, tagName, prompt, kindLabel, expectedResultUser },
          attempt + 1,
          onReady
        )
      );
    }
  );
};

const selectAlternateScopedResultUser = (
  browser,
  { scope, tagName, expectedResultUser },
  attempt = 0,
  onReady
) => {
  const rootSelector = `[data-testid="scoped-ai-analysis-settings-${scope}"]`;
  browser.execute(
    function (payload) {
      const root = document.querySelector(payload.rootSelector);
      const rows = root ? Array.from(root.querySelectorAll('table.settings-table tbody tr')) : [];
      const row = rows.find((candidate) => {
        const firstCell = candidate.querySelector('td');
        return firstCell && firstCell.textContent.trim() === payload.tagName;
      });
      if (!row) return { ok: false, reason: 'row-missing' };
      const buttons = Array.from(row.querySelectorAll('button')).filter(
        (button) =>
          button.textContent.trim() === '編集' &&
          !button.disabled &&
          (button.offsetParent || button.getClientRects().length)
      );
      if (buttons.length !== 1) return { ok: false, reason: `edit-count:${buttons.length}` };
      buttons[0].click();
      return { ok: true };
    },
    [{ rootSelector, tagName }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'no-result' };
      browser.assert.ok(state.ok, `フロア編集ユーザが対象範囲の設定編集を開きました: ${state.reason || 'clicked'}。`);
    }
  );

  const searchAndSelect = () => {
    browser.execute(
      function (payload) {
        const root = document.querySelector(payload.rootSelector);
        const search = root
          ? root.querySelector(`#scoped-ai-analysis-settings-${payload.scope}-result-user-search`)
          : null;
        const button = root ? root.querySelector('.ai-analysis-setting-fields__result-user-search button') : null;
        if (!search || !button || search.disabled || button.disabled) {
          return { ok: false, reason: 'search-controls-unavailable' };
        }
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        button.click();
        return { ok: true };
      },
      [{ rootSelector, scope }],
      (result) => {
        const state = result && result.value ? result.value : { ok: false, reason: 'no-result' };
        if (!state.ok) {
          browser.assert.ok(false, `フロア編集ユーザによる結果投稿ユーザの検索を開始できませんでした: ${state.reason}。`);
          if (onReady) onReady(false, '');
          return;
        }

        const select = (currentAttempt) => {
          browser.execute(
            function (payload) {
              const root = document.querySelector(payload.rootSelector);
              const search = root
                ? root.querySelector(
                    `#scoped-ai-analysis-settings-${payload.scope}-result-user-search`
                  )
                : null;
              const radios = root
                ? Array.from(
                    root.querySelectorAll(
                      '.ai-analysis-setting-fields__result-user-list input[type="radio"]'
                    )
                  )
                : [];
              const alternate = radios.find((radio) => {
                const label = radio.closest('label');
                return (
                  !radio.disabled &&
                  label &&
                  label.textContent.trim() &&
                  label.textContent.trim() !== payload.expectedResultUser
                );
              });
              if (!search || search.disabled || !alternate) {
                return {
                  ready: false,
                  searchDisabled: search ? !!search.disabled : null,
                  choices: radios.map((radio) => radio.closest('label')?.textContent.trim() || ''),
                };
              }
              alternate.click();
              return {
                ready: alternate.checked,
                resultUser: alternate.closest('label')?.textContent.trim() || '',
              };
            },
            [{ rootSelector, scope, expectedResultUser }],
            (selectionResult) => {
              const selection =
                selectionResult && selectionResult.value
                  ? selectionResult.value
                  : { ready: false };
              if (selection.ready && selection.resultUser) {
                browser.assert.ok(
                  selection.resultUser !== expectedResultUser,
                  `フロア編集ユーザが${scope}の結果投稿ユーザを別のユーザへ変更しました。`
                );
                if (onReady) onReady(true, selection.resultUser);
                return;
              }
              if (currentAttempt >= 30) {
                browser.assert.ok(
                  false,
                  `別の結果投稿ユーザを選択できませんでした: ${JSON.stringify(selection)}`
                );
                if (onReady) onReady(false, '');
                return;
              }
              browser.pause(300, () => select(currentAttempt + 1));
            }
          );
        };
        select(0);
      }
    );
  };

  const check = (currentAttempt) => {
    browser.execute(
      function (payload) {
        const root = document.querySelector(payload.rootSelector);
        const preview = root ? root.querySelector('.parent-preview') : null;
        const search = root
          ? root.querySelector(`#scoped-ai-analysis-settings-${payload.scope}-result-user-search`)
          : null;
        const selectedUser = root
          ? root.querySelector('.ai-analysis-setting-fields__selected-user')
          : null;
        const selectedUserText = selectedUser?.textContent.trim() || '';
        return {
          ready:
            !preview &&
            !!search &&
            !search.disabled &&
            selectedUserText.includes(payload.expectedResultUser),
          previewVisible: !!preview,
          resultUser: selectedUserText,
          hasEditableSearch: !!search,
          searchDisabled: search ? !!search.disabled : null,
        };
      },
      [{ rootSelector, scope, expectedResultUser }],
      (result) => {
        const state = result && result.value ? result.value : { ready: false };
        if (state.ready) {
          browser.assert.ok(true, `フロア編集ユーザによる${scope}の結果投稿ユーザの選択が反映され、編集可能です。`);
          searchAndSelect();
          return;
        }
        if (currentAttempt >= 30) {
          browser.assert.ok(false, `フロア編集ユーザの結果投稿ユーザの選択欄を操作できませんでした: ${JSON.stringify(state)}`);
          if (onReady) onReady(false, '');
          return;
        }
        browser.pause(300, () => check(currentAttempt + 1));
      }
    );
  };
  check(attempt);
};

const updateScopedSettingPrompt = (
  browser,
  { scope, prompt, analysisKind = 'conversation' },
  onSaved
) => {
  const formViewSelector = `[data-testid="scoped-ai-analysis-settings-${scope}-form"]`;
  const kindSelector = `#scoped-ai-analysis-settings-${scope}-kind`;
  const promptSelector = `#scoped-ai-analysis-settings-${scope}-prompt`;
  browser.waitForElementVisible(formViewSelector, 10000);
  browser.execute(
    function (payload) {
      const root = document.querySelector(payload.rootSelector);
      const kind = root ? root.querySelector(payload.kindSelector) : null;
      const prompt = root ? root.querySelector(payload.promptSelector) : null;
      if (!root || !kind || !prompt) return { ok: false, reason: 'controls-missing' };
      if (kind.value !== payload.analysisKind) {
        return { ok: false, reason: `kind:${kind.value || 'empty'}` };
      }
      prompt.value = payload.prompt;
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: prompt.value === payload.prompt, reason: 'prompt-value' };
    },
    [
      {
        rootSelector: `[data-testid="scoped-ai-analysis-settings-${scope}"]`,
        kindSelector,
        promptSelector,
        analysisKind,
        prompt,
      },
    ],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'no-result' };
      browser.assert.ok(state.ok, `対象範囲のAI設定にプロンプトを設定しました: ${state.reason || 'ok'}。`);
    }
  );
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: formViewSelector,
    submitSelector: '.setting-form-actions button:last-child',
    expectedControls: [
      { selector: kindSelector, property: 'value', value: analysisKind },
      { selector: promptSelector, property: 'value', value: prompt },
    ],
    label: `${scope}のAI設定のプロンプト更新`,
  });
  browser.waitForElementNotPresent(formViewSelector, 15000);
  browser.perform(() => {
    browser.assert.ok(true, `プロンプトの更新後に${scope}のAI設定フォームが閉じました。`);
    if (onSaved) onSaved(true);
  });
};

const deleteScopedSetting = (browser, { scope, tagName }, onDeleted) => {
  browser.execute(function (payload) {
    const root = document.querySelector(`[data-testid="scoped-ai-analysis-settings-${payload.scope}"]`);
    const rows = root ? Array.from(root.querySelectorAll('table.settings-table tbody tr')) : [];
    const matches = rows.filter((row) => row.querySelector('td')?.textContent.trim() === payload.tagName);
    if (matches.length !== 1) return { id: '' };
    const buttons = Array.from(matches[0].querySelectorAll('button[id*="-delete-desktop-"]'))
      .filter((button) => !button.disabled && (button.offsetParent || button.getClientRects().length));
    if (buttons.length !== 1) return { id: '' };
    buttons[0].click();
    return { id: buttons[0].id };
  }, [{ scope, tagName }], (result) => {
    const id = result.value?.id;
    browser.assert.ok(Boolean(id), `${scope}のAI設定の削除確認を開きます。`);
    if (!id) return onDeleted(false);
    const dialog = '[data-testid="management-lifecycle-dialog"]';
    browser.waitForElementVisible(dialog, 10000);
    browser.assert.textContains(dialog, 'この操作は元に戻せません');
    clickSingleVisible(browser, `${dialog} [data-testid="management-lifecycle-confirm"]`, 'AI設定の削除を確定');
    browser.waitForElementNotPresent(dialog, 10000);
    browser.waitForElementNotPresent(`#${id}`, 10000);
    browser.perform((done) => { onDeleted(true); done(); });
  });
};

const closeScopedDialog = (browser, scope, onClosed) => {
  browser.execute(
    function (targetScope) {
      const root = document.querySelector(
        `[data-testid="scoped-ai-analysis-settings-${targetScope}"]`
      );
      const candidates = root
        ? Array.from(root.querySelectorAll('button')).filter((button) => {
            if (button.disabled || !(button.offsetParent || button.getClientRects().length)) return false;
            return button.textContent.trim() === '閉じる' || button.getAttribute('aria-label') === '閉じる';
          })
        : [];
      if (candidates.length !== 1) return { ok: false, count: candidates.length };
      candidates[0].click();
      return { ok: true, count: 1 };
    },
    [scope],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, count: 0 };
      browser.assert.ok(state.ok, `表示中の${scope}のAI設定を閉じる操作を1件だけクリックしました。`);
    }
  );
  browser.waitForElementNotVisible(
    `[data-testid="scoped-ai-analysis-settings-${scope}"]`,
    15000,
    false,
    (result) => {
      const closed = !(result && typeof result.status === 'number' && result.status !== 0);
      browser.assert.ok(closed, `${scope}のAI設定ダイアログが閉じました。`);
      if (onClosed) onClosed(closed);
    }
  );
};

const submitTaggedPost = (browser, { content, tagName }, onSubmitted) => {
  clickSingleVisible(browser, '[data-testid="timeline-post-button"]', 'タグ付き投稿のダイアログを開く');
  browser.waitForElementVisible('[data-testid="dialog-edit-post"]', 10000);

  const applyAndSubmit = (attempt = 0) => {
    browser.execute(
      function (payload) {
        const dialog = document.querySelector('[data-testid="dialog-edit-post"]');
        const content = dialog ? dialog.querySelector('#post_content') : null;
        if (!dialog || !content) return { ok: false, retryable: false, reason: 'dialog-missing' };
        const toggle = dialog.querySelector('[data-testid="dialog-edit-post-tags-toggle"]');
        if (!toggle || toggle.disabled) return { ok: false, retryable: false, reason: 'tag-toggle-unavailable' };
        if (toggle.getAttribute('aria-expanded') !== 'true') {
          toggle.click();
          return { ok: false, retryable: true, reason: 'tag-opening' };
        }
        const matches = Array.from(dialog.querySelectorAll('[data-testid^="tag-selector-checkbox-"]'))
          .filter((candidate) => candidate.closest('label')?.textContent.trim() === payload.tagName);
        if (matches.length > 1) return { ok: false, retryable: false, reason: 'tag-ambiguous' };
        const checkbox = matches[0];
        if (!checkbox) return { ok: false, retryable: true, reason: 'tag-loading' };
        if (!(checkbox.offsetParent || checkbox.getClientRects().length)) {
          return { ok: false, retryable: true, reason: 'tag-hidden' };
        }
        if (checkbox.disabled) return { ok: false, retryable: false, reason: 'tag-disabled' };
        content.value = payload.content;
        content.dispatchEvent(new Event('input', { bubbles: true }));
        if (!checkbox.checked) checkbox.click();
        return { ok: content.value === payload.content && checkbox.checked, retryable: false };
      },
      [{ content, tagName }],
      (result) => {
        const state = result && result.value ? result.value : { ok: false, retryable: false };
        if (!state.ok) {
          if (state.retryable && attempt < 30) {
            browser.pause(300, () => applyAndSubmit(attempt + 1));
            return;
          }
          browser.assert.ok(false, `タグ付き投稿のフォームを準備できませんでした: ${state.reason || 'unknown'}。`);
          if (onSubmitted) onSubmitted(false);
          return;
        }

        browser.assert.ok(true, 'タグ付き投稿のフォームに値を設定しました。');
        clickSingleVisibleAfterExactControls(browser, {
          anchorSelector: '#edit_post_dialog_title',
          submitSelector: '[data-testid="dialog-edit-post-submit"]',
          expectedControls: [{ selector: '#post_content', property: 'value', value: content }],
          label: `タグ付き投稿を送信（${tagName}）`,
        });
        browser.waitForElementNotVisible(
          '[data-testid="dialog-edit-post"]',
          15000,
          false,
          (closeResult) => {
            const submitted = !(
              closeResult &&
              typeof closeResult.status === 'number' &&
              closeResult.status !== 0
            );
            browser.assert.ok(submitted, '保存後にタグ付き投稿のダイアログが閉じました。');
            if (onSubmitted) onSubmitted(submitted);
          }
        );
      }
    );
  };
  applyAndSubmit();
};

const assertPostHasNoSupplements = (browser, content, attempt = 0, onReady) => {
  const maxAttempts = 10;
  browser.execute(
    function (targetContent) {
      const posts = Array.from(document.querySelectorAll('article[data-timeline-item-id]')).filter((post) => {
        if (!post.querySelector(':scope > .post')) return false;
        const text = post.querySelector('.text');
        return text && text.textContent.includes(targetContent);
      });
      return {
        postCount: posts.length,
        supplementCount: posts.length === 1 ? posts[0].querySelectorAll('article.supplement').length : -1,
      };
    },
    [content],
    (result) => {
      const state = result && result.value ? result.value : { postCount: 0, supplementCount: -1 };
      if (state.postCount !== 1 || state.supplementCount !== 0) {
        browser.assert.ok(
          false,
          `外部サービス無効時のタグ付き投稿を、AIによる付加情報なしで保存しました: ${JSON.stringify(state)}`
        );
        if (onReady) onReady(false);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(true, '外部サービス無効時のタグ付き投稿に、AIによる付加情報が追加されていません。');
        if (onReady) onReady(true);
        return;
      }
      browser.pause(300, () => assertPostHasNoSupplements(browser, content, attempt + 1, onReady));
    }
  );
};

module.exports = {
  createCategoryTagByApiActor,
  assertOpenAIProviderDisabled,
  waitForCommonSetting,
  waitForCommonSettingAbsent,
  clickCommonSettingAction,
  submitCommonSettingForm,
  waitForScopedSetting,
  selectAlternateScopedResultUser,
  updateScopedSettingPrompt,
  closeScopedDialog,
  deleteScopedSetting,
  submitTaggedPost,
  assertPostHasNoSupplements,
};
