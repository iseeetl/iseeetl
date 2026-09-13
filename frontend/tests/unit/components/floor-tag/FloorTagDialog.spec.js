import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import tagApi from '@/api/tag';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import FloorTagDialog from '@/components/floor-tag/FloorTagDialog.vue';
import TagListDialog from '@/components/tag/TagListDialog.vue';

const createWrapper = (props = {}) =>
  shallowMount(FloorTagDialog, {
    props: {
      dialogVisible: true,
      floorId: 'floor-1',
      floorName: 'テストフロア',
      ...props,
    },
    mocks: {
      $store: {
        getters: { lang: 'ja' },
        dispatch: () => {},
      },
      $router: { push: () => {} },
      $t: (key) => key,
    },
  });

const findTagListDialog = (wrapper) => wrapper.findComponent(TagListDialog);

describe('フロアタグの一覧と操作', () => {
  let originalApi;

  beforeEach(() => {
    originalApi = {
      list: tagApi.floorTag.list,
      create: tagApi.floorTag.create,
      update: tagApi.floorTag.update,
      remove: tagApi.floorTag.remove,
      importCsv: tagApi.floorTag.importCsv,
      exportCsv: tagApi.floorTag.exportCsv,
      reset: tagApi.floorTag.reset,
    };
  });

  afterEach(() => {
    Object.assign(tagApi.floorTag, originalApi);
  });

  it('既存propsを維持し、内部CRUD後はcloseだけを親へ通知する', () => {
    expect(FloorTagDialog.name).to.equal('FloorTagDialog');
    expect(FloorTagDialog.props).to.deep.equal({
      dialogVisible: Boolean,
      floorId: String,
      floorName: {
        type: String,
        default: '',
      },
    });
    expect(FloorTagDialog.emits).to.deep.equal(['close']);
  });

  it('対象フロアと設定を一覧へ渡し、内部の画面切替時だけ編集スロットを有効にする', async () => {
    const wrapper = createWrapper();
    const dialog = findTagListDialog(wrapper);
    const { api, ...config } = dialog.props('config');

    expect(dialog.props()).to.include({
      dialogVisible: true,
      scopeId: 'floor-1',
      scopeName: 'テストフロア',
      screen: 'list',
      externalSending: false,
      listCloseEndAligned: true,
    });
    expect(Object.keys(api)).to.deep.equal(['list', 'importCsv', 'exportCsv', 'reset']);
    expect(config).to.include({
      scope: 'floor',
      titleId: 'floor_tag_dialog_title',
      titleKey: 'フロアタグ一覧',
      targetLabelKey: '対象フロア',
      fetchFailureKey: 'フロアタグの取得に失敗しました',
      confirmReset: true,
    });

    dialog.vm.$emit('create', { currentTarget: null });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.screen).to.equal('editor');
    expect(dialog.props('editorTitle')).to.equal('フロアタグを作成');
    expect(dialog.props('editorSubmitLabel')).to.equal('作成');
    expect(wrapper.emitted()).not.to.have.property('create');
  });

  it('一覧のAPI操作をfloorTagへ委ねる', () => {
    const calls = [];
    const results = {
      list: { operation: 'list' },
      importCsv: { operation: 'importCsv' },
      exportCsv: { operation: 'exportCsv' },
      reset: { operation: 'reset' },
    };
    for (const operation of Object.keys(results)) {
      tagApi.floorTag[operation] = (...args) => {
        calls.push({ operation, args });
        return results[operation];
      };
    }

    const { api } = findTagListDialog(createWrapper()).props('config');
    const payload = { floor_id: 'floor-1' };
    const options = { onUploadProgress: () => {} };

    for (const operation of Object.keys(results)) {
      expect(api[operation](payload, options)).to.equal(results[operation]);
    }
    expect(calls).to.deep.equal(
      Object.keys(results).map((operation) => ({ operation, args: [payload, options] })),
    );
  });

  it('未保存変更がある時だけ破棄確認を経由し、確認ダイアログが閉じた後に一覧へ戻る', async () => {
    const wrapper = createWrapper();
    wrapper.vm.openCreateEditor();
    await wrapper.setData({ form: { order: 4, name: '変更中' } });

    wrapper.vm.requestCloseEditor();
    expect(wrapper.vm.screen).to.equal('editor');
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.confirmDiscardChanges();
    expect(wrapper.vm.screen).to.equal('editor');

    wrapper.findAllComponents(ConfirmDialog)[0].vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.screen).to.equal('list');
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
  });

  it('変更がなければ破棄確認を出さず一覧へ戻る', async () => {
    const wrapper = createWrapper();
    wrapper.vm.openCreateEditor();
    await wrapper.vm.$nextTick();

    wrapper.vm.requestCloseEditor();

    expect(wrapper.vm.screen).to.equal('list');
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
  });

  it('作成を明示されたfloorIdで保存して一覧を再取得し、保存行へフォーカスする', async () => {
    const calls = [];
    tagApi.floorTag.create = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { _id: 'tag-created' } });
    };
    const wrapper = createWrapper();
    const dialog = findTagListDialog(wrapper);
    const fetchOptions = [];
    const focused = [];
    dialog.vm.fetchTags = (options) => {
      fetchOptions.push(options);
      return Promise.resolve();
    };
    dialog.vm.focusTag = (...args) => focused.push(args);
    wrapper.vm.openCreateEditor({ currentTarget: { id: 'floor_tag_dialog_title_create_mobile' } });
    await wrapper.setData({ form: { order: 3, name: '新しいタグ' } });

    await wrapper.vm.saveTag();

    expect(calls).to.deep.equal([
      { floor_id: 'floor-1', order: 3, name: '新しいタグ', lang: 'ja' },
    ]);
    expect(fetchOptions).to.deep.equal([{ ignoreExternalSending: true }]);
    expect(wrapper.vm.screen).to.equal('list');
    expect(focused).to.deep.equal([['tag-created', 'mobile']]);
  });

  it('編集は通常のフロアタグAPIへ保存し、管理用APIを使わない', async () => {
    const calls = [];
    tagApi.floorTag.update = (...args) => {
      calls.push(args);
      return Promise.resolve({ data: { _id: 'tag-1' } });
    };
    const wrapper = createWrapper();
    const dialog = findTagListDialog(wrapper);
    dialog.vm.fetchTags = () => Promise.resolve();
    dialog.vm.focusTag = () => {};
    wrapper.vm.openEditEditor(null, {
      _id: 'tag-1',
      order: 2,
      name: '変更前',
      lang: 'ja',
    });
    await wrapper.setData({ form: { order: 5, name: '変更後' } });

    await wrapper.vm.saveTag();

    expect(calls).to.deep.equal([
      [{ _id: 'tag-1', order: 5, name: '変更後', lang: 'ja' }, { management: false }],
    ]);
  });

  it('削除確認に対象フロア・対象タグを保持し、成功後は確認ダイアログが閉じてから次の行へフォーカスする', async () => {
    const removed = [];
    tagApi.floorTag.remove = (payload) => {
      removed.push(payload);
      return Promise.resolve();
    };
    const wrapper = createWrapper();
    const dialog = findTagListDialog(wrapper);
    const tags = [
      { _id: 'tag-1', name: '削除対象' },
      { _id: 'tag-2', name: '次のタグ' },
    ];
    const focused = [];
    dialog.vm.tags = tags;
    dialog.vm.fetchTags = async () => {
      dialog.vm.tags = [tags[1]];
    };
    dialog.vm.focusTag = (...args) => focused.push(args);

    wrapper.vm.openDeleteConfirmation(tags[0], {
      currentTarget: { id: 'floor_tag_dialog_title_delete_mobile_tag-1' },
    });
    await wrapper.vm.$nextTick();

    const deleteDialog = wrapper.findAllComponents(ConfirmDialog)[1];
    expect(wrapper.vm.deleteTarget).to.deep.equal(tags[0]);
    expect(wrapper.vm.deleteConfirmVisible).to.equal(true);
    expect(deleteDialog.props()).to.include({
      actionsAdjacent: true,
      closeOnConfirm: false,
      confirmIcon: 'delete',
    });
    const contexts = wrapper.findAllComponents(DialogTargetContext);
    expect(contexts.some((context) => context.props('name') === 'テストフロア')).to.equal(true);
    expect(contexts.some((context) => context.props('name') === '削除対象')).to.equal(true);

    await wrapper.vm.deleteTag();

    expect(removed).to.deep.equal([{ _id: 'tag-1' }]);
    expect(focused).to.deep.equal([]);
    expect(wrapper.vm.deleteTarget).to.deep.equal(tags[0]);

    deleteDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(focused).to.deep.equal([['tag-2', 'mobile']]);
    expect(wrapper.vm.deleteTarget).to.equal(null);
    expect(wrapper.vm.deleteConfirmVisible).to.equal(false);
  });

  it('削除失敗時は対象と確認ダイアログを維持して再試行できる', async () => {
    tagApi.floorTag.remove = () => Promise.reject(new Error('failed'));
    const wrapper = createWrapper();
    const tag = { _id: 'tag-1', name: '削除対象' };
    wrapper.vm.openDeleteConfirmation(tag);

    await wrapper.vm.deleteTag();

    expect(wrapper.vm.deleteConfirmVisible).to.equal(true);
    expect(wrapper.vm.deleteTarget).to.deep.equal(tag);
    expect(wrapper.vm.deleteSending).to.equal(false);
  });

  it('共通タグへの再同期は確認後に実行し、失敗時は確認ダイアログを維持する', async () => {
    const wrapper = createWrapper();
    const dialog = findTagListDialog(wrapper);
    const calls = [];
    dialog.vm.performReset = (options) => {
      calls.push(options);
      return Promise.resolve(false);
    };
    wrapper.vm.openResetConfirmation();

    const promise = wrapper.vm.resetToCommonTags();
    await wrapper.vm.$nextTick();
    expect(dialog.props('externalSending')).to.equal(true);
    await promise;

    const resetDialog = wrapper.findAllComponents(ConfirmDialog)[2];
    expect(calls).to.deep.equal([{ ignoreExternalSending: true }]);
    expect(wrapper.vm.resetConfirmVisible).to.equal(true);
    expect(resetDialog.props()).to.include({
      actionsAdjacent: true,
      closeOnConfirm: false,
    });
  });

  it('共通タグへの再同期成功後だけ確認ダイアログを閉じる', async () => {
    const wrapper = createWrapper();
    const dialog = findTagListDialog(wrapper);
    dialog.vm.performReset = () => Promise.resolve(true);
    wrapper.vm.openResetConfirmation();

    await wrapper.vm.resetToCommonTags();

    expect(wrapper.vm.resetConfirmVisible).to.equal(false);
  });

  it('表示中にfloorIdが変わった場合は編集中の状態を破棄して新しい一覧へ戻す', async () => {
    const wrapper = createWrapper();
    wrapper.vm.openEditEditor(null, { _id: 'tag-1', order: 1, name: '旧フロアタグ' });
    await wrapper.setData({ form: { order: 9, name: '変更中' } });

    await wrapper.setProps({ floorId: 'floor-2', floorName: '別のフロア' });

    expect(wrapper.vm.screen).to.equal('list');
    expect(wrapper.vm.editingTag).to.equal(null);
    expect(wrapper.vm.form).to.deep.equal({ order: null, name: '' });
    expect(findTagListDialog(wrapper).props('scopeId')).to.equal('floor-2');
  });

  it('一覧を閉じると操作状態を初期化して親へcloseイベントを通知する', async () => {
    const wrapper = createWrapper();
    wrapper.vm.openEditEditor(null, { _id: 'tag-1', order: 1, name: '編集中のタグ' });
    await wrapper.setData({
      form: { order: 2, name: '変更中' },
      deleteConfirmVisible: true,
      deleteTarget: { _id: 'tag-2', name: '削除対象' },
      resetConfirmVisible: true,
    });

    findTagListDialog(wrapper).vm.$emit('close');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.screen).to.equal('list');
    expect(wrapper.vm.editingTag).to.equal(null);
    expect(wrapper.vm.form).to.deep.equal({ order: null, name: '' });
    expect(wrapper.vm.deleteConfirmVisible).to.equal(false);
    expect(wrapper.vm.deleteTarget).to.equal(null);
    expect(wrapper.vm.resetConfirmVisible).to.equal(false);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });
});
