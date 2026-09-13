import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import tagApi from '@/api/tag';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import RoomTagDialog from '@/components/room-tag/RoomTagDialog.vue';
import TagListDialog from '@/components/tag/TagListDialog.vue';

const createWrapper = (props = {}) =>
  shallowMount(RoomTagDialog, {
    props: {
      dialogVisible: true,
      roomId: 'room-1',
      roomName: 'テストルーム',
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

describe('ルームタグの一覧と操作', () => {
  let originalApi;

  beforeEach(() => {
    originalApi = {
      list: tagApi.roomTag.list,
      create: tagApi.roomTag.create,
      update: tagApi.roomTag.update,
      remove: tagApi.roomTag.remove,
      importCsv: tagApi.roomTag.importCsv,
      exportCsv: tagApi.roomTag.exportCsv,
      resetToFloor: tagApi.roomTag.resetToFloor,
    };
  });

  afterEach(() => {
    Object.assign(tagApi.roomTag, originalApi);
  });

  it('既存propsを維持し、内部CRUD後はcloseだけを親へ通知する', () => {
    expect(RoomTagDialog.name).to.equal('RoomTagDialog');
    expect(RoomTagDialog.props).to.deep.equal({
      dialogVisible: Boolean,
      roomId: String,
      roomName: {
        type: String,
        default: '',
      },
    });
    expect(RoomTagDialog.emits).to.deep.equal(['close']);
  });

  it('対象ルームと設定を一覧へ渡し、内部の画面切替時だけ編集スロットを有効にする', async () => {
    const wrapper = createWrapper();
    const dialog = findTagListDialog(wrapper);
    const { api, ...config } = dialog.props('config');

    expect(dialog.props()).to.include({
      dialogVisible: true,
      scopeId: 'room-1',
      scopeName: 'テストルーム',
      screen: 'list',
      externalSending: false,
      listCloseEndAligned: true,
    });
    expect(Object.keys(api)).to.deep.equal(['list', 'importCsv', 'exportCsv', 'reset']);
    expect(config).to.include({
      scope: 'room',
      titleId: 'room_tag_dialog_title',
      titleKey: 'ルームタグ一覧',
      targetLabelKey: '対象ルーム',
      fetchFailureKey: 'ルームタグの取得に失敗しました',
      confirmReset: true,
    });

    dialog.vm.$emit('create', { currentTarget: null });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.screen).to.equal('editor');
    expect(dialog.props('editorTitle')).to.equal('ルームタグを作成');
    expect(dialog.props('editorSubmitLabel')).to.equal('作成');
    expect(wrapper.emitted()).not.to.have.property('create');
  });

  it('未保存変更がある時だけ破棄確認を経由し、破棄後は一覧へ戻る', async () => {
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

  it('作成をRoomTag APIへ保存して一覧を再取得し、保存行へフォーカスする', async () => {
    const calls = [];
    tagApi.roomTag.create = (payload) => {
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
    wrapper.vm.openCreateEditor({ currentTarget: { id: 'room_tag_dialog_title_create_mobile' } });
    await wrapper.setData({ form: { order: 3, name: '新しいタグ' } });

    await wrapper.vm.saveTag();

    expect(calls).to.deep.equal([
      { room_id: 'room-1', order: 3, name: '新しいタグ', lang: 'ja' },
    ]);
    expect(fetchOptions).to.deep.equal([{ ignoreExternalSending: true }]);
    expect(wrapper.vm.screen).to.equal('list');
    expect(focused).to.deep.equal([['tag-created', 'mobile']]);
  });

  it('編集は通常のルームタグAPIへ保存し、管理用APIを使わない', async () => {
    const calls = [];
    tagApi.roomTag.update = (...args) => {
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

  it('削除確認に対象ルーム・対象タグを保持し、成功後は次の行へフォーカスする', async () => {
    const removed = [];
    tagApi.roomTag.remove = (payload) => {
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
      currentTarget: { id: 'room_tag_dialog_title_delete_mobile_tag-1' },
    });
    expect(wrapper.vm.deleteTarget).to.deep.equal(tags[0]);
    expect(wrapper.vm.deleteConfirmVisible).to.equal(true);
    expect(wrapper.findAllComponents(ConfirmDialog)[1].props()).to.include({
      actionsAdjacent: true,
      closeOnConfirm: false,
      confirmIcon: 'delete',
    });

    await wrapper.vm.deleteTag();

    expect(removed).to.deep.equal([{ _id: 'tag-1' }]);
    expect(focused).to.deep.equal([]);
    expect(wrapper.vm.deleteTarget).to.deep.equal(tags[0]);

    wrapper.findAllComponents(ConfirmDialog)[1].vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(focused).to.deep.equal([['tag-2', 'mobile']]);
    expect(wrapper.vm.deleteTarget).to.equal(null);
    expect(wrapper.vm.deleteConfirmVisible).to.equal(false);
  });

  it('親タグからの再同期は確認後に実行し、警告対象の操作中は一覧を閉じられない', async () => {
    const wrapper = createWrapper();
    const dialog = findTagListDialog(wrapper);
    const calls = [];
    dialog.vm.performReset = (options) => {
      calls.push(options);
      return Promise.resolve(true);
    };
    wrapper.vm.openResetConfirmation();

    const promise = wrapper.vm.resetToFloorTags();
    await wrapper.vm.$nextTick();
    expect(dialog.props('externalSending')).to.equal(true);
    await promise;

    expect(calls).to.deep.equal([{ ignoreExternalSending: true }]);
    expect(wrapper.vm.resetConfirmVisible).to.equal(false);
  });
});
