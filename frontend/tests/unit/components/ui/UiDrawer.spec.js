import fs from 'node:fs';
import path from 'node:path';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { shallowMount } from '../../helpers/testUtils';
import UiDrawer from '@/components/ui/UiDrawer.vue';

const UI_DRAWER_PATH = path.resolve(process.cwd(), 'src/components/ui/UiDrawer.vue');

const compileDrawerStyle = () => {
  const source = fs.readFileSync(UI_DRAWER_PATH, 'utf8');
  const style = parse(source, { filename: UI_DRAWER_PATH }).descriptor.styles.find(
    (descriptor) => descriptor.scoped
  );

  expect(style).not.to.equal(undefined);
  const result = compileStyle({
    source: style.content,
    filename: UI_DRAWER_PATH,
    id: 'data-v-drawer-style-test',
    scoped: true,
  });
  expect(result.errors).to.deep.equal([]);
  return result.code;
};

const UiDialogStub = {
  name: 'UiDialog',
  inheritAttrs: false,
  props: [
    'open',
    'titleId',
    'descriptionIds',
    'closeOnEscape',
    'closeOnBackdrop',
    'initialFocus',
    'panelId',
    'panelTestId',
    'backdropTestId',
  ],
  template:
    '<section v-bind="$attrs"><header><slot name="title"/></header><main><slot/></main><footer><slot name="actions"/></footer><aside><slot name="status"/></aside></section>',
};

const createWrapper = (props = {}) =>
  shallowMount(UiDrawer, {
    stubs: { UiDialog: UiDialogStub },
    attrs: {
      id: 'drawer-id',
      'data-testid': 'drawer',
    },
    props: {
      open: true,
      titleId: 'drawer-title',
      descriptionIds: 'drawer-description',
      initialFocus: '.first-item',
      panelId: 'drawer-panel',
      panelTestId: 'drawer-panel-test-id',
      backdropTestId: 'drawer-backdrop-test-id',
      ...props,
    },
    slots: {
      title: '<h2 id="drawer-title">Menu</h2>',
      default: '<a class="first-item" href="#">Item</a>',
      actions: '<button>Close</button>',
      status: '<p>Loading</p>',
    },
  });

describe('ドロワー（UiDrawer）', () => {
  it('Teleport後もパネルを画面左端のドロワーとして表示する', async () => {
    const compiledStyle = compileDrawerStyle();
    const wrapper = mount(UiDrawer, {
      attachTo: document.body,
      props: {
        open: true,
        titleId: 'real-drawer-title',
      },
      slots: {
        title: '<h2 id="real-drawer-title">Menu</h2>',
        default: '<button type="button">Item</button>',
      },
    });

    try {
      await wrapper.vm.$nextTick();

      const drawer = document.querySelector('.ui-dialog.ui-drawer');
      expect(drawer).not.to.equal(null);

      const panel = drawer.querySelector('.ui-dialog__panel');
      expect(panel).not.to.equal(null);
      expect(panel.matches('.ui-dialog.ui-drawer > .ui-dialog__panel')).to.equal(true);
      expect(compiledStyle).to.match(
        /\.ui-dialog\.ui-drawer > \.ui-dialog__panel\s*\{[^}]*position:\s*fixed;[^}]*inset-block:\s*0;[^}]*inset-inline-start:\s*0;[^}]*width:\s*320px;/
      );
      expect(compiledStyle).not.to.include('.ui-drawer[data-v-drawer-style-test]');
    } finally {
      wrapper.unmount();
    }
  });

  it('重なり・フォーカス・スロットの処理をUiDialogへ委ねる', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props()).to.include({
      open: true,
      titleId: 'drawer-title',
      descriptionIds: 'drawer-description',
      closeOnEscape: true,
      closeOnBackdrop: true,
      initialFocus: '.first-item',
      panelId: 'drawer-panel',
      panelTestId: 'drawer-panel-test-id',
      backdropTestId: 'drawer-backdrop-test-id',
    });
    expect(dialog.attributes('id')).to.equal('drawer-id');
    expect(dialog.attributes('data-testid')).to.equal('drawer');
    expect(wrapper.get('h2').text()).to.equal('Menu');
    expect(wrapper.get('main a').text()).to.equal('Item');
    expect(wrapper.get('footer button').text()).to.equal('Close');
    expect(wrapper.get('aside').text()).to.equal('Loading');
  });

  it('request-close、opened、closedを利用側へ再通知する', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);
    const closePayload = { reason: 'escape' };
    const closedPayload = { focusRestored: true };

    dialog.vm.$emit('request-close', closePayload);
    dialog.vm.$emit('opened');
    dialog.vm.$emit('closed', closedPayload);

    expect(wrapper.emitted()['request-close'][0]).to.deep.equal([closePayload]);
    expect(wrapper.emitted().opened).to.have.length(1);
    expect(wrapper.emitted().closed[0]).to.deep.equal([closedPayload]);
  });
});
