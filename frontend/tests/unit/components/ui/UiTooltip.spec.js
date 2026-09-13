import { expect } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import store from '@/store';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { getTopPanel, registerDialog, unregisterDialog } from '@/components/ui/overlayStack';

const dispatch = (element, type, options = {}) => {
  const event = new Event(type, {
    bubbles: false,
    cancelable: true,
    ...options,
  });
  element.dispatchEvent(event);
  return event;
};

const findElementsById = (id) =>
  Array.from(document.querySelectorAll('[id]')).filter((element) => element.id === id);

describe('ツールチップ（UiTooltip）', () => {
  let originalMatchMedia;
  let originalSetTimeout;
  let originalClearTimeout;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;
  let originalConsoleWarn;
  let originalDispatch;
  let originalInnerWidth;
  let originalInnerHeight;
  let hoverMatches;
  let timers;
  let frames;
  let clearedTimers;
  let canceledFrames;
  let nextTimerId;
  let nextFrameId;
  let warnings;
  let wrappers;
  let dialogElements;
  let activeTokens;

  const factory = ({ props = {}, slot = '<button type="button">操作</button>' } = {}) => {
    const slots = {};
    if (slot !== null) slots.default = slot;
    const wrapper = mount(UiTooltip, {
      attachTo: document.body,
      props: {
        text: '説明',
        ...props,
      },
      slots,
    });
    wrappers.push(wrapper);
    return wrapper;
  };

  const getTrigger = (wrapper) => wrapper.find('.ui-tooltip__anchor').element.children[0];
  const getTooltip = () => document.body.querySelector('.ui-tooltip');

  const makeRects = (
    trigger,
    tooltip,
    triggerRect = {
      left: 100,
      right: 140,
      top: 100,
      bottom: 120,
      width: 40,
      height: 20,
    },
    tooltipRect = {
      left: 0,
      right: 100,
      top: 0,
      bottom: 30,
      width: 100,
      height: 30,
    }
  ) => {
    trigger.getBoundingClientRect = () => triggerRect;
    tooltip.getBoundingClientRect = () => tooltipRect;
  };

  const runTimer = (timerId) => {
    const callback = timers.get(timerId).callback;
    timers.delete(timerId);
    callback();
  };

  const runFrame = (frameId) => {
    const callback = frames.get(frameId);
    frames.delete(frameId);
    callback();
  };

  const createDialog = ({ requestClose = () => {} } = {}) => {
    const wrapper = document.createElement('div');
    const backdrop = document.createElement('div');
    const panel = document.createElement('div');
    backdrop.className = 'ui-dialog__backdrop';
    panel.className = 'ui-dialog__panel';
    panel.tabIndex = -1;
    wrapper.appendChild(backdrop);
    wrapper.appendChild(panel);
    document.body.appendChild(wrapper);
    dialogElements.push(wrapper);
    const token = registerDialog({
      wrapper,
      panel,
      closeOnEscape: true,
      requestClose,
    });
    activeTokens.add(token);
    return { wrapper, panel, token };
  };

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    originalSetTimeout = window.setTimeout;
    originalClearTimeout = window.clearTimeout;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalConsoleWarn = console.warn;
    originalDispatch = store.dispatch;
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    hoverMatches = true;
    timers = new Map();
    frames = new Map();
    clearedTimers = [];
    canceledFrames = [];
    nextTimerId = 1;
    nextFrameId = 1;
    warnings = [];
    wrappers = [];
    dialogElements = [];
    activeTokens = new Set();

    window.matchMedia = () => ({ matches: hoverMatches });
    window.setTimeout = (callback, delay) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    };
    window.clearTimeout = (id) => {
      clearedTimers.push(id);
      timers.delete(id);
    };
    window.requestAnimationFrame = (callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      canceledFrames.push(id);
      frames.delete(id);
    };
    console.warn = (message) => warnings.push(message);
    store.dispatch = () => {};
    window.innerWidth = 300;
    window.innerHeight = 200;
  });

  afterEach(() => {
    wrappers.forEach((wrapper) => {
      if (!wrapper.vm._isDestroyed) wrapper.unmount();
    });
    activeTokens.forEach((token) => unregisterDialog(token));
    dialogElements.forEach((element) => element.remove());
    window.matchMedia = originalMatchMedia;
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    console.warn = originalConsoleWarn;
    store.dispatch = originalDispatch;
    window.innerWidth = originalInnerWidth;
    window.innerHeight = originalInnerHeight;
  });

  it('placementはtopまたはbottomだけを許可し、既定値をbottomにする', () => {
    const placement = UiTooltip.props.placement;

    expect(placement.default).to.equal('bottom');
    expect(placement.validator('top')).to.equal(true);
    expect(placement.validator('bottom')).to.equal(true);
    expect(placement.validator('left')).to.equal(false);
  });

  it('default スロットの直下要素が0個または2個なら警告して表示しない', () => {
    const empty = factory({ slot: null });
    const multiple = factory({
      slot: '<button type="button">一</button><button type="button">二</button>',
    });

    expect(warnings).to.have.length(2);
    expect(warnings.every((message) => message.includes('exactly one'))).to.equal(true);
    expect(empty.find('.ui-tooltip__anchor').element.children).to.have.length(0);
    expect(multiple.find('.ui-tooltip__anchor').element.children).to.have.length(2);
    expect(Array.from(document.querySelectorAll('.ui-tooltip')).every((tooltip) => tooltip.hidden)).to.equal(true);
  });

  it('非表示の説明要素をbodyに常設し、既存のaria-describedbyへIDを追加する', () => {
    const wrapper = factory({
      props: { text: '保存' },
      slot: '<button type="button" aria-describedby="existing-description">保存</button>',
    });
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    const ids = trigger.getAttribute('aria-describedby').split(/\s+/);

    expect(tooltip.parentElement).to.equal(document.body);
    expect(tooltip.hidden).to.equal(true);
    expect(tooltip.getAttribute('role')).to.equal('tooltip');
    expect(tooltip.textContent).to.equal('保存');
    expect(ids).to.have.length(2);
    expect(ids[0]).to.equal('existing-description');
    expect(ids[1].startsWith('ui-tooltip-')).to.equal(true);
    expect(tooltip.id).to.equal(ids[1]);
    expect(findElementsById(ids[1])).to.deep.equal([tooltip]);
  });

  it('同じアプリに2つ表示してもARIA IDを一意にし、それぞれ自身の説明だけを参照する', () => {
    const Host = {
      components: { UiTooltip },
      template: `
        <div>
          <UiTooltip text="一つ目"><button type="button">一</button></UiTooltip>
          <UiTooltip text="二つ目"><button type="button">二</button></UiTooltip>
        </div>
      `,
    };
    const host = mount(Host, { attachTo: document.body });
    wrappers.push(host);
    const tooltipWrappers = host.findAllComponents(UiTooltip);
    const references = tooltipWrappers.map((tooltipWrapper) => {
      const trigger = getTrigger(tooltipWrapper);
      const ids = trigger.getAttribute('aria-describedby').trim().split(/\s+/);
      return {
        tooltipWrapper,
        ids,
        tooltipId: ids[0],
      };
    });

    expect(tooltipWrappers).to.have.length(2);
    expect(references.every(({ ids }) => ids.length === 1)).to.equal(true);
    expect(new Set(references.map(({ tooltipId }) => tooltipId)).size).to.equal(2);
    references.forEach(({ tooltipWrapper, tooltipId }) => {
      const targets = findElementsById(tooltipId);
      expect(targets).to.have.length(1);
      expect(targets[0]).to.equal(tooltipWrapper.vm.tooltipElement);
      expect(targets[0].getAttribute('role')).to.equal('tooltip');
    });
  });

  it('ポインタ進入で即時表示し、離脱100ms後に非表示へ戻す', () => {
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);

    dispatch(trigger, 'mouseenter');
    expect(tooltip.hidden).to.equal(false);

    dispatch(trigger, 'mouseleave');
    const [timerId, timer] = Array.from(timers.entries())[0];
    expect(timer.delay).to.equal(100);
    expect(tooltip.hidden).to.equal(false);

    runTimer(timerId);
    expect(tooltip.hidden).to.equal(true);
  });

  it('フォーカスで表示し、blur後に非表示へ戻す', () => {
    hoverMatches = false;
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);

    dispatch(trigger, 'focus');
    expect(tooltip.hidden).to.equal(false);

    dispatch(trigger, 'blur');
    runTimer(Array.from(timers.keys())[0]);
    expect(tooltip.hidden).to.equal(true);
  });

  it('ホバーできない環境ではポインタを無視し、キーボードのフォーカスでは表示する', () => {
    hoverMatches = false;
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);

    dispatch(trigger, 'mouseenter');
    expect(tooltip.hidden).to.equal(true);

    dispatch(trigger, 'focus');
    expect(tooltip.hidden).to.equal(false);
  });

  it('ポインタがツールチップへ移った時は表示を維持する', () => {
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);

    dispatch(trigger, 'mouseenter');
    dispatch(trigger, 'mouseleave');
    const pendingTimerId = Array.from(timers.keys())[0];
    dispatch(tooltip, 'mouseenter');

    expect(clearedTimers).to.include(pendingTimerId);
    expect(timers.size).to.equal(0);
    expect(tooltip.hidden).to.equal(false);

    dispatch(tooltip, 'mouseleave');
    runTimer(Array.from(timers.keys())[0]);
    expect(tooltip.hidden).to.equal(true);
  });

  it('Escapeキーでフォーカスを維持して隠し、フォーカスとポインタが外れるまで再表示しない', () => {
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);
    trigger.focus();
    expect(document.activeElement).to.equal(trigger);
    expect(tooltip.hidden).to.equal(false);

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    trigger.dispatchEvent(escape);

    expect(escape.defaultPrevented).to.equal(true);
    expect(document.activeElement).to.equal(trigger);
    expect(tooltip.hidden).to.equal(true);

    dispatch(trigger, 'focus');
    expect(tooltip.hidden).to.equal(true);

    dispatch(trigger, 'blur');
    dispatch(trigger, 'focus');
    expect(tooltip.hidden).to.equal(false);
  });

  it('disabledで非表示化し追加ARIAだけを外し、再有効化時に戻す', async () => {
    const wrapper = factory({
      slot: '<button type="button" aria-describedby="existing-description">操作</button>',
    });
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    const tooltipId = tooltip.id;
    makeRects(trigger, tooltip);
    dispatch(trigger, 'mouseenter');

    await wrapper.setProps({ disabled: true });

    expect(tooltip.hidden).to.equal(true);
    expect(trigger.getAttribute('aria-describedby')).to.equal('existing-description');

    await wrapper.setProps({ disabled: false });
    expect(trigger.getAttribute('aria-describedby')).to.equal(`existing-description ${tooltipId}`);
  });

  it('テキスト変更をhidden DOMへ反映し、表示中は位置更新を予約する', async () => {
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);

    await wrapper.setProps({ text: '非表示中の更新' });
    expect(tooltip.textContent).to.equal('非表示中の更新');
    expect(frames.size).to.equal(0);

    dispatch(trigger, 'mouseenter');
    await wrapper.setProps({ text: '表示中の更新' });
    expect(tooltip.textContent).to.equal('表示中の更新');
    expect(frames.size).to.equal(1);
  });

  it('trigger差し替え時に旧リスナーと追加ARIAを外して新triggerへ付ける', async () => {
    const Host = {
      components: { UiTooltip },
      data: () => ({ alternate: false }),
      template: `
        <UiTooltip text="説明">
          <button v-if="!alternate" key="button" aria-describedby="existing">一</button>
          <a v-else key="link" href="#">二</a>
        </UiTooltip>
      `,
    };
    const host = mount(Host, { attachTo: document.body });
    wrappers.push(host);
    const tooltipWrapper = host.findComponent(UiTooltip);
    const oldTrigger = tooltipWrapper.element.children[0];
    const tooltip = getTooltip();
    const tooltipId = tooltip.id;
    makeRects(oldTrigger, tooltip);
    dispatch(oldTrigger, 'mouseenter');

    await host.setData({ alternate: true });
    await nextTick();
    const newTrigger = tooltipWrapper.element.children[0];

    expect(oldTrigger.getAttribute('aria-describedby')).to.equal('existing');
    expect(newTrigger.getAttribute('aria-describedby')).to.equal(tooltipId);
    expect(tooltip.hidden).to.equal(true);
    dispatch(oldTrigger, 'mouseenter');
    expect(tooltip.hidden).to.equal(true);
  });

  it('最前面ダイアログ内だけ表示し、上位ダイアログ登録時は背景ツールチップを隠す', () => {
    const lowerDialog = createDialog();
    const outside = factory();
    const outsideTrigger = getTrigger(outside);
    const outsideTooltip = getTooltip();
    makeRects(outsideTrigger, outsideTooltip);

    dispatch(outsideTrigger, 'mouseenter');
    expect(outsideTooltip.hidden).to.equal(true);

    outside.unmount();
    const mountPoint = document.createElement('div');
    lowerDialog.panel.appendChild(mountPoint);
    const inside = mount(UiTooltip, {
      attachTo: mountPoint,
      props: { text: 'Dialog内' },
      slots: { default: '<button type="button">内側</button>' },
    });
    wrappers.push(inside);
    const insideTrigger = getTrigger(inside);
    const insideTooltip = getTooltip();
    makeRects(insideTrigger, insideTooltip);

    expect(getTopPanel()).to.equal(lowerDialog.panel);
    expect(lowerDialog.panel.contains(insideTrigger)).to.equal(true);
    expect(insideTrigger.getAttribute('aria-describedby')).to.equal(insideTooltip.id);
    dispatch(insideTrigger, 'mouseenter');
    expect(insideTooltip.hidden).to.equal(false);
    expect(insideTooltip.parentElement).to.equal(lowerDialog.panel);

    createDialog();
    expect(insideTooltip.hidden).to.equal(true);
    expect(insideTooltip.parentElement).to.equal(document.body);
  });

  it('ダイアログ内で表示中のEscapeはツールチップだけを隠してダイアログへ伝播しない', () => {
    const closeRequests = [];
    const dialog = createDialog({
      requestClose: (payload) => closeRequests.push(payload),
    });
    const mountPoint = document.createElement('div');
    dialog.panel.appendChild(mountPoint);
    const wrapper = mount(UiTooltip, {
      attachTo: mountPoint,
      props: { text: 'Dialog内' },
      slots: { default: '<button type="button">内側</button>' },
    });
    wrappers.push(wrapper);
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);
    dispatch(trigger, 'focus');

    trigger.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );

    expect(tooltip.hidden).to.equal(true);
    expect(closeRequests).to.deep.equal([]);
  });

  it('既定では下側中央に置き、画面内に収まるよう補正する', () => {
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);

    dispatch(trigger, 'mouseenter');
    expect(tooltip.style.left).to.equal('70px');
    expect(tooltip.style.top).to.equal('128px');

    dispatch(trigger, 'mouseleave');
    runTimer(Array.from(timers.keys())[0]);
    makeRects(trigger, tooltip, {
      left: 0,
      right: 10,
      top: 20,
      bottom: 40,
      width: 10,
      height: 20,
    });
    dispatch(trigger, 'mouseenter');

    expect(tooltip.style.left).to.equal('8px');
    expect(tooltip.style.top).to.equal('48px');
  });

  it('下側に収まらない場合は上側へ表示する', () => {
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip, {
      left: 100,
      right: 140,
      top: 170,
      bottom: 190,
      width: 40,
      height: 20,
    });

    dispatch(trigger, 'mouseenter');

    expect(tooltip.style.left).to.equal('70px');
    expect(tooltip.style.top).to.equal('132px');
  });

  it('placement=topでは上側を優先する', () => {
    const wrapper = factory({ props: { placement: 'top' } });
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);

    dispatch(trigger, 'mouseenter');

    expect(tooltip.style.left).to.equal('70px');
    expect(tooltip.style.top).to.equal('62px');
  });

  it('表示中のサイズ変更とスクロールを同じ描画フレームで処理する', () => {
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    let left = 100;
    trigger.getBoundingClientRect = () => ({
      left,
      right: left + 40,
      top: 100,
      bottom: 120,
      width: 40,
      height: 20,
    });
    tooltip.getBoundingClientRect = () => ({
      left: 0,
      right: 100,
      top: 0,
      bottom: 30,
      width: 100,
      height: 30,
    });
    dispatch(trigger, 'mouseenter');
    left = 140;

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));

    expect(frames.size).to.equal(1);
    runFrame(Array.from(frames.keys())[0]);
    expect(tooltip.style.left).to.equal('110px');
  });

  it('focusTriggerは既定で表示を一度抑止し、指定時だけ表示する', () => {
    const wrapper = factory();
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    const focusCalls = [];
    makeRects(trigger, tooltip);
    trigger.focus = (options) => {
      focusCalls.push(options);
      dispatch(trigger, 'focus');
    };

    wrapper.vm.focusTrigger();
    expect(focusCalls).to.deep.equal([{ preventScroll: true }]);
    expect(tooltip.hidden).to.equal(true);

    wrapper.vm.focusTrigger({ showTooltip: true, preventScroll: false });
    expect(focusCalls[1]).to.deep.equal({ preventScroll: false });
    expect(tooltip.hidden).to.equal(false);
  });

  it('破棄時にARIA、タイマー、フレーム、スタック購読、ツールチップ DOMを後処理する', () => {
    const wrapper = factory({
      slot: '<button type="button" aria-describedby="existing">操作</button>',
    });
    const trigger = getTrigger(wrapper);
    const tooltip = getTooltip();
    makeRects(trigger, tooltip);
    dispatch(trigger, 'mouseenter');
    dispatch(trigger, 'mouseleave');
    window.dispatchEvent(new Event('resize'));
    const timerId = Array.from(timers.keys())[0];
    const frameId = Array.from(frames.keys())[0];

    wrapper.unmount();

    expect(trigger.getAttribute('aria-describedby')).to.equal('existing');
    expect(document.body.contains(tooltip)).to.equal(false);
    expect(clearedTimers).to.include(timerId);
    expect(canceledFrames).to.include(frameId);
    expect(timers.size).to.equal(0);
    expect(frames.size).to.equal(0);

    createDialog();
    expect(document.body.contains(tooltip)).to.equal(false);
  });
});
