import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineEditorDialog from '@/components/timeline/dialogs/TimelineEditorDialog.vue';

const UiDialogStub = {
  name: 'UiDialog',
  inheritAttrs: false,
  props: ['open', 'titleId', 'initialFocus', 'closeOnEscape', 'closeOnBackdrop'],
  template:
    '<section v-bind="$attrs"><header><slot name="title"/></header><main><slot/></main><footer><slot name="actions"/></footer><aside><slot name="status"/></aside></section>',
};

const createWrapper = (props = {}) =>
  shallowMount(TimelineEditorDialog, {
    stubs: {
      UiDialog: UiDialogStub,
      UiButton: {
        name: 'UiButton',
        inheritAttrs: false,
        template: '<button v-bind="$attrs"><slot/></button>',
      },
      UiIcon: true,
      UiProgress: {
        name: 'UiProgress',
        inheritAttrs: false,
        props: ['mode', 'value'],
        template: '<div class="progress" v-bind="$attrs"/>',
      },
    },
    props: {
      visible: true,
      titleId: 'timeline-editor-title',
      titleText: '投稿',
      cancelLabel: 'キャンセル',
      initialFocus: '#content',
      sending: false,
      blocked: false,
      progressAmount: 30,
      ...props,
    },
    slots: {
      default: '<textarea id="content"/>',
      'mobile-actions':
        '<button class="mobile-primary">投稿</button><button class="mobile-secondary">連続投稿</button>',
      actions: '<button class="desktop-primary">投稿</button>',
    },
  });

describe('タイムラインの共通編集ダイアログ', () => {
  it('共通のタイトル・取消・端末別の操作・進捗を表示する', () => {
    const wrapper = createWrapper({ sending: true });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.classes()).to.include('timeline-editor-dialog');
    expect(wrapper.get('h2#timeline-editor-title').text()).to.equal('投稿');
    const mobileActions = wrapper.get('.timeline-editor-dialog__mobile-actions');
    expect(mobileActions.classes()).to.include('ui-dialog__header-end');
    expect(mobileActions.findAll('button')).to.have.lengthOf(2);
    expect(wrapper.get('.ui-dialog__header-start').exists()).to.equal(true);
    expect(wrapper.find('.desktop-primary').exists()).to.equal(true);
    expect(wrapper.find('textarea#content').exists()).to.equal(true);
    expect(wrapper.find('.progress').attributes('aria-labelledby')).to.equal('timeline-editor-title');
    expect(dialog.props()).to.include({
      open: true,
      titleId: 'timeline-editor-title',
      initialFocus: '#content',
      closeOnEscape: false,
      closeOnBackdrop: false,
    });
    expect(dialog.attributes('aria-busy')).to.equal('true');
  });

  it('blocked中は終了操作とEscape、背景クリックを無効にする', async () => {
    const wrapper = createWrapper({ blocked: true });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props('closeOnEscape')).to.equal(false);
    expect(dialog.props('closeOnBackdrop')).to.equal(false);
    wrapper.vm.onCancel();
    expect(wrapper.emitted().cancel).to.equal(undefined);

    await wrapper.setProps({ blocked: false });
    dialog.vm.$emit('request-close');
    expect(wrapper.emitted().cancel).to.have.length(1);
  });

  it('openedとclosedを利用側へ再通知する', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);
    const payload = { focusRestored: true };

    dialog.vm.$emit('opened');
    dialog.vm.$emit('closed', payload);

    expect(wrapper.emitted().opened).to.have.length(1);
    expect(wrapper.emitted().closed[0]).to.deep.equal([payload]);
  });
});
