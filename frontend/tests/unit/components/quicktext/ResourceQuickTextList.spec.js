import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import ResourceQuickTextList from '@/components/quicktext/ResourceQuickTextList.vue';

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: ['disabled', 'appearance', 'tone', 'density', 'iconOnly'],
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
};

const UiIconStub = {
  name: 'UiIcon',
  props: ['name'],
  template: '<i :data-name="name" />',
};

const DraggableStub = {
  name: 'Draggable',
  inheritAttrs: false,
  props: ['list', 'group', 'disabled'],
  emits: ['end'],
  template:
    '<ul v-bind="$attrs"><slot name="item" v-for="element in list" :key="element._id" :element="element" /></ul>',
};

const groups = [
  {
    _id: 'group-1',
    title: 'Group',
    order: 1,
    lang: 'ja',
    translations: [{ lang: 'en', content: 'Group translation' }],
  },
];

const itemsByGroupId = {
  'group-1': [
    {
      _id: 'item-1',
      label: 'Item',
      order: 1,
      lang: 'unknown',
      translations: [{ lang: 'en', content: 'Item translation' }],
    },
  ],
};

const createWrapper = (props = {}) =>
  shallowMount(ResourceQuickTextList, {
    stubs: {
      draggable: DraggableStub,
      UiButton: UiButtonStub,
      UiIcon: UiIconStub,
    },
    props: {
      resource: 'floor',
      groups,
      itemsByGroupId,
      sending: false,
      userIsLogin: true,
      ...props,
    },
    mocks: {
      $t: (key) => key,
    },
  });

describe('フロア・ルームの単語一覧', () => {
  it('フロアの単語は未ログインでも操作ボタンを表示し、無効にする', () => {
    const wrapper = createWrapper({ userIsLogin: false, showActionsWhenLoggedOut: true });

    const actionButtons = wrapper.findAll('[data-testid^="quicktext-"]');
    expect(actionButtons).to.have.lengthOf(6);
    actionButtons.forEach((button) => expect(button.attributes('disabled')).not.to.equal(undefined));
  });

  it('ルームの単語は未ログイン時に操作ボタンを隠し、一覧と並べ替え用のつまみを表示する', () => {
    const wrapper = createWrapper({ resource: 'room', userIsLogin: false });

    expect(wrapper.findAll('[data-testid^="quicktext-"]')).to.have.lengthOf(0);
    expect(wrapper.text()).to.contain('Group');
    expect(wrapper.findAll('.handle-btn')).to.have.lengthOf(2);
    wrapper
      .findAll('.handle-btn')
      .forEach((button) => expect(button.attributes('disabled')).not.to.equal(undefined));
  });

  it('明示された管理権限をログイン状態より優先する', () => {
    const wrapper = createWrapper({ userIsLogin: true, canManage: false });

    expect(wrapper.findAll('[data-testid^="quicktext-"]')).to.have.lengthOf(0);
    wrapper
      .findAllComponents(DraggableStub)
      .forEach((component) => expect(component.props('disabled')).to.equal(true));
    wrapper
      .findAll('.handle-btn')
      .forEach((button) => expect(button.attributes('disabled')).not.to.equal(undefined));
  });

  it('管理ダイアログでは一覧内のグループ作成ボタンを非表示にできる', () => {
    const wrapper = createWrapper({ canManage: true, showCreateGroupAction: false });

    expect(wrapper.find('[data-testid="quicktext-group-create"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="quicktext-item-create"]').exists()).to.equal(true);
  });

  it('単語グループと単語の作成ボタンを主要操作色で表示する', () => {
    const wrapper = createWrapper();
    const buttons = wrapper.findAllComponents({ name: 'UiButton' });
    const findButton = (testId) => buttons.find((button) => button.attributes('data-testid') === testId);

    expect(findButton('quicktext-group-create').props('tone')).to.equal('primary');
    expect(findButton('quicktext-item-create').props('tone')).to.equal('primary');
  });

  it('フロア・ルームごとのドラッグ対象グループと送信中の無効状態を渡す', () => {
    const wrapper = createWrapper({ resource: 'room', sending: true });
    const draggableComponents = wrapper.findAllComponents(DraggableStub);

    expect(draggableComponents[0].props('group')).to.deep.equal({
      name: 'room-qt-groups',
      pull: false,
      put: false,
    });
    expect(draggableComponents[1].props('group')).to.deep.equal({
      name: 'room-qt-group-1',
      pull: false,
      put: false,
    });
    draggableComponents.forEach((component) => expect(component.props('disabled')).to.equal(true));
  });

  it('グループと項目の表示、翻訳、言語ラベルを描画する', () => {
    const wrapper = createWrapper({ emphasizeTranslationLabels: true });

    expect(wrapper.text()).to.contain('Group');
    expect(wrapper.text()).to.contain('Item');
    expect(wrapper.text()).to.contain('日本語');
    expect(wrapper.text()).to.contain('unknown');
    expect(wrapper.text()).to.contain('Group translation');
    expect(wrapper.text()).to.contain('Item translation');
    expect(wrapper.findAll('.translation-labels-emphasized')).to.have.lengthOf(2);
  });

  it('一覧操作を既存データで親へ通知する', async () => {
    const wrapper = createWrapper();
    const group = groups[0];
    const item = itemsByGroupId[group._id][0];

    await wrapper.find('[data-testid="quicktext-group-create"]').trigger('click');
    await wrapper.find('[data-testid="quicktext-item-create"]').trigger('click');
    await wrapper.find('[data-testid="quicktext-group-edit"]').trigger('click');
    await wrapper.find('[data-testid="quicktext-group-delete"]').trigger('click');
    await wrapper.find('[data-testid="quicktext-item-edit"]').trigger('click');
    await wrapper.find('[data-testid="quicktext-item-delete"]').trigger('click');

    const emitted = wrapper.emitted();
    expect(emitted['create-group'][0][0]).to.be.instanceOf(Event);
    expect(emitted['create-item'][0][0]).to.deep.equal(group);
    expect(emitted['create-item'][0][1]).to.be.instanceOf(Event);
    expect(emitted['edit-group'][0][0]).to.deep.equal(group);
    expect(emitted['edit-group'][0][1]).to.be.instanceOf(Event);
    expect(emitted['delete-group'][0][0]).to.deep.equal(group);
    expect(emitted['delete-group'][0][1]).to.be.instanceOf(Event);
    expect(emitted['edit-item'][0][0]).to.deep.equal(item);
    expect(emitted['edit-item'][0][1]).to.deep.equal(group);
    expect(emitted['edit-item'][0][2]).to.be.instanceOf(Event);
    expect(emitted['delete-item'][0][0]).to.deep.equal(item);
    expect(emitted['delete-item'][0][1]).to.deep.equal(group);
    expect(emitted['delete-item'][0][2]).to.be.instanceOf(Event);
  });

  it('D&D完了をgroupIdとイベントを保ったまま通知する', () => {
    const wrapper = createWrapper();
    const draggableComponents = wrapper.findAllComponents(DraggableStub);
    const groupEvent = { oldIndex: 0, newIndex: 1 };
    const itemEvent = { oldIndex: 1, newIndex: 0 };

    draggableComponents[0].vm.$emit('end', groupEvent);
    draggableComponents[1].vm.$emit('end', itemEvent);

    expect(wrapper.emitted()['groups-drag-end']).to.deep.equal([[groupEvent]]);
    expect(wrapper.emitted()['items-drag-end']).to.deep.equal([['group-1', itemEvent]]);
  });

  it('単語がないグループには空の状態を表示する', () => {
    const wrapper = createWrapper({ itemsByGroupId: {} });
    expect(wrapper.text()).to.contain('単語がありません');
  });
});
