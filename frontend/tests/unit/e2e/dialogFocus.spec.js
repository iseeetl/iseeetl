import { expect } from 'vitest';

const {
  clickSingleVisible,
  clickSingleVisibleAfterExactControls,
  readDialogFocusableEdges,
  sendKeysToActiveElement,
  waitForConfirmDialog,
} = require('../../e2e/specs/helpers/dialog-focus');
const { findOptionalElement } = require('../../e2e/specs/helpers/login');
const { makeFileInputInteractable } = require('../../e2e/specs/helpers/timeline-media-lifecycle');

const makeVisible = (element) => {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
  element.getClientRects = () => [{ width: 10, height: 10 }];
  return element;
};

const createBrowser = () => {
  const assertions = [];
  let pauseCount = 0;
  return {
    assertions,
    get pauseCount() {
      return pauseCount;
    },
    execute(fn, args, callback) {
      callback({ value: fn(...args) });
    },
    pause(delay, callback) {
      pauseCount += 1;
      callback();
    },
    assert: {
      ok(value, message) {
        assertions.push({ value, message });
      },
    },
  };
};

describe('E2Eのダイアログ操作とフォーカス', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Nightwatch 3のW3C actionでShift+Tabを送信してShiftを解放する', async () => {
    const operations = [];
    const actions = {
      keyDown(key) {
        operations.push(['keyDown', key]);
        return this;
      },
      sendKeys(...keys) {
        operations.push(['sendKeys', ...keys]);
        return this;
      },
      keyUp(key) {
        operations.push(['keyUp', key]);
        return this;
      },
      perform() {
        operations.push(['perform']);
        return Promise.resolve();
      },
    };
    const browser = {
      Keys: { SHIFT: 'SHIFT', TAB: 'TAB' },
      actions: () => actions,
    };

    await new Promise((resolve) => {
      sendKeysToActiveElement(browser, [browser.Keys.SHIFT, browser.Keys.TAB], (state) => {
        expect(state).to.deep.equal({ ok: true, reason: '' });
        resolve();
      });
    });

    expect(operations).to.deep.equal([['keyDown', 'SHIFT'], ['sendKeys', 'TAB'], ['keyUp', 'SHIFT'], ['perform']]);
  });

  it('Nightwatch 3のW3C actionでEscapeのkeydownとkeyupを明示する', async () => {
    const operations = [];
    const actions = {
      keyDown(key) {
        operations.push(['keyDown', key]);
        return this;
      },
      keyUp(key) {
        operations.push(['keyUp', key]);
        return this;
      },
      perform() {
        operations.push(['perform']);
        return Promise.resolve();
      },
    };
    const browser = {
      Keys: { ESCAPE: 'ESCAPE' },
      actions: () => actions,
    };

    await new Promise((resolve) => {
      sendKeysToActiveElement(browser, browser.Keys.ESCAPE, (state) => {
        expect(state).to.deep.equal({ ok: true, reason: '' });
        resolve();
      });
    });

    expect(operations).to.deep.equal([['keyDown', 'ESCAPE'], ['keyUp', 'ESCAPE'], ['perform']]);
  });

  it('clickSingleVisibleは表示中かつ有効な候補が1件の場合だけクリックする', () => {
    const browser = createBrowser();
    let clickCount = 0;
    const disabled = makeVisible(document.createElement('button'));
    disabled.disabled = true;
    disabled.className = 'target';
    const target = makeVisible(document.createElement('button'));
    target.className = 'target';
    target.addEventListener('click', () => {
      clickCount += 1;
    });
    document.body.append(disabled, target);

    clickSingleVisible(browser, '.target', '対象が1件');

    expect(clickCount).to.equal(1);
    expect(browser.assertions).to.have.length(1);
    expect(browser.assertions[0].value).to.equal(true);
  });

  it('clickSingleVisibleは表示中かつ有効な候補が0件または2件なら失敗し、クリックしない', () => {
    const emptyBrowser = createBrowser();
    clickSingleVisible(emptyBrowser, '.target', '対象なし');
    expect(emptyBrowser.assertions[0].value).to.equal(false);
    expect(emptyBrowser.assertions[0].message).to.include('count: 0');

    const duplicateBrowser = createBrowser();
    let clickCount = 0;
    const first = makeVisible(document.createElement('button'));
    const second = makeVisible(document.createElement('button'));
    first.className = 'target';
    second.className = 'target';
    first.addEventListener('click', () => {
      clickCount += 1;
    });
    second.addEventListener('click', () => {
      clickCount += 1;
    });
    document.body.append(first, second);

    clickSingleVisible(duplicateBrowser, '.target', '対象の重複');

    expect(clickCount).to.equal(0);
    expect(duplicateBrowser.assertions[0].value).to.equal(false);
    expect(duplicateBrowser.assertions[0].message).to.include('count: 2');
  });

  it('入力値と表示中の送信ボタンが1つであることを確認してから押す', () => {
    const browser = createBrowser();
    let clickCount = 0;
    const root = makeVisible(document.createElement('section'));
    root.className = 'form-root';
    const input = makeVisible(document.createElement('input'));
    input.id = 'name';
    input.value = 'expected';
    const submit = makeVisible(document.createElement('button'));
    submit.className = 'submit';
    submit.addEventListener('click', () => {
      clickCount += 1;
    });
    root.append(input, submit);
    document.body.append(root);

    clickSingleVisibleAfterExactControls(browser, {
      rootSelector: '.form-root',
      expectedControls: [{ selector: '#name', property: 'value', value: 'expected' }],
      submitSelector: '.submit',
      label: 'フォーム送信',
    });

    expect(clickCount).to.equal(1);
    expect(browser.assertions[0].value).to.equal(true);
  });

  it('入力値が一致しない場合や送信ボタンが複数ある場合は押さない', () => {
    const browser = createBrowser();
    let clickCount = 0;
    const root = makeVisible(document.createElement('section'));
    root.className = 'form-root';
    const input = makeVisible(document.createElement('input'));
    input.id = 'name';
    input.value = 'actual';
    const submits = [makeVisible(document.createElement('button')), makeVisible(document.createElement('button'))];
    submits.forEach((submit) => {
      submit.className = 'submit';
      submit.addEventListener('click', () => {
        clickCount += 1;
      });
      root.append(submit);
    });
    root.prepend(input);
    document.body.append(root);

    clickSingleVisibleAfterExactControls(browser, {
      rootSelector: '.form-root',
      expectedControls: [{ selector: '#name', property: 'value', value: 'expected' }],
      submitSelector: '.submit',
      label: '入力不一致のフォーム送信',
    });

    expect(clickCount).to.equal(0);
    expect(browser.assertions[0].value).to.equal(false);
    expect(browser.assertions[0].message).to.include('control-value:#name');

    const duplicateBrowser = createBrowser();
    input.value = 'expected';
    clickSingleVisibleAfterExactControls(duplicateBrowser, {
      rootSelector: '.form-root',
      expectedControls: [{ selector: '#name', property: 'value', value: 'expected' }],
      submitSelector: '.submit',
      label: '対象が重複したフォーム送信',
    });

    expect(clickCount).to.equal(0);
    expect(duplicateBrowser.assertions[0].value).to.equal(false);
    expect(duplicateBrowser.assertions[0].message).to.include('candidate-count:2');
  });

  it('waitForConfirmDialogは表示中パネルのタイトルと説明参照を確認する', () => {
    const browser = createBrowser();
    const root = document.createElement('div');
    root.dataset.testid = 'confirm-dialog';
    const panel = makeVisible(document.createElement('div'));
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'confirm-title');
    panel.setAttribute('aria-describedby', 'confirm-description');
    const title = document.createElement('h2');
    title.id = 'confirm-title';
    const description = document.createElement('p');
    description.id = 'confirm-description';
    panel.append(title, description);
    root.append(panel);
    document.body.append(root);

    waitForConfirmDialog(browser, '[data-testid="confirm-dialog"]', '確認ダイアログ');

    expect(browser.pauseCount).to.equal(0);
    expect(browser.assertions).to.deep.equal([{ value: true, message: '確認ダイアログのアクセシビリティを確認しました。' }]);
  });

  it('ダイアログ root セレクタは内側のパネルだけへ解決し、全ダイアログ指定では複数表示を失敗にする', () => {
    const browser = createBrowser();
    const wrapper = makeVisible(document.createElement('div'));
    wrapper.dataset.testid = 'target-dialog';
    const targetPanel = makeVisible(document.createElement('div'));
    targetPanel.setAttribute('role', 'dialog');
    const targetButton = makeVisible(document.createElement('button'));
    targetButton.getBoundingClientRect = () => ({ width: 10, height: 10 });
    targetPanel.append(targetButton);
    wrapper.append(targetPanel);

    const unrelatedPanel = makeVisible(document.createElement('div'));
    unrelatedPanel.setAttribute('role', 'dialog');
    document.body.append(wrapper, unrelatedPanel);
    targetButton.focus();

    let targetState;
    readDialogFocusableEdges(browser, '[data-testid="target-dialog"]', (state) => {
      targetState = state;
    });
    expect(targetState).to.include({ ok: true, count: 1, activeWithin: true });

    let allDialogsState;
    readDialogFocusableEdges(browser, '[role="dialog"]', (state) => {
      allDialogsState = state;
    });
    expect(allDialogsState).to.deep.equal({ ok: false, reason: 'visible-dialog-count:2' });
  });

  it('findOptionalElementは要素なしをNightwatchエラーにせずstatusへ変換する', () => {
    const browser = {
      elements(strategy, selector, callback) {
        expect(strategy).to.equal('css selector');
        expect(selector).to.equal('.optional');
        callback({ value: [] });
      },
    };

    findOptionalElement(browser, '.optional', (result) => {
      expect(result).to.deep.equal({ status: -1, value: null });
    });
  });

  it('makeFileInputInteractableは非表示ファイル inputを操作可能にする', () => {
    const browser = createBrowser();
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.style.display = 'none';
    document.body.append(input);

    makeFileInputInteractable(browser, 'input[type="file"]');

    expect(input.hidden).to.equal(false);
    expect(input.style.getPropertyValue('display')).to.equal('block');
    expect(input.style.getPropertyPriority('display')).to.equal('important');
    expect(browser.assertions[0].value).to.equal(true);
  });
});
