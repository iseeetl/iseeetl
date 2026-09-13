const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');

const SORT_SUCCESS_MESSAGE = '単語グループの表示順番を更新しました';

const openQuickTextManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/quicktext`;
  navigateToApp(browser, url).waitForElementVisible('[data-testid="quicktext-group-create"]', 10000);
};

const waitForQuickTextManagementReady = (browser, label, attempt = 0, onDone) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      const visible = (node) => !!(node && (node.offsetParent || node.getClientRects().length));
      const app = document.querySelector('#app');
      const view = document.querySelector('.view');
      return {
        path: window.location.pathname || '',
        loginVisible: visible(document.querySelector('#mail')),
        blank: !app || app.childElementCount === 0,
        loading: !!view && view.getAttribute('aria-busy') === 'true',
        groupListVisible: visible(document.querySelector('.group-list')),
        createVisible: visible(document.querySelector('[data-testid="quicktext-group-create"]')),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      const ready =
        state.path === '/management/quicktext' &&
        !state.loginVisible &&
        !state.blank &&
        !state.loading &&
        state.groupListVisible &&
        state.createVisible;
      if (ready) {
        onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${label}: 単語管理の画面が再表示されませんでした: ${JSON.stringify(state)}`);
        onDone(false);
        return;
      }
      browser.pause(300, () => waitForQuickTextManagementReady(browser, label, attempt + 1, onDone));
    }
  );
};

const remountQuickTextManagement = (browser, label, onDone) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/management/floor`).waitForElementVisible('.floor-management-table', 10000);
  navigateToApp(browser, `${base}/management/quicktext`);
  waitForQuickTextManagementReady(browser, label, 0, onDone);
};

const readSnackbar = (browser, onReady) => {
  browser.execute(
    function () {
      const snackbar = document.querySelector('[data-testid="app-snackbar"]');
      const message = snackbar ? snackbar.querySelector('span') : null;
      return {
        visible: !!(snackbar && (snackbar.offsetParent || snackbar.getClientRects().length)),
        message: message && message.textContent ? message.textContent.trim() : '',
      };
    },
    [],
    (result) => onReady(result && result.value ? result.value : { visible: false, message: '' })
  );
};

const waitForSortSaved = (browser, label, attempt = 0, onDone) => {
  const maxAttempts = 30;
  readSnackbar(browser, (state) => {
    if (state.visible && state.message === SORT_SUCCESS_MESSAGE) {
      browser.assert.equal(state.message, SORT_SUCCESS_MESSAGE, `${label}: 並び順の保存要求が成功しました`);
      onDone(true);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `${label}: 並べ替えの成功通知を確認できませんでした: ${JSON.stringify(state)}`);
      onDone(false);
      return;
    }
    browser.pause(300, () => waitForSortSaved(browser, label, attempt + 1, onDone));
  });
};

const waitForSnackbarHidden = (browser, label, attempt = 0, onDone) => {
  const maxAttempts = 20;
  readSnackbar(browser, (state) => {
    if (!state.visible) {
      onDone(true);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `${label}: 前の通知が表示されたままです: ${JSON.stringify(state)}`);
      onDone(false);
      return;
    }
    browser.pause(300, () => waitForSnackbarHidden(browser, label, attempt + 1, onDone));
  });
};

const clickVisible = (browser, selector, label) => {
  browser.execute(
    function (targetSelector) {
      const target = Array.from(document.querySelectorAll(targetSelector)).find(
        (node) => node.offsetParent || node.getClientRects().length
      );
      if (!target) return { clicked: false };
      target.click();
      return { clicked: true };
    },
    [selector],
    (result) => browser.assert.ok(Boolean(result && result.value && result.value.clicked), label)
  );
};

const waitForGroupPresence = (browser, title, shouldExist, attempt = 0, onDone) => {
  const maxAttempts = 20;
  browser.execute(
    function (targetTitle) {
      return Array.from(document.querySelectorAll('.group-item .group-top .field-value')).some(
        (node) => node.textContent && node.textContent.trim() === targetTitle
      );
    },
    [title],
    (result) => {
      const exists = Boolean(result && result.value);
      if (exists === shouldExist) {
        if (onDone) onDone();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `単語グループの有無が確定しませんでした: ${title}`);
        return;
      }
      browser.pause(300, () => waitForGroupPresence(browser, title, shouldExist, attempt + 1, onDone));
    }
  );
};

const createGroup = (browser, title, onDone) => {
  browser
    .waitForElementVisible('[data-testid="quicktext-group-create"]', 10000)
    .click('[data-testid="quicktext-group-create"]')
    .waitForElementVisible('#qt_group_title', 10000)
    .clearValue('#qt_group_title')
    .setValue('#qt_group_title', title);
  clickVisible(browser, '[data-testid="quicktext-dialog-submit"]', `単語グループを作成: ${title}`);
  browser.waitForElementNotVisible('#qt_group_title', 10000);
  waitForGroupPresence(browser, title, true, 0, onDone);
};

const readGroupOrder = (browser, onReady) => {
  browser.execute(
    function () {
      return Array.from(document.querySelectorAll('.group-item .group-top .field-value'))
        .map((node) => (node.textContent || '').trim())
        .filter(Boolean);
    },
    [],
    (result) => onReady(Array.isArray(result && result.value) ? result.value : [])
  );
};

const swapGroupsByTitle = (browser, firstTitle, secondTitle) => {
  browser.execute(
    function (sourceTitle, targetTitle) {
      const groups = Array.from(document.querySelectorAll('.group-list > .group-item'));
      const readTitle = (group) => {
        const node = group.querySelector('.group-top .field-value');
        return node && node.textContent ? node.textContent.trim() : '';
      };
      const sourceMatches = groups
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => readTitle(group) === sourceTitle);
      const targetMatches = groups
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => readTitle(group) === targetTitle);
      if (sourceMatches.length !== 1 || targetMatches.length !== 1) {
        return {
          ok: false,
          reason: `match-count:${sourceMatches.length}:${targetMatches.length}`,
        };
      }
      const source = sourceMatches[0];
      const target = targetMatches[0];
      if (Math.abs(source.index - target.index) !== 1) {
        return { ok: false, reason: `not-adjacent:${source.index}:${target.index}` };
      }
      const sourceHandle = source.group.querySelector('.group-handle');
      const targetHandle = target.group.querySelector('.group-handle');
      if (!sourceHandle || !targetHandle) return { ok: false, reason: 'handle-not-found' };
      const sourceRect = sourceHandle.getBoundingClientRect();
      const targetRect = targetHandle.getBoundingClientRect();
      return {
        ok: true,
        sourceIndex: source.index,
        offset: Math.round(targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2)),
      };
    },
    [firstTitle, secondTitle],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'unknown' };
      browser.assert.ok(state.ok, `作成した単語グループがドラッグ対象です: ${state.reason || 'ok'}`);
      if (state.ok) {
        browser.dragAndDrop(`.group-list > .group-item:nth-child(${state.sourceIndex + 1}) .group-handle`, {
          x: 0,
          y: state.offset,
        });
      }
    }
  );
};

const waitForGroupOrder = (browser, expected, attempt = 0, onDone) => {
  readGroupOrder(browser, (current) => {
    const matches = current.length === expected.length && expected.every((title, index) => current[index] === title);
    if (matches) {
      if (onDone) onDone(true);
      return;
    }
    if (attempt >= 20) {
      browser.assert.ok(false, `単語グループの並び順が確定しませんでした: ${JSON.stringify(current)}`);
      if (onDone) onDone(false);
      return;
    }
    browser.pause(300, () => waitForGroupOrder(browser, expected, attempt + 1, onDone));
  });
};

module.exports = {
  '単語管理でグループを並べ替えられる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'QuickText Management Sort', ({ finish }) => {
      openQuickTextManagement(browser);
      const stamp = Date.now();
      const groupA = `E2ESortA${stamp}`;
      const groupB = `E2ESortB${stamp}`;
      createGroup(browser, groupA, () => {
        createGroup(browser, groupB, () => {
          readGroupOrder(browser, (original) => {
            const groupAIndexes = original
              .map((title, index) => (title === groupA ? index : -1))
              .filter((index) => index >= 0);
            const groupBIndexes = original
              .map((title, index) => (title === groupB ? index : -1))
              .filter((index) => index >= 0);
            if (
              groupAIndexes.length !== 1 ||
              groupBIndexes.length !== 1 ||
              Math.abs(groupAIndexes[0] - groupBIndexes[0]) !== 1
            ) {
              browser.assert.ok(false, '単語の並べ替えには、このテストで作成した隣り合う2グループを使用してください。');
              finish();
              return;
            }
            const firstIndex = Math.min(groupAIndexes[0], groupBIndexes[0]);
            const secondIndex = Math.max(groupAIndexes[0], groupBIndexes[0]);
            const swapped = original.slice();
            [swapped[firstIndex], swapped[secondIndex]] = [swapped[secondIndex], swapped[firstIndex]];
            swapGroupsByTitle(browser, original[firstIndex], original[secondIndex]);
            waitForGroupOrder(browser, swapped, 0, (swappedLocally) => {
              if (!swappedLocally) {
                finish();
                return;
              }
              waitForSortSaved(browser, '入れ替え後の並び順', 0, (swappedSaved) => {
                if (!swappedSaved) {
                  finish();
                  return;
                }
                waitForSnackbarHidden(browser, '入れ替え後の並び順', 0, (snackbarHidden) => {
                  if (!snackbarHidden) {
                    finish();
                    return;
                  }
                  remountQuickTextManagement(browser, '入れ替え後の並び順', (swappedRemounted) => {
                    if (!swappedRemounted) {
                      finish();
                      return;
                    }
                    waitForGroupOrder(browser, swapped, 0, (swappedPersisted) => {
                      if (!swappedPersisted) {
                        finish();
                        return;
                      }
                      swapGroupsByTitle(browser, swapped[firstIndex], swapped[secondIndex]);
                      waitForGroupOrder(browser, original, 0, (restoredLocally) => {
                        if (!restoredLocally) {
                          finish();
                          return;
                        }
                        waitForSortSaved(browser, '復元後の並び順', 0, (restoredSaved) => {
                          if (!restoredSaved) {
                            finish();
                            return;
                          }
                          remountQuickTextManagement(browser, '復元後の並び順', (restoredRemounted) => {
                            if (!restoredRemounted) {
                              finish();
                              return;
                            }
                            waitForGroupOrder(browser, original, 0, () => {
                              finish();
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
