import { nextTick } from 'vue';
import { expect, vi } from 'vitest';
import { DOMWrapper, mount } from '@vue/test-utils';
import store from '@/store/index.js';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { getTopPanel } from '@/components/ui/overlayStack.js';

const makeVisible = (element) => {
  element.getClientRects = () => [{ width: 10, height: 10 }];
  return element;
};

const flushTicks = async (count = 2) => {
  for (let index = 0; index < count; index += 1) {
    await nextTick();
  }
};

const getDialogRoot = (wrapper) => new DOMWrapper(wrapper.vm.$refs.wrapper);

describe('共通ダイアログ（UiDialog）', () => {
  let originalDispatch;
  let wrappers;
  let extraElements;
  let warnings;
  let warn;

  const factory = ({ props = {}, attrs = {}, slots = {} } = {}) => {
    const titleId = props.titleId || 'sample-dialog-title';
    const resolvedSlots = {
      title: `<h2 id="${titleId}" class="ui-dialog__heading">見出し</h2>`,
      default: '<p>本文</p>',
      ...slots,
    };
    Object.keys(resolvedSlots).forEach((name) => {
      if (resolvedSlots[name] === null) delete resolvedSlots[name];
    });
    const wrapper = mount(UiDialog, {
      props: {
        titleId,
        ...props,
      },
      attrs,
      slots: resolvedSlots,
    });
    wrappers.push(wrapper);
    return wrapper;
  };

  const addElement = (tagName = 'button') => {
    const element = makeVisible(document.createElement(tagName));
    document.body.appendChild(element);
    extraElements.push(element);
    return element;
  };

  beforeEach(() => {
    originalDispatch = store.dispatch;
    store.dispatch = () => {};
    wrappers = [];
    extraElements = [];
    warnings = [];
    warn = vi.spyOn(console, 'warn').mockImplementation((message) => warnings.push(String(message)));
  });

  afterEach(() => {
    wrappers.forEach((wrapper) => {
      if (wrapper.vm?.$ && !wrapper.vm.$.isUnmounted) wrapper.unmount();
    });
    extraElements.forEach((element) => element.remove());
    store.dispatch = originalDispatch;
    warn.mockRestore();
  });

  it('rootをbody直下へ移し、Vue rendererの破棄で削除する', () => {
    const wrapper = factory();
    const root = getDialogRoot(wrapper).element;

    expect(root.parentElement).to.equal(document.body);
    expect(root.style.display).to.equal('none');
    expect(getTopPanel()).to.equal(null);

    wrapper.unmount();
    expect(document.body.contains(root)).to.equal(false);
  });

  it('親コンポーネントごと破棄した場合もbody直下へ移したrootを残さない', () => {
    const HostComponent = {
      components: { UiDialog },
      template: `
        <div>
          <UiDialog title-id="nested-dialog-title" data-testid="nested-dialog">
            <template #title><h2 id="nested-dialog-title">見出し</h2></template>
            <p>本文</p>
          </UiDialog>
        </div>
      `,
    };
    const host = mount(HostComponent);
    const root = document.body.querySelector('[data-testid="nested-dialog"]');

    expect(root).to.not.equal(null);
    expect(root.parentElement).to.equal(document.body);

    host.unmount();
    const remainedInDocument = document.body.contains(root);
    root.remove();

    expect(remainedInDocument).to.equal(false);
  });

  it('4つのスロットを固定の枠に表示し、呼出元の属性をルート要素へ渡す', () => {
    const wrapper = factory({
      attrs: {
        id: 'sample-dialog',
        'data-testid': 'sample-dialog',
        class: 'transparent-dialog',
      },
      slots: {
        actions: '<button type="button">保存</button>',
        status: '<progress />',
      },
    });

    const root = getDialogRoot(wrapper);
    expect(root.classes()).to.include('ui-dialog');
    expect(root.classes()).to.include('transparent-dialog');
    expect(root.attributes('id')).to.equal('sample-dialog');
    expect(root.attributes('data-testid')).to.equal('sample-dialog');
    expect(root.find('.ui-dialog__header').text()).to.equal('見出し');
    expect(root.find('.ui-dialog__content').text()).to.equal('本文');
    expect(root.find('.ui-dialog__actions').text()).to.equal('保存');
    expect(root.find('.ui-dialog__status progress').exists()).to.equal(true);
  });

  it('ギャラリーではタイトルスロットを省略し、既定スロット先頭の見出しを参照できる', async () => {
    const wrapper = factory({
      props: {
        open: true,
        titleId: 'gallery_dialog_title',
      },
      slots: {
        title: null,
        default: '<div><h2 id="gallery_dialog_title" class="visually-hidden">ギャラリー</h2><p>画像</p></div>',
      },
    });

    await flushTicks();

    const root = getDialogRoot(wrapper);
    expect(root.find('.ui-dialog__header').exists()).to.equal(false);
    expect(root.find('.ui-dialog__content').text()).to.contain('ギャラリー');
    expect(root.find('.ui-dialog__panel').attributes('aria-labelledby')).to.equal('gallery_dialog_title');
    expect(warnings).to.deep.equal([]);
  });

  it('パネルだけが固定roleとARIA参照を持つ', async () => {
    const wrapper = factory({
      props: {
        open: true,
        descriptionIds: 'first-description second-description',
        panelId: 'sample-dialog-panel',
        panelTestId: 'sample-dialog-panel-test-id',
        backdropTestId: 'sample-dialog-backdrop-test-id',
      },
      slots: {
        default: '<div><p id="first-description">一つ目</p><p id="second-description">二つ目</p></div>',
      },
    });

    await flushTicks();
    const panel = getDialogRoot(wrapper).find('.ui-dialog__panel');

    expect(panel.attributes('role')).to.equal('dialog');
    expect(panel.attributes('aria-modal')).to.equal('true');
    expect(panel.attributes('aria-labelledby')).to.equal('sample-dialog-title');
    expect(panel.attributes('aria-describedby')).to.equal('first-description second-description');
    expect(panel.attributes('id')).to.equal('sample-dialog-panel');
    expect(panel.attributes('data-testid')).to.equal('sample-dialog-panel-test-id');
    expect(getDialogRoot(wrapper).find('.ui-dialog__backdrop').attributes('data-testid')).to.equal(
      'sample-dialog-backdrop-test-id'
    );
    expect(getDialogRoot(wrapper).attributes('role')).to.equal(undefined);
    expect(warnings).to.deep.equal([]);
  });

  it('open時にタイトルと説明 IDがパネル内に一個ずつあるか検証する', async () => {
    factory({
      props: {
        open: true,
        titleId: 'missing-title',
        descriptionIds: 'duplicate-description missing-description',
      },
      slots: {
        title: '<h2 id="different-title">別見出し</h2>',
        default: '<div><p id="duplicate-description">一</p><p id="duplicate-description">二</p></div>',
      },
    });

    await flushTicks();

    expect(warnings.some((message) => message.includes('titleId "missing-title"'))).to.equal(true);
    expect(warnings.some((message) => message.includes('description ID "duplicate-description"'))).to.equal(true);
    expect(warnings.some((message) => message.includes('description ID "missing-description"'))).to.equal(true);
  });

  it('別パネルに同じIDがある場合は文書内のID重複を1回だけ警告する', async () => {
    const otherPanel = addElement('section');
    otherPanel.setAttribute('role', 'dialog');
    const duplicateTitle = document.createElement('h2');
    duplicateTitle.id = 'document-duplicate-title';
    otherPanel.appendChild(duplicateTitle);

    factory({
      props: {
        open: true,
        titleId: 'document-duplicate-title',
      },
    });

    await flushTicks();

    const documentWarnings = warnings.filter((message) =>
      message.includes('titleId "document-duplicate-title" must identify exactly one element in the document.')
    );
    expect(documentWarnings).to.have.length(1);
    expect(warnings.some((message) => message.includes('exactly one element in the panel'))).to.equal(false);
  });

  it('呼出側のroleと管理対象ARIAを警告してrootへ渡さない', () => {
    const wrapper = factory({
      attrs: {
        role: 'alertdialog',
        'aria-modal': 'false',
        'aria-labelledby': 'caller-title',
        'aria-describedby': 'caller-description',
      },
    });
    const panel = getDialogRoot(wrapper).find('.ui-dialog__panel');

    const root = getDialogRoot(wrapper);
    expect(root.attributes('role')).to.equal(undefined);
    expect(root.attributes('aria-modal')).to.equal(undefined);
    expect(root.attributes('aria-labelledby')).to.equal(undefined);
    expect(root.attributes('aria-describedby')).to.equal(undefined);
    expect(panel.attributes('role')).to.equal('dialog');
    expect(panel.attributes('aria-modal')).to.equal('true');
    expect(panel.attributes('aria-labelledby')).to.equal('sample-dialog-title');
    expect(panel.attributes('aria-describedby')).to.equal(undefined);
    expect(warnings).to.have.length(4);
  });

  it('initialFocusに一致する表示中の要素へフォーカスしてからopenedを通知する', async () => {
    const activeAtOpened = [];
    const wrapper = factory({
      props: {
        open: true,
        initialFocus: '#second-button',
      },
      slots: {
        default: '<div><button id="first-button">一</button><button id="second-button">二</button></div>',
      },
      attrs: {
        onOpened: () => activeAtOpened.push(document.activeElement),
      },
    });
    const root = getDialogRoot(wrapper);
    const first = root.find('#first-button').element;
    const second = root.find('#second-button').element;
    makeVisible(first);
    makeVisible(second);
    await flushTicks();

    expect(document.activeElement).to.equal(second);
    expect(activeAtOpened).to.deep.equal([second]);
  });

  it('不正なinitialFocus セレクタは例外にせず先頭フォーカス可能要素へ戻る', async () => {
    const wrapper = factory({
      props: {
        open: true,
        initialFocus: '[',
      },
      slots: {
        default: '<button id="first-button">一</button>',
      },
    });
    const first = makeVisible(getDialogRoot(wrapper).find('#first-button').element);

    await flushTicks();

    expect(document.activeElement).to.equal(first);
  });

  it('フォーカス可能要素がなければtabindex=-1のパネルへフォーカスする', async () => {
    const wrapper = factory({
      props: {
        open: true,
        initialFocus: '#missing',
      },
    });

    await flushTicks();

    const panel = getDialogRoot(wrapper).find('.ui-dialog__panel');
    expect(panel.attributes('tabindex')).to.equal('-1');
    expect(document.activeElement).to.equal(panel.element);
  });

  it('背景自身のクリックだけをrequest-closeへ変換する', async () => {
    const wrapper = factory();
    const root = getDialogRoot(wrapper);
    const backdrop = root.find('.ui-dialog__backdrop');
    expect(backdrop.attributes('data-testid')).to.equal('dialog-backdrop');

    await root.find('.ui-dialog__panel').trigger('click');
    expect(wrapper.emitted('request-close')).to.equal(undefined);

    await backdrop.trigger('click');
    expect(wrapper.emitted('request-close')).to.deep.equal([[{ reason: 'backdrop' }]]);

    await wrapper.setProps({ closeOnBackdrop: false });
    await backdrop.trigger('click');
    expect(wrapper.emitted('request-close')).to.have.length(1);
  });

  it('Escapeはrequest-closeだけをemitし、親がopenを変えるまで閉じない', async () => {
    const wrapper = factory({
      props: {
        open: true,
      },
    });
    await flushTicks();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(wrapper.emitted('request-close')).to.deep.equal([[{ reason: 'escape' }]]);
    expect(getDialogRoot(wrapper).isVisible()).to.equal(true);
    expect(getTopPanel()).to.equal(getDialogRoot(wrapper).find('.ui-dialog__panel').element);
  });

  it('閉じた後に表示直前の要素へフォーカスを戻し、成功結果をclosedへ渡す', async () => {
    const trigger = addElement();
    trigger.focus();
    const wrapper = factory({
      slots: {
        default: '<button id="inside-button">内側</button>',
      },
    });
    const root = getDialogRoot(wrapper);
    makeVisible(root.find('#inside-button').element);

    await wrapper.setProps({ open: true });
    await flushTicks();
    expect(document.activeElement).to.equal(root.find('#inside-button').element);

    await wrapper.setProps({ open: false });
    await flushTicks();

    expect(document.activeElement).to.equal(trigger);
    expect(wrapper.emitted('closed')).to.deep.equal([[{ focusRestored: true }]]);
    expect(getTopPanel()).to.equal(null);
  });

  it('ツールチップ内の起点へフォーカスを戻す時はツールチップを表示しない', async () => {
    const HostComponent = {
      components: { UiDialog, UiTooltip },
      data: () => ({ open: false }),
      template: `
        <div>
          <UiTooltip text="ダイアログを開く">
            <button id="tooltip-dialog-trigger" type="button">開く</button>
          </UiTooltip>
          <UiDialog :open="open" title-id="tooltip-dialog-title" initial-focus="#tooltip-dialog-close">
            <template #title><h2 id="tooltip-dialog-title">見出し</h2></template>
            <button id="tooltip-dialog-close" type="button">閉じる</button>
          </UiDialog>
        </div>
      `,
    };
    const host = mount(HostComponent, { attachTo: document.body });
    wrappers.push(host);
    const trigger = makeVisible(host.find('#tooltip-dialog-trigger').element);
    const dialog = host.findComponent(UiDialog);
    const closeButton = makeVisible(getDialogRoot(dialog).find('#tooltip-dialog-close').element);
    const tooltipId = trigger.getAttribute('aria-describedby');
    const tooltip = document.getElementById(tooltipId);

    trigger.focus();
    expect(tooltip.hidden).to.equal(false);

    await host.setData({ open: true });
    await flushTicks();
    expect(document.activeElement).to.equal(closeButton);
    expect(tooltip.hidden).to.equal(true);

    await host.setData({ open: false });
    await flushTicks();

    expect(document.activeElement).to.equal(trigger);
    expect(tooltip.hidden).to.equal(true);
    expect(dialog.emitted('closed')).to.deep.equal([[{ focusRestored: true }]]);
  });

  it('保存要素が切断済みならフォーカス復帰失敗をclosedへ渡す', async () => {
    const trigger = addElement();
    trigger.focus();
    const wrapper = factory();

    await wrapper.setProps({ open: true });
    await flushTicks();
    trigger.remove();

    await wrapper.setProps({ open: false });
    await flushTicks();

    expect(wrapper.emitted('closed')).to.deep.equal([[{ focusRestored: false }]]);
  });

  it('重なった途中のダイアログを閉じても最前面を有効にしてフォーカスを戻す', async () => {
    const lower = factory({ props: { open: true, titleId: 'lower-title' } });
    await flushTicks();
    const lowerPanel = getDialogRoot(lower).find('.ui-dialog__panel').element;
    const lowerTrigger = makeVisible(document.createElement('button'));
    lowerPanel.appendChild(lowerTrigger);
    lowerTrigger.focus();

    const middle = factory({ props: { titleId: 'middle-title' } });
    await middle.setProps({ open: true });
    await flushTicks();

    const upper = factory({ props: { open: true, titleId: 'upper-title' } });
    await flushTicks();
    const upperPanel = getDialogRoot(upper).find('.ui-dialog__panel').element;

    await middle.setProps({ open: false });
    await flushTicks();

    expect(getTopPanel()).to.equal(upperPanel);
    expect(upperPanel.hasAttribute('inert')).to.equal(false);
    expect(upperPanel.hasAttribute('aria-hidden')).to.equal(false);
    expect(document.activeElement).to.equal(upperPanel);
    expect(middle.emitted('closed')).to.deep.equal([[{ focusRestored: false }]]);
  });

  it('open中の破棄はスタック登録を解除して表示直前の要素へフォーカスを戻し、closedを通知しない', async () => {
    const trigger = addElement();
    trigger.focus();
    const wrapper = factory({
      props: {
        open: true,
      },
    });
    await flushTicks();
    const root = getDialogRoot(wrapper).element;

    wrapper.unmount();

    expect(getTopPanel()).to.equal(null);
    expect(document.activeElement).to.equal(trigger);
    expect(wrapper.emitted('closed')).to.equal(undefined);
    expect(document.body.contains(root)).to.equal(false);
  });
});
