import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import FilterDialog from '@/components/timeline/dialogs/FilterDialog.vue';


const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  props: ['visible', 'titleText', 'cancelLabel', 'confirmLabel', 'actionsAdjacent', 'initialFocus'],
  template: '<div><slot/></div>',
};

const baseStubs = {
  BaseEditDialog: BaseEditDialogStub,
  ConfirmDialog: true,
  UiField: {
    props: ['controlId'],
    template: '<div><slot :controlAttrs="{ id: controlId }"/></div>',
  },
  UiButton: { template: '<button><slot/></button>' },
  UiIcon: true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(FilterDialog, {
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      filterIndex: null,
      filter: null,
      tags: [],
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { userIsLogin: true, oneSignalPushAvailable: true }, dispatch: () => {} },
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('タイムラインの絞り込み設定', () => {
  it('共通編集ダイアログへ絞り込み操作を渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    expect(dialog.props()).to.include({
      visible: true,
      titleText: '絞り込み',
      cancelLabel: 'キャンセル',
      confirmLabel: '決定',
      actionsAdjacent: true,
      initialFocus: '#keyword',
    });
  });

  it('タグチェックボックスの一意なIDをラベルから参照する', () => {
    const wrapper = createWrapper({ props: { tags: [{ _id: 't1', name: 'tag1', order: 1 }] } });
    const input = wrapper.find('input[type="checkbox"][value="t1"]');
    const label = wrapper.find(`label[for="${input.attributes('id')}"]`);

    expect(input.attributes('id')).not.to.equal('tag_checkbox_id_t1');
    expect(label.exists()).to.equal(true);
    expect(label.attributes('id')).to.equal(undefined);
  });

  it('4組のラジオボタンにfieldsetと見える見出しで名前を付ける', () => {
    const wrapper = createWrapper();
    const expectedLegends = {
      name_logical_operator: 'キーワード filterDialog.searchMethod',
      tag_search_operator: 'タグ filterDialog.searchMethod',
      filter_mode: 'filterDialog.matchingContent',
      show_range: '関連する投稿を表示',
    };

    Object.entries(expectedLegends).forEach(([name, legend]) => {
      const radios = wrapper.findAll(`input[type="radio"][name="${name}"]`);
      expect(radios).to.have.lengthOf(2);
      const fieldset = radios[0].element.closest('fieldset');
      expect(fieldset).not.to.equal(null);
      expect(fieldset.querySelector(':scope > legend').textContent.trim()).to.equal(legend);
      expect(radios[1].element.closest('fieldset')).to.equal(fieldset);
    });
  });

  it('キーワード分割は引用符を含む文字列を分割する', () => {
    const wrapper = createWrapper();
    const result = wrapper.vm.splitKeyword('foo "bar baz" qux');
    expect(result).to.deep.equal(['foo', 'bar baz', 'qux']);
  });

  it('検索条件と表示設定を区分し、タグ無しと流すはタグとは別の小分類に置く', () => {
    const wrapper = createWrapper();
    expect(wrapper.findAll('h3').map((heading) => heading.text())).to.deep.equal([
      'filterDialog.searchConditions', 'filterDialog.displaySettings',
    ]);
    const noTagsGroup = wrapper.get('#input_notags').element.closest('fieldset');
    expect(noTagsGroup.querySelector('legend').textContent).to.equal('filterDialog.otherConditions');
    expect(wrapper.get('#animation').element.closest('fieldset')).to.equal(noTagsGroup);
    expect(noTagsGroup.closest('section').getAttribute('aria-labelledby')).to.equal('filter_search_title');
    expect(wrapper.get('.filter-tags').element.contains(noTagsGroup)).to.equal(false);
  });

  it('チェック操作と一括選択・解除はタグ無しと流すの選択を保って保存する', async () => {
    const wrapper = createWrapper({ props: { tags: [
      { _id: 't1', name: 'tag1', order: 1 },
      { _id: 't2', name: 'tag2', order: 2 },
    ] } });
    await wrapper.get('#input_notags').setValue(true);
    await wrapper.get('#animation').setValue(true);
    const buttons = wrapper.findAll('.filter-tag-actions button');
    await buttons[0].trigger('click');
    expect(wrapper.vm.selectedTags).to.deep.equal(['t1', 't2']);
    await buttons[1].trigger('click');
    expect(wrapper.vm.selectedTags).to.deep.equal([]);
    expect(wrapper.vm.noTags).to.equal(true);
    expect(wrapper.vm.animation).to.equal(true);
    expect(wrapper.vm.displayOrder).to.deep.equal([{ key: 'notags' }, { key: 'animation' }]);
    await wrapper.get('input[value="t2"]').setValue(true);
    await wrapper.get('#tag_search_and').setValue(true);
    wrapper.vm.onPressDoneButton();
    expect(wrapper.emitted().create[0][0].conditions).to.include({
      noTags: true, animation: true, tagSearchOperator: 'and',
    });
    expect(wrapper.emitted().create[0][0].conditions.tags).to.deep.equal(['t2']);
  });

  it('編集後のキャンセルでは破棄確認を経て閉じる', () => {
    const wrapper = createWrapper();
    wrapper.vm.openedDialog();
    wrapper.vm.keyword = 'changed';

    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    expect(wrapper.vm.visible).to.equal(true);

    wrapper.vm.confirmDiscard();
    wrapper.vm.closedDiscardConfirm();
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('チェックボックス操作で表示順の追加と削除を切り替える', () => {
    const wrapper = createWrapper();
    wrapper.setData({ displayOrder: [] });

    wrapper.vm.changeCheckBox({ key: 'tag-1' });
    expect(wrapper.vm.displayOrder).to.deep.equal([{ key: 'tag-1' }]);

    wrapper.vm.changeCheckBox({ key: 'tag-1' });
    expect(wrapper.vm.displayOrder).to.deep.equal([]);
  });

  it('条件がない場合は判定がfalseになる', () => {
    const wrapper = createWrapper();
    wrapper.setData({
      keyword: null,
      selectedTags: [],
      noTags: false,
      animation: false,
      userName: null,
    });

    expect(wrapper.vm.hasFilterConditions()).to.equal(false);

    wrapper.setData({ userName: 'user' });
    expect(wrapper.vm.hasFilterConditions()).to.equal(true);
  });

  it('条件なしの決定はconditions:nullを通知する', async () => {
    const wrapper = createWrapper();
    wrapper.setData({ showUserIcon: false });

    wrapper.vm.onPressDoneButton();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().create).to.have.lengthOf(1);
    expect(wrapper.emitted().create[0][0]).to.deep.equal({
      conditions: null,
      webPush: false,
      showUserIcon: false,
    });
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('URL条件指定モードではWebPushを常にfalseで通知する', () => {
    const wrapper = createWrapper({ props: { disableWebPush: true } });
    wrapper.setData({
      keyword: 'temporary',
      webPush: true,
    });

    wrapper.vm.editFilter();

    expect(wrapper.emitted().create[0][0].webPush).to.equal(false);
  });

  it('OneSignal無効時はWebPush UIを隠し既存値を更新データで維持する', () => {
    const wrapper = createWrapper({
      props: {
        filterIndex: 0,
        filter: { conditions: { keyword: 'keep', tags: [] }, webPush: true },
      },
      mocks: {
        $store: { getters: { userIsLogin: true, oneSignalPushAvailable: false }, dispatch: () => {} },
      },
    });
    wrapper.vm.openedDialog();
    wrapper.vm.editFilter();

    expect(wrapper.find('#webpush_flag').exists()).to.equal(false);
    expect(wrapper.find('.filter-notifications').exists()).to.equal(false);
    expect(wrapper.emitted().update[0][1].webPush).to.equal(true);
  });

  it('OneSignal無効時は既存条件を全削除してもWebPush値を維持する', async () => {
    const wrapper = createWrapper({
      props: {
        filterIndex: 0,
        filter: { conditions: { keyword: 'remove', tags: [] }, webPush: true },
      },
      mocks: {
        $store: { getters: { userIsLogin: true, oneSignalPushAvailable: false }, dispatch: () => {} },
      },
    });
    wrapper.vm.openedDialog();
    wrapper.setData({
      keyword: null,
      selectedTags: [],
      noTags: false,
      animation: false,
      userName: null,
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().update).to.have.lengthOf(1);
    expect(wrapper.emitted().update[0][1]).to.include({ conditions: null, webPush: true });
  });
});
