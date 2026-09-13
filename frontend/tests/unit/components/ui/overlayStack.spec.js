import { expect } from 'vitest';
import store from '@/store';
import {
  getTopPanel,
  registerDialog,
  subscribeStackChange,
  unregisterDialog,
  updateDialog,
} from '@/components/ui/overlayStack';

const makeVisible = (element) => {
  element.getClientRects = () => [{ width: 10, height: 10 }];
  return element;
};

const createDialogElements = (focusableCount = 0) => {
  const wrapper = document.createElement('div');
  const backdrop = document.createElement('div');
  const panel = document.createElement('div');
  backdrop.className = 'ui-dialog__backdrop';
  panel.className = 'ui-dialog__panel';
  panel.tabIndex = -1;
  wrapper.appendChild(backdrop);
  wrapper.appendChild(panel);

  const focusables = Array.from({ length: focusableCount }, () => {
    const button = makeVisible(document.createElement('button'));
    panel.appendChild(button);
    return button;
  });
  document.body.appendChild(wrapper);

  return { wrapper, backdrop, panel, focusables };
};

describe('ダイアログの重なりとフォーカスの管理', () => {
  let originalDispatch;
  let originalOverflow;
  let originalConsoleWarn;
  let dispatchCalls;
  let activeTokens;
  let createdWrappers;

  const register = (elements, options = {}) => {
    const token = registerDialog({
      wrapper: elements.wrapper,
      panel: elements.panel,
      closeOnEscape: true,
      requestClose: () => {},
      ...options,
    });
    activeTokens.add(token);
    return token;
  };

  const unregister = (token) => {
    unregisterDialog(token);
    activeTokens.delete(token);
  };

  const createElements = (focusableCount) => {
    const elements = createDialogElements(focusableCount);
    createdWrappers.push(elements.wrapper);
    return elements;
  };

  beforeEach(() => {
    originalDispatch = store.dispatch;
    originalOverflow = document.documentElement.style.overflow;
    originalConsoleWarn = console.warn;
    dispatchCalls = [];
    activeTokens = new Set();
    createdWrappers = [];
    store.dispatch = (action, payload) => {
      dispatchCalls.push([action, payload]);
    };
  });

  afterEach(() => {
    activeTokens.forEach((token) => unregisterDialog(token));
    createdWrappers.forEach((wrapper) => wrapper.remove());
    document.documentElement.style.overflow = originalOverflow;
    store.dispatch = originalDispatch;
    console.warn = originalConsoleWarn;
  });

  it('管理用トークンを返し、公開APIから最前面のパネルを取得・更新・解除できる', () => {
    const elements = createElements();
    const initialCalls = [];
    const updatedCalls = [];
    const token = register(elements, {
      requestClose: (payload) => initialCalls.push(payload),
    });

    expect(token).to.be.a('symbol');
    expect(getTopPanel()).to.equal(elements.panel);

    updateDialog(token, {
      closeOnEscape: true,
      requestClose: (payload) => updatedCalls.push(payload),
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(initialCalls).to.deep.equal([]);
    expect(updatedCalls).to.deep.equal([{ reason: 'escape' }]);

    unregister(token);
    expect(getTopPanel()).to.equal(null);
  });

  it('スタック途中のエントリだけを解除し、順序とz-indexを詰め直す', () => {
    const first = createElements();
    const middle = createElements();
    const last = createElements();
    register(first);
    const middleToken = register(middle);
    register(last);

    unregister(middleToken);

    expect(getTopPanel()).to.equal(last.panel);
    expect(first.wrapper.style.zIndex).to.equal('1000');
    expect(first.backdrop.style.zIndex).to.equal('1000');
    expect(first.panel.style.zIndex).to.equal('1001');
    expect(last.wrapper.style.zIndex).to.equal('1002');
    expect(last.backdrop.style.zIndex).to.equal('1002');
    expect(last.panel.style.zIndex).to.equal('1003');
  });

  it('解除したエントリのwrapperと子要素からスタック用z-indexを除去する', () => {
    const elements = createElements();
    const token = register(elements);

    unregister(token);

    expect(elements.wrapper.style.zIndex).to.equal('');
    expect(elements.backdrop.style.zIndex).to.equal('');
    expect(elements.panel.style.zIndex).to.equal('');
  });

  it('2枚目の登録時は下層だけをinertかつaria-hiddenにする', () => {
    const lower = createElements();
    const upper = createElements();
    register(lower);
    register(upper);

    expect(lower.panel.hasAttribute('inert')).to.equal(true);
    expect(lower.panel.getAttribute('aria-hidden')).to.equal('true');
    expect(upper.panel.hasAttribute('inert')).to.equal(false);
    expect(upper.panel.hasAttribute('aria-hidden')).to.equal(false);
  });

  it('最前面解除時は残ったパネルを有効化してからフォーカスできる', () => {
    const lower = createElements();
    const upper = createElements();
    register(lower);
    const upperToken = register(upper);

    unregister(upperToken);
    lower.panel.focus();

    expect(lower.panel.hasAttribute('inert')).to.equal(false);
    expect(lower.panel.hasAttribute('aria-hidden')).to.equal(false);
    expect(document.activeElement).to.equal(lower.panel);
  });

  it('最前面だけがEscapeを処理し、closeOnEscape=falseでは妨げない', () => {
    const lower = createElements();
    const upper = createElements();
    const calls = [];
    register(lower, {
      requestClose: () => calls.push('lower'),
    });
    const upperToken = register(upper, {
      requestClose: () => calls.push('upper'),
    });

    const handledEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(handledEvent);
    expect(calls).to.deep.equal(['upper']);
    expect(handledEvent.defaultPrevented).to.equal(true);

    updateDialog(upperToken, {
      closeOnEscape: false,
      requestClose: () => calls.push('updated-upper'),
    });
    const ignoredEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ignoredEvent);

    expect(calls).to.deep.equal(['upper']);
    expect(ignoredEvent.defaultPrevented).to.equal(false);
  });

  it('最前面パネルのTab端点だけを循環させる', () => {
    const lower = createElements(2);
    const upper = createElements(2);
    register(lower);
    register(upper);
    const [first, last] = upper.focusables;

    last.focus();
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tab);
    expect(document.activeElement).to.equal(first);
    expect(tab.defaultPrevented).to.equal(true);

    first.focus();
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(shiftTab);
    expect(document.activeElement).to.equal(last);
    expect(shiftTab.defaultPrevented).to.equal(true);
  });

  it('フォーカス可能要素がない時はTabで最前面パネルへフォーカスを固定する', () => {
    const elements = createElements();
    register(elements);
    document.body.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(document.activeElement).to.equal(elements.panel);
    expect(event.defaultPrevented).to.equal(true);
  });

  it('最初の登録と最後の解除でスクロールと背面操作の制限を切り替える', () => {
    document.documentElement.style.setProperty('overflow', 'clip', 'important');
    const first = createElements();
    const second = createElements();
    const firstToken = register(first);
    const secondToken = register(second);

    expect(document.documentElement.style.overflow).to.equal('hidden');
    expect(document.documentElement.style.getPropertyPriority('overflow')).to.equal('');
    expect(dispatchCalls).to.deep.equal([['doSetInertAppContainer', true]]);

    unregister(firstToken);
    expect(document.documentElement.style.overflow).to.equal('hidden');
    expect(dispatchCalls).to.deep.equal([['doSetInertAppContainer', true]]);

    unregister(secondToken);
    expect(document.documentElement.style.overflow).to.equal('clip');
    expect(document.documentElement.style.getPropertyPriority('overflow')).to.equal('important');
    expect(dispatchCalls).to.deep.equal([
      ['doSetInertAppContainer', true],
      ['doSetInertAppContainer', false],
    ]);
  });

  it('ダイアログがある間はキャプチャ段階のkeydownリスナーを1つだけ使う', () => {
    const originalAddEventListener = document.addEventListener;
    const originalRemoveEventListener = document.removeEventListener;
    const added = [];
    const removed = [];
    document.addEventListener = function addEventListener(...args) {
      if (args[0] === 'keydown') added.push(args);
      return originalAddEventListener.apply(this, args);
    };
    document.removeEventListener = function removeEventListener(...args) {
      if (args[0] === 'keydown') removed.push(args);
      return originalRemoveEventListener.apply(this, args);
    };

    try {
      const firstToken = register(createElements());
      const secondToken = register(createElements());
      unregister(firstToken);
      unregister(secondToken);
    } finally {
      document.addEventListener = originalAddEventListener;
      document.removeEventListener = originalRemoveEventListener;
    }

    expect(added).to.have.length(1);
    expect(added[0][2]).to.equal(true);
    expect(removed).to.have.length(1);
    expect(removed[0][1]).to.equal(added[0][1]);
    expect(removed[0][2]).to.equal(true);
  });

  it('スタック変更を通知し、購読解除後は通知しない', () => {
    const notifications = [];
    const unsubscribe = subscribeStackChange((state) => notifications.push(state));
    const first = createElements();
    const token = register(first);

    updateDialog(token, {
      closeOnEscape: false,
      requestClose: () => {},
    });
    unregister(token);
    unsubscribe();

    const secondToken = register(createElements());
    unregister(secondToken);

    expect(notifications).to.deep.equal([
      { size: 1, topPanel: first.panel },
      { size: 1, topPanel: first.panel },
      { size: 0, topPanel: null },
    ]);
  });

  it('未知トークンの解除は例外にせず開発環境警告を出す', () => {
    const warnings = [];
    console.warn = (message) => warnings.push(message);

    unregisterDialog({});

    expect(warnings).to.have.length(1);
    expect(warnings[0]).to.contain('unknown token');
  });
});
