const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const ACTIVE_DIALOG_ATTRIBUTE = 'data-e2e-active-dialog';
const ACTIVE_DIALOG_SELECTOR = `[${ACTIVE_DIALOG_ATTRIBUTE}="true"]`;

const sendKeysToActiveElement = (browser, keyOrKeys, callback) => {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  let actions = browser.actions({ async: true });
  if (keys.length === 2 && keys[0] === browser.Keys.SHIFT && keys[1] === browser.Keys.TAB) {
    actions = actions.keyDown(browser.Keys.SHIFT).sendKeys(browser.Keys.TAB).keyUp(browser.Keys.SHIFT);
  } else if (keys.length === 1 && keys[0] === browser.Keys.ESCAPE) {
    actions = actions.keyDown(browser.Keys.ESCAPE).keyUp(browser.Keys.ESCAPE);
  } else {
    actions = actions.sendKeys(...keys);
  }
  actions.perform().then(
    () => callback({ ok: true, reason: '' }),
    (error) => callback({ ok: false, reason: error && error.name ? error.name : 'キー操作に失敗しました' })
  );
};

const clickSingleVisible = (browser, selector, label) => {
  browser.execute(
    function (sel) {
      const candidates = Array.from(document.querySelectorAll(sel)).filter((node) => {
        if (node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
        const style = window.getComputedStyle(node);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
        return !!(node.offsetParent || node.getClientRects().length);
      });
      if (candidates.length !== 1) return { clicked: false, count: candidates.length };
      candidates[0].click();
      return { clicked: true, count: 1 };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, count: -1 };
      const suffix = label ? ` (${label})` : '';
      browser.assert.ok(
        state.clicked && state.count === 1,
        `表示中で有効なクリック対象が1件だけあります${suffix}: ${selector}（count: ${state.count}）`
      );
    }
  );
};

const clickFirstVisible = clickSingleVisible;

const focusAndClickSingleVisible = (browser, selector, label) => {
  browser.execute(
    function (sel) {
      const candidates = Array.from(document.querySelectorAll(sel)).filter((node) => {
        if (node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
        const style = window.getComputedStyle(node);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
        return !!(node.offsetParent || node.getClientRects().length);
      });
      if (candidates.length !== 1) return { clicked: false, count: candidates.length, focused: false };
      candidates[0].focus();
      const focused = document.activeElement === candidates[0];
      candidates[0].click();
      return { clicked: true, count: 1, focused };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, count: -1, focused: false };
      const suffix = label ? ` (${label})` : '';
      browser.assert.ok(
        state.clicked && state.focused && state.count === 1,
        `フォーカスしてクリックする対象は、表示中で有効なものが1件だけあります${suffix}: ${selector}（count: ${state.count}）`
      );
    }
  );
};

const clickSingleVisibleAfterExactControls = (browser, options, onResult) => {
  browser.execute(
    function (payload) {
      const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
        return !!(element.offsetParent || element.getClientRects().length);
      };
      const isEnabled = (element) =>
        !!element && !element.disabled && element.getAttribute('aria-disabled') !== 'true';

      let roots;
      if (payload.anchorSelector) {
        const anchors = Array.from(document.querySelectorAll(payload.anchorSelector));
        if (anchors.length !== 1) {
          return { clicked: false, reason: `anchor-count:${anchors.length}` };
        }
        const dialog = anchors[0].closest('[role="dialog"]');
        roots = dialog && isVisible(dialog) ? [dialog] : [];
      } else if (payload.rootSelector) {
        roots = Array.from(document.querySelectorAll(payload.rootSelector)).filter(isVisible);
      } else {
        roots = [document];
      }
      if (roots.length !== 1) return { clicked: false, reason: `root-count:${roots.length}` };

      const root = roots[0];
      for (const expected of payload.expectedControls || []) {
        const controls = Array.from(root.querySelectorAll(expected.selector)).filter(
          (control) =>
            (expected.requireEnabled === false || isEnabled(control)) &&
            (expected.requireVisible === false || isVisible(control))
        );
        if (controls.length !== 1) {
          return { clicked: false, reason: `control-count:${expected.selector}:${controls.length}` };
        }

        const control = controls[0];
        let actual;
        if (expected.property === 'checked') actual = !!control.checked;
        else if (expected.property === 'filesLength') actual = control.files ? control.files.length : 0;
        else if (expected.property === 'nonEmptyValue') {
          actual = String(control.value == null ? '' : control.value).trim().length > 0;
        } else if (expected.property === 'nonEmptyTextContent') {
          actual = String(control.textContent || '').trim().length > 0;
        } else if (expected.property === 'textContent' || expected.property === 'textContentIncludes') {
          actual = String(control.textContent || '').trim();
        } else {
          actual = String(control.value == null ? '' : control.value);
        }

        const wanted =
          expected.property === 'checked' ||
          expected.property === 'nonEmptyValue' ||
          expected.property === 'nonEmptyTextContent'
            ? !!expected.value
            : expected.property === 'filesLength'
              ? Number(expected.value)
              : String(expected.value);
        const matched = expected.property === 'textContentIncludes' ? actual.includes(wanted) : actual === wanted;
        if (!matched) return { clicked: false, reason: `control-value:${expected.selector}` };
      }

      const candidates = Array.from(root.querySelectorAll(payload.submitSelector)).filter(
        (candidate) => isEnabled(candidate) && isVisible(candidate)
      );
      if (candidates.length !== 1) {
        return { clicked: false, reason: `candidate-count:${candidates.length}` };
      }
      candidates[0].click();
      return { clicked: true, reason: '' };
    },
    [options],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'execute-failed' };
      browser.assert.ok(
        state.clicked === true,
        `${options.label || '対象を特定した入力の送信'}に失敗しました（${state.reason || 'unknown'}）。`
      );
      if (typeof onResult === 'function') onResult(state);
    }
  );
};

const waitForConfirmDialog = (browser, rootSelector, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (selector) {
      const panels = Array.from(document.querySelectorAll(`${selector} [role="dialog"]`)).filter(
        (panel) => panel.offsetParent || panel.getClientRects().length
      );
      if (panels.length !== 1) {
        return { ready: false, reason: `visible-panel-count:${panels.length}` };
      }
      const panel = panels[0];
      const titleId = panel.getAttribute('aria-labelledby') || '';
      const descriptionIds = (panel.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const countId = (id) => Array.from(panel.querySelectorAll('[id]')).filter((element) => element.id === id).length;
      const ready =
        !!titleId &&
        countId(titleId) === 1 &&
        descriptionIds.length > 0 &&
        descriptionIds.every((id) => countId(id) === 1);
      return { ready, reason: JSON.stringify({ titleId, descriptionIds }) };
    },
    [rootSelector],
    (result) => {
      const state = result && result.value ? result.value : { ready: false, reason: 'execute-failed' };
      const assertionLabel = label || '確認ダイアログ';
      if (state.ready) {
        browser.assert.ok(true, `${assertionLabel}のアクセシビリティを確認しました。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${assertionLabel}を操作できませんでした: ${state.reason}`);
        return;
      }
      browser.pause(500, () => waitForConfirmDialog(browser, rootSelector, label, attempt + 1));
    }
  );
};

const openDialogByTrigger = (browser, triggerSelector, dialogSelector, label) => {
  const suffix = label ? ` (${label})` : '';
  browser
    .useCss()
    .waitForElementVisible(triggerSelector, 10000)
    .perform((done) => {
      clickFirstVisible(browser, triggerSelector, `ダイアログを開く${suffix}`);
      done();
    })
    .waitForElementVisible(dialogSelector, 10000);
};

const waitForDialogClosed = (browser, dialogSelector) => {
  browser.waitForElementNotVisible(dialogSelector, 10000);
};

const waitForActiveDialogClosed = (browser, label) => {
  const suffix = label ? ` (${label})` : '';
  browser.perform((done) => {
    const poll = (attempt = 0) => {
      browser.execute(
        function (selector) {
          const visible = Array.from(document.querySelectorAll(selector)).filter(
            (node) => node.offsetParent || node.getClientRects().length
          );
          return { count: visible.length };
        },
        [ACTIVE_DIALOG_SELECTOR],
        (result) => {
          const count = result && result.value ? result.value.count : -1;
          if (count === 0) {
            done();
            return;
          }
          if (count > 1 || attempt >= 40) {
            browser.assert.ok(false, `操作中のダイアログが閉じませんでした${suffix}: count=${count}`);
            done();
            return;
          }
          browser.pause(250, () => poll(attempt + 1));
        }
      );
    };
    poll();
  });
};

const closeDialogWithEsc = (browser, dialogSelector, label, onClosed) => {
  const suffix = label ? ` (${label})` : '';
  browser.execute(
    function (payload) {
      document.querySelectorAll(`[${payload.attribute}]`).forEach((node) => {
        node.removeAttribute(payload.attribute);
      });
      const targetNodes = Array.from(document.querySelectorAll(payload.dialogSelector));
      const dialogNodes = targetNodes.flatMap((node) => {
        if (node.matches('[role="dialog"]')) return [node];
        const ancestor = node.closest('[role="dialog"]');
        if (ancestor) return [ancestor];
        return Array.from(node.querySelectorAll('[role="dialog"]'));
      });
      const visibleDialogs = Array.from(new Set(dialogNodes)).filter(
        (node) => node && (node.offsetParent || node.getClientRects().length)
      );
      if (visibleDialogs.length !== 1) return { marked: false, count: visibleDialogs.length };
      const dialog = visibleDialogs[0];
      dialog.setAttribute(payload.attribute, 'true');
      return { marked: true, count: 1 };
    },
    [{ attribute: ACTIVE_DIALOG_ATTRIBUTE, dialogSelector }],
    (result) => {
      const state = result && result.value ? result.value : { marked: false, count: -1 };
      browser.assert.ok(
        state.marked && state.count === 1,
        `Escapeキー操作前に、操作中のダイアログを1件だけ特定しました${suffix}: count=${state.count}`
      );
    }
  );
  // フォーカスを外したUiTooltipが100ms残ってEscapeを先に処理するため、消えるまで待つ。
  browser.pause(150).perform((done) => {
    sendKeysToActiveElement(browser, browser.Keys.ESCAPE, (state) => {
      browser.assert.ok(state.ok, `操作中のダイアログへEscapeキーを送りました${suffix}: ${state.reason || 'ok'}`);
      done();
    });
  });
  waitForActiveDialogClosed(browser, label);
  browser.execute(
    function (attribute) {
      document.querySelectorAll(`[${attribute}]`).forEach((node) => {
        node.removeAttribute(attribute);
      });
    },
    [ACTIVE_DIALOG_ATTRIBUTE]
  );
  if (typeof onClosed === 'function') onClosed();
};

const readDialogFocusableEdges = (browser, dialogSelector, callback) => {
  browser.execute(
    function (payload) {
      const targetNodes = Array.from(document.querySelectorAll(payload.dialogSelector));
      const dialogNodes = targetNodes.flatMap((node) => {
        if (node.matches('[role="dialog"]')) return [node];
        const ancestor = node.closest('[role="dialog"]');
        if (ancestor) return [ancestor];
        return Array.from(node.querySelectorAll('[role="dialog"]'));
      });
      const uniqueDialogs = Array.from(new Set(dialogNodes));
      const visibleDialogs = uniqueDialogs.filter(
        (node) => node && (node.offsetParent || node.getClientRects().length)
      );
      if (visibleDialogs.length !== 1) {
        return { ok: false, reason: `visible-dialog-count:${visibleDialogs.length}` };
      }
      const dialog = visibleDialogs[0];
      const focusableNodes = Array.from(dialog.querySelectorAll(payload.selector)).filter((el) => {
        if (el.tabIndex < 0 || el.disabled) return false;
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const identify = (el, index) => {
        if (!el) return '';
        const testId = el.getAttribute('data-testid');
        if (testId) return `testid:${testId}`;
        if (el.id) return `id:${el.id}`;
        const name = el.getAttribute('name');
        if (name) return `name:${name}`;
        const label = el.getAttribute('aria-label');
        if (label) return `aria:${label}`;
        return `${el.tagName.toLowerCase()}:${index}`;
      };
      const first = focusableNodes[0];
      const last = focusableNodes[focusableNodes.length - 1];
      const active = document.activeElement;
      const activeIndex = focusableNodes.indexOf(active);
      return {
        ok: true,
        count: focusableNodes.length,
        firstId: identify(first, 0),
        lastId: identify(last, focusableNodes.length - 1),
        activeId: identify(active, activeIndex >= 0 ? activeIndex : 0),
        activeWithin: dialog.contains(active),
      };
    },
    [{ dialogSelector, selector: FOCUSABLE_SELECTOR }],
    (result) => callback(result && result.value ? result.value : { ok: false, reason: 'execute-failed' })
  );
};

const focusDialogEdge = (browser, dialogSelector, position, callback) => {
  browser.execute(
    function (payload) {
      const targetNodes = Array.from(document.querySelectorAll(payload.dialogSelector));
      const dialogNodes = targetNodes.flatMap((node) => {
        if (node.matches('[role="dialog"]')) return [node];
        const ancestor = node.closest('[role="dialog"]');
        if (ancestor) return [ancestor];
        return Array.from(node.querySelectorAll('[role="dialog"]'));
      });
      const uniqueDialogs = Array.from(new Set(dialogNodes));
      const visibleDialogs = uniqueDialogs.filter(
        (node) => node && (node.offsetParent || node.getClientRects().length)
      );
      if (visibleDialogs.length !== 1) {
        return { ok: false, reason: `visible-dialog-count:${visibleDialogs.length}` };
      }
      const dialog = visibleDialogs[0];
      const focusableNodes = Array.from(dialog.querySelectorAll(payload.selector)).filter((el) => {
        if (el.tabIndex < 0 || el.disabled) return false;
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!focusableNodes.length) return { ok: false, reason: 'focusable-not-found' };
      const identify = (el, index) => {
        if (!el) return '';
        const testId = el.getAttribute('data-testid');
        if (testId) return `testid:${testId}`;
        if (el.id) return `id:${el.id}`;
        const name = el.getAttribute('name');
        if (name) return `name:${name}`;
        const label = el.getAttribute('aria-label');
        if (label) return `aria:${label}`;
        return `${el.tagName.toLowerCase()}:${index}`;
      };
      const target = payload.position === 'last' ? focusableNodes[focusableNodes.length - 1] : focusableNodes[0];
      const index = payload.position === 'last' ? focusableNodes.length - 1 : 0;
      target.focus();
      return { ok: true, id: identify(target, index) };
    },
    [{ dialogSelector, selector: FOCUSABLE_SELECTOR, position }],
    (result) => callback(result && result.value ? result.value : { ok: false, reason: 'execute-failed' })
  );
};

const readActiveElement = (browser, dialogSelector, callback) => {
  browser.execute(
    function (payload) {
      const targetNodes = Array.from(document.querySelectorAll(payload.dialogSelector));
      const dialogNodes = targetNodes.flatMap((node) => {
        if (node.matches('[role="dialog"]')) return [node];
        const ancestor = node.closest('[role="dialog"]');
        if (ancestor) return [ancestor];
        return Array.from(node.querySelectorAll('[role="dialog"]'));
      });
      const uniqueDialogs = Array.from(new Set(dialogNodes));
      const visibleDialogs = uniqueDialogs.filter(
        (node) => node && (node.offsetParent || node.getClientRects().length)
      );
      const dialog = visibleDialogs.length === 1 ? visibleDialogs[0] : null;
      const active = document.activeElement;
      const focusableNodes = dialog
        ? Array.from(dialog.querySelectorAll(payload.selector)).filter((el) => {
            if (el.tabIndex < 0 || el.disabled) return false;
            const style = window.getComputedStyle(el);
            if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
        : [];
      const identify = (el, index) => {
        if (!el) return '';
        const testId = el.getAttribute('data-testid');
        if (testId) return `testid:${testId}`;
        if (el.id) return `id:${el.id}`;
        const name = el.getAttribute('name');
        if (name) return `name:${name}`;
        const label = el.getAttribute('aria-label');
        if (label) return `aria:${label}`;
        return el.tagName ? `${el.tagName.toLowerCase()}:${index}` : '';
      };
      const activeIndex = focusableNodes.indexOf(active);
      return {
        id: identify(active, activeIndex >= 0 ? activeIndex : 0),
        activeWithin: dialog ? dialog.contains(active) : false,
      };
    },
    [{ dialogSelector, selector: FOCUSABLE_SELECTOR }],
    (result) => callback(result && result.value ? result.value : { id: '', activeWithin: false })
  );
};

const assertDialogInert = (browser, dialogSelector, label) => {
  const suffix = label ? ` (${label})` : '';
  browser.execute(
    function (payload) {
      const container = document.getElementById('app_container');
      const backdrop = Array.from(document.querySelectorAll('[data-testid="dialog-backdrop"]')).find(
        (node) => node && (node.offsetParent || node.getClientRects().length)
      );
      const targetNodes = Array.from(document.querySelectorAll(payload.dialogSelector));
      const dialogNodes = targetNodes.flatMap((node) => {
        if (node.matches('[role="dialog"]')) return [node];
        const ancestor = node.closest('[role="dialog"]');
        if (ancestor) return [ancestor];
        return Array.from(node.querySelectorAll('[role="dialog"]'));
      });
      const uniqueDialogs = Array.from(new Set(dialogNodes));
      const visibleDialogs = uniqueDialogs.filter(
        (node) => node && (node.offsetParent || node.getClientRects().length)
      );
      const dialog = visibleDialogs.length === 1 ? visibleDialogs[0] : null;
      return {
        hasContainer: !!container,
        inertProp: container ? !!container.inert : false,
        hasInertAttr: container ? container.hasAttribute('inert') : false,
        appAriaHidden: container ? container.getAttribute('aria-hidden') === 'true' : false,
        hasBackdrop: !!backdrop,
        dialogVisible: dialog ? !!(dialog.offsetParent || dialog.getClientRects().length) : false,
      };
    },
    [{ dialogSelector }],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(state.dialogVisible || state.hasBackdrop, `ダイアログが描画されました${suffix}`);
      browser.assert.ok(
        (state.hasContainer && (state.inertProp || state.hasInertAttr || state.appAriaHidden)) || state.hasBackdrop,
        `ダイアログ表示中は背景を操作できません${suffix}`
      );
    }
  );
};

const assertTabCycle = (browser, dialogSelector, label) => {
  const suffix = label ? ` (${label})` : '';
  browser.perform((done) => {
    readDialogFocusableEdges(browser, dialogSelector, (edges) => {
      if (!edges.ok) {
        browser.assert.ok(false, `フォーカス可能な要素を取得できませんでした${suffix}: ${edges.reason}`);
        done();
        return;
      }
      if (edges.count < 1) {
        browser.assert.ok(false, `ダイアログ内にフォーカス可能な要素がありません${suffix}`);
        done();
        return;
      }
      if (!edges.activeWithin) {
        browser.assert.ok(false, `初期フォーカスがダイアログ内にありません${suffix}`);
        done();
        return;
      }
      focusDialogEdge(browser, dialogSelector, 'last', (lastState) => {
        if (!lastState.ok) {
          browser.assert.ok(false, `末尾の要素へフォーカスできませんでした${suffix}: ${lastState.reason}`);
          done();
          return;
        }
        sendKeysToActiveElement(browser, browser.Keys.TAB, (tabState) => {
          if (!tabState.ok) {
            browser.assert.ok(false, `Tabキーを送れませんでした${suffix}: ${tabState.reason}`);
            done();
            return;
          }
          browser.pause(100, () => {
            readActiveElement(browser, dialogSelector, (activeAfterTab) => {
              browser.assert.ok(activeAfterTab.activeWithin, `Tabキー操作後もフォーカスがダイアログ内にあります${suffix}`);
              browser.assert.ok(
                activeAfterTab.id === edges.firstId,
                `Tabキーで末尾から先頭へ戻ります${suffix}: 期待値=${edges.firstId} 実際=${activeAfterTab.id || 'unknown'}`
              );

              focusDialogEdge(browser, dialogSelector, 'first', (firstState) => {
                if (!firstState.ok) {
                  browser.assert.ok(false, `先頭の要素へフォーカスできませんでした${suffix}: ${firstState.reason}`);
                  done();
                  return;
                }
                sendKeysToActiveElement(browser, [browser.Keys.SHIFT, browser.Keys.TAB], (shiftTabState) => {
                  if (!shiftTabState.ok) {
                    browser.assert.ok(false, `Shift+Tabキーを送れませんでした${suffix}: ${shiftTabState.reason}`);
                    done();
                    return;
                  }
                  browser.pause(100, () => {
                    readActiveElement(browser, dialogSelector, (activeAfterShiftTab) => {
                      browser.assert.ok(
                        activeAfterShiftTab.activeWithin,
                        `Shift+Tabキー操作後もフォーカスがダイアログ内にあります${suffix}`
                      );
                      browser.assert.ok(
                        activeAfterShiftTab.id === edges.lastId,
                        `Shift+Tabキーで先頭から末尾へ戻ります${suffix}: 期待値=${edges.lastId} 実際=${
                          activeAfterShiftTab.id || 'unknown'
                        }`
                      );
                      focusDialogEdge(browser, dialogSelector, 'first', (closeFocusState) => {
                        if (!closeFocusState.ok) {
                          browser.assert.ok(
                            false,
                            `Escapeキー操作前にフォーカスを戻せませんでした${suffix}: ${closeFocusState.reason}`
                          );
                        }
                        done();
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
};

const assertFocusReturned = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (targetSelector) {
      const targets = Array.from(document.querySelectorAll(targetSelector)).filter(
        (node) => node.offsetParent || node.getClientRects().length
      );
      return { returned: targets.length === 1 && document.activeElement === targets[0], count: targets.length };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { returned: false };
      if (!state.returned && attempt < maxAttempts) {
        browser.pause(100, () => assertFocusReturned(browser, selector, label, attempt + 1));
        return;
      }
      browser.assert.ok(
        state.returned,
        `ダイアログを開いたボタン1件へフォーカスが戻ります（${label || selector}, count=${state.count}）`
      );
    }
  );
};

const assertDialogKeyboardBehavior = (browser, dialogSelector, label, options = {}) => {
  assertDialogInert(browser, dialogSelector, label);
  assertTabCycle(browser, dialogSelector, label);
  closeDialogWithEsc(browser, dialogSelector, label, () => {
    if (options.returnFocusSelector) {
      assertFocusReturned(browser, options.returnFocusSelector, label);
    }
  });
};

module.exports = {
  FOCUSABLE_SELECTOR,
  sendKeysToActiveElement,
  clickFirstVisible,
  focusAndClickSingleVisible,
  clickSingleVisible,
  clickSingleVisibleAfterExactControls,
  waitForConfirmDialog,
  openDialogByTrigger,
  waitForDialogClosed,
  readDialogFocusableEdges,
  assertDialogKeyboardBehavior,
  assertTabCycle,
  assertDialogInert,
};
