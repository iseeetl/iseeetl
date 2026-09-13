import { h } from 'vue';
import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import CategoryTagManagement from '@/views/management/CategoryTagManagement.vue';
import AIAnalysisSettingManagement from '@/views/management/AIAnalysisSettingManagement.vue';
import FloorManagement from '@/views/management/FloorManagement.vue';
import FloorMemberManagement from '@/views/management/FloorMemberManagement.vue';
import FloorTagManagement from '@/views/management/FloorTagManagement.vue';
import PostManagement from '@/views/management/PostManagement.vue';
import RoomManagement from '@/views/management/RoomManagement.vue';
import RoomMemberManagement from '@/views/management/RoomMemberManagement.vue';
import RoomTagManagement from '@/views/management/RoomTagManagement.vue';
import SpamManagement from '@/views/management/SpamManagement.vue';
import TimelineDataManagement from '@/views/management/TimelineDataManagement.vue';
import TimelineRoomDataManagement from '@/views/management/TimelineRoomDataManagement.vue';
import UserManagement from '@/views/management/UserManagement.vue';
import { createMountOptions, buildViewWithoutLifecycle, translate } from './helpers';

const createdAt = '2026-07-13T00:00:00.000Z';
const dateFields = () => ({
  created_at: createdAt,
  updated_at: null,
  deleted_at: null,
});

const createManagementListBaseStub = (items) => ({
  name: 'ManagementListBaseStub',
  props: ['tableLabel'],
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'management-list-base-stub' },
        [
          slots.table?.({
            items,
            fetching: false,
            tableAttrs: props.tableLabel ? { 'aria-label': props.tableLabel } : {},
          }),
          slots.dialogs?.(),
        ]
      );
  },
});

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: attrs.type || 'button',
          onClick: (event) => emit('click', event),
        },
        slots.default?.()
      );
  },
};

const AIAnalysisSettingManagementForAccessibility = {
  ...AIAnalysisSettingManagement,
  methods: {
    ...AIAnalysisSettingManagement.methods,
    searchResultUsers() {},
  },
};

const mountViewWithItems = (view, items, props = {}) => {
  const View = buildViewWithoutLifecycle(view);
  return shallowMount(View, {
    ...createMountOptions({
      mocks: {
        $t: (key, params) => {
          const translations = {
            'aiAnalysisSettings.titleCommon': '共通AI解析設定',
            'aiAnalysisSettings.titleCommonManagement': '共通AI解析設定管理',
            'managementUi.delete': '削除',
            'managementUi.edit': '編集',
            'managementUi.removeMember': 'メンバーを削除',
            'managementUi.referenceUnavailable': '参照先なし',
            'managementUi.restore': '復元',
            'managementUi.tableLabel': '{resource}一覧',
          };
          return translate(translations[key] || key, params);
        },
      },
      stubs: {
        ManagementListBase: createManagementListBaseStub(items),
        UiButton: UiButtonStub,
      },
    }),
    props,
  });
};

describe('管理一覧の行操作アクセシビリティ', () => {
  const cases = [
    {
      name: 'AI解析設定管理',
      view: AIAnalysisSettingManagementForAccessibility,
      item: {
        _id: 'setting-1',
        tag: { _id: 'category-tag-1', name: '解析タグA' },
        analysis_kind: 'vision',
        additional_prompt: '',
        result_user: { _id: 'user-1', username: 'ユーザA', image_name: null },
        revision: 2,
      },
      ariaLabel: 'aiAnalysisSettings.editSettingAria',
      buttonText: 'aiAnalysisSettings.edit',
      tableLabel: '共通AI解析設定一覧',
      assertRowUnselected(wrapper) {
        expect(wrapper.vm.dialogVisible).to.equal(false);
        expect(wrapper.vm.lifecycleTarget).to.equal(null);
      },
      assertSelected(wrapper, item) {
        expect(wrapper.vm.dialogVisible).to.equal(true);
        expect(wrapper.vm.form._id).to.equal(item._id);
        expect(wrapper.vm.form.revision).to.equal(item.revision);
      },
    },
    {
      name: '共通タグ管理',
      view: CategoryTagManagement,
      item: {
        _id: 'category-tag-1',
        order: 1,
        name: '共通タグA',
        delete_flg: false,
        ...dateFields(),
      },
      ariaLabel: '編集: 共通タグ「共通タグA」',
      buttonText: '編集',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.dialogVisible).to.equal(true);
        expect(wrapper.vm.id).to.equal(item._id);
      },
    },
    {
      name: 'フロアタグ管理',
      view: FloorTagManagement,
      item: {
        _id: 'floor-tag-1',
        order: 1,
        name: 'フロアタグA',
        delete_flg: false,
        ...dateFields(),
      },
      ariaLabel: '編集: フロアタグ「フロアタグA」',
      buttonText: '編集',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.editFloorTagDialogVisible).to.equal(true);
        expect(wrapper.vm.selectedFloorTag).to.deep.equal(item);
      },
    },
    {
      name: 'ルームタグ管理',
      view: RoomTagManagement,
      item: {
        _id: 'room-tag-1',
        order: 1,
        name: 'ルームタグA',
        delete_flg: false,
        ...dateFields(),
      },
      ariaLabel: '編集: ルームタグ「ルームタグA」',
      buttonText: '編集',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.editRoomTagDialogVisible).to.equal(true);
        expect(wrapper.vm.selectedRoomTag).to.deep.equal(item);
      },
    },
    {
      name: 'フロア管理',
      view: FloorManagement,
      item: {
        _id: 'floor-1',
        title: 'フロアA',
        description: '説明',
        image_name: null,
        floor_display_hidden: false,
        delete_flg: false,
        lang: 'ja',
        target_langs: [],
        translations: [],
        user: { username: 'owner' },
        ...dateFields(),
      },
      ariaLabel: '編集: フロア「フロアA」',
      buttonText: '編集',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.editFloorValue.dialogVisible).to.equal(true);
        expect(wrapper.vm.editFloorValue._id).to.equal(item._id);
      },
    },
    {
      name: 'ルーム管理',
      view: RoomManagement,
      item: {
        _id: 'room-1',
        title: 'ルームA',
        description: '説明',
        image_name: null,
        lang: 'ja',
        guest_reaction_only: false,
        member_only: false,
        notification: true,
        external_sns_button: false,
        room_display_hidden: false,
        delete_flg: false,
        floor: { _id: 'floor-1', title: 'フロアA' },
        user: { username: 'owner' },
        ...dateFields(),
      },
      ariaLabel: '編集: ルーム「ルームA」',
      buttonText: '編集',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.editRoomValue.dialogVisible).to.equal(true);
        expect(wrapper.vm.editRoomValue._id).to.equal(item._id);
      },
    },
    {
      name: 'ユーザ管理',
      view: UserManagement,
      item: {
        _id: 'user-1',
        username: 'ユーザA',
        mail: 'user@example.com',
        role: 'User',
        image_name: null,
        delete_flg: false,
        ...dateFields(),
      },
      ariaLabel: '編集: ユーザ「ユーザA」',
      buttonText: '編集',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);
        expect(wrapper.vm.editUserValue._id).to.equal(item._id);
      },
    },
    {
      name: 'スパム管理',
      view: SpamManagement,
      item: {
        _id: 'spam-1',
        word: 'スパムワードA',
        ...dateFields(),
      },
      ariaLabel: 'スパムワード「スパムワードA」を編集',
      buttonText: '編集',
      tableLabel: 'スパムワード一覧',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(true);
        expect(wrapper.vm.editSpamValue._id).to.equal(item._id);
      },
    },
    {
      name: 'フロアメンバー管理',
      view: FloorMemberManagement,
      item: {
        _id: 'floor-member-1',
        floor: { _id: 'floor-1', title: 'フロアA' },
        user: { username: 'ユーザA' },
        ...dateFields(),
      },
      ariaLabel: '「フロアA」のメンバー「ユーザA」を削除',
      buttonText: '削除',
      tableLabel: 'フロアメンバー一覧',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.deleteFloorMemberValue.dialogVisible).to.equal(true);
        expect(wrapper.vm.deleteFloorMemberValue._id).to.equal(item._id);
      },
    },
    {
      name: 'ルームメンバー管理',
      view: RoomMemberManagement,
      item: {
        _id: 'room-member-1',
        room: { _id: 'room-1', title: 'ルームA' },
        user: { username: 'ユーザA' },
        ...dateFields(),
      },
      ariaLabel: '「ルームA」のメンバー「ユーザA」を削除',
      buttonText: '削除',
      tableLabel: 'ルームメンバー一覧',
      assertSelected(wrapper, item) {
        expect(wrapper.vm.deleteRoomMemberValue.dialogVisible).to.equal(true);
        expect(wrapper.vm.deleteRoomMemberValue._id).to.equal(item._id);
      },
    },
  ];

  cases.forEach((testCase) => {
    it(testCase.name + 'は明示的な操作ボタンから対象ダイアログを開く', async () => {
      const wrapper = mountViewWithItems(testCase.view, [testCase.item]);
      const table = wrapper.find('.management-table-scroll > table.management-table');
      const dataRow = table.find('tbody tr');
      const button = wrapper.find('button[aria-label="' + testCase.ariaLabel + '"]');

      expect(table.exists()).to.equal(true);
      expect(table.find('thead').exists()).to.equal(true);
      expect(table.find('tbody').exists()).to.equal(true);
      if (testCase.tableLabel) {
        expect(table.attributes('aria-label')).to.equal(testCase.tableLabel);
      }
      table.findAll('thead th').forEach((header) => {
        expect(header.attributes('scope')).to.equal('col');
      });
      expect(dataRow.attributes('role')).to.equal(undefined);
      expect(dataRow.attributes('tabindex')).to.equal(undefined);
      expect(button.exists()).to.equal(true);
      expect(button.attributes('type')).to.equal('button');
      expect(button.text().trim()).to.equal(testCase.buttonText);

      if (testCase.assertRowUnselected) {
        await dataRow.trigger('click');
        testCase.assertRowUnselected(wrapper);
      }

      await button.trigger('click');

      testCase.assertSelected(wrapper, testCase.item);
    });
  });

  cases.filter(({ item }) => Object.hasOwn(item, 'delete_flg')).forEach((testCase) => {
    it(testCase.name + 'は削除済み行へ共通の中立背景を適用する', () => {
      const deletedItem = { ...testCase.item, delete_flg: true };
      const wrapper = mountViewWithItems(testCase.view, [deletedItem]);

      expect(wrapper.get('tbody tr').classes()).to.include('soft-delete');
    });
  });

  it('関連データの参照先が欠損していても一覧を表示する', async () => {
    const floor = {
      _id: 'floor-without-user',
      title: 'フロアA',
      user: null,
      floor_display_hidden: false,
      delete_flg: false,
      ...dateFields(),
    };
    const room = {
      _id: 'room-without-references',
      title: 'ルームA',
      floor: null,
      user: null,
      member_only: false,
      room_display_hidden: false,
      delete_flg: false,
      ...dateFields(),
    };
    const floorMember = {
      _id: 'floor-member-without-references',
      floor: null,
      user: null,
      ...dateFields(),
    };
    const roomMember = {
      _id: 'room-member-without-references',
      room: null,
      user: null,
      ...dateFields(),
    };
    const renderCases = [
      { view: FloorManagement, item: floor, referenceColumns: [1] },
      { view: RoomManagement, item: room, referenceColumns: [1, 2] },
      { view: FloorMemberManagement, item: floorMember, referenceColumns: [0, 1] },
      { view: RoomMemberManagement, item: roomMember, referenceColumns: [0, 1] },
      { view: TimelineDataManagement, item: floor, referenceColumns: [1] },
      {
        view: TimelineRoomDataManagement,
        item: room,
        referenceColumns: [2],
        props: { floorId: 'floor-1' },
      },
    ];

    const wrappers = renderCases.map((testCase) => {
      const wrapper = mountViewWithItems(testCase.view, [testCase.item], testCase.props);
      const cells = wrapper.findAll('tbody td');
      testCase.referenceColumns.forEach((column) => {
        expect(cells[column].text()).to.equal('参照先なし');
      });
      return wrapper;
    });

    const floorMemberWrapper = wrappers[2];
    expect(floorMemberWrapper.get('button').attributes('disabled')).to.equal(undefined);
    floorMemberWrapper.vm.showDeleteFloorMemberDialog(floorMember);
    expect(floorMemberWrapper.vm.deleteFloorMemberValue).to.include({
      dialogVisible: true,
      username: '参照先なし',
      floorTitle: '参照先なし',
    });

    const roomMemberWrapper = wrappers[3];
    await roomMemberWrapper.get('button').trigger('click');
    expect(roomMemberWrapper.vm.deleteRoomMemberValue).to.include({
      dialogVisible: true,
      username: '参照先なし',
      roomTitle: '参照先なし',
    });

    const post = {
      _id: 'post-without-references',
      content: '投稿A',
      floor: null,
      room: null,
      user: null,
      guest_name: null,
      replies: [],
      supplementaries: [],
      delete_flg: false,
      ...dateFields(),
    };
    const postWrapper = mountViewWithItems(PostManagement, [post]);
    expect(postWrapper.get('tbody td').text().match(/参照先なし/g)).to.have.lengthOf(2);
    postWrapper.vm.showDeleteDialog(postWrapper.vm.flattenPosts([post])[0]);
    expect(postWrapper.vm.selectedContext).to.equal('参照先なし / 参照先なし');
  });

  it('投稿管理は投稿・返信・付加情報ごとに明示的な削除・復元ボタンを提供する', async () => {
    const replySupplement = {
      _id: 'reply-supplement-1',
      content: '返信の付加情報A',
      delete_flg: false,
      user: { username: 'ユーザA' },
      ...dateFields(),
    };
    const reply = {
      _id: 'reply-1',
      content: '返信A',
      delete_flg: false,
      user: { username: 'ユーザA' },
      guest_name: null,
      supplementaries: [replySupplement],
      ...dateFields(),
    };
    const postSupplement = {
      _id: 'post-supplement-1',
      content: '投稿の付加情報A',
      delete_flg: true,
      user: { username: 'ユーザA' },
      ...dateFields(),
    };
    const post = {
      _id: 'post-1',
      content: '投稿A',
      delete_flg: false,
      floor: { title: 'フロアA' },
      room: { title: 'ルームA' },
      user: { username: 'ユーザA' },
      guest_name: null,
      replies: [reply],
      supplementaries: [postSupplement],
      ...dateFields(),
    };
    const wrapper = mountViewWithItems(PostManagement, [post]);
    const targets = [
      {
        ariaLabel: '削除: 投稿「投稿A」',
        action: 'delete',
        buttonText: '削除',
        resourceLabel: '投稿',
        reply: null,
        supplement: null,
      },
      {
        ariaLabel: '削除: 返信「返信A」',
        action: 'delete',
        buttonText: '削除',
        resourceLabel: '返信',
        reply,
        supplement: null,
      },
      {
        ariaLabel: '削除: 付加情報「返信の付加情報A」',
        action: 'delete',
        buttonText: '削除',
        resourceLabel: '付加情報',
        reply,
        supplement: replySupplement,
      },
      {
        ariaLabel: '復元: 付加情報「投稿の付加情報A」',
        action: 'restore',
        buttonText: '復元',
        resourceLabel: '付加情報',
        reply: null,
        supplement: postSupplement,
      },
    ];

    expect(wrapper.findAll('button.management-row-action-button').length).to.equal(4);

    for (const target of targets) {
      const button = wrapper.find('button[aria-label="' + target.ariaLabel + '"]');
      expect(button.exists()).to.equal(true);
      expect(button.attributes('type')).to.equal('button');
      expect(button.text().trim()).to.equal(target.buttonText);

      await button.trigger('click');

      expect(wrapper.vm.dialogVisible).to.equal(true);
      expect(wrapper.vm.post).to.deep.equal(post);
      expect(wrapper.vm.reply).to.deep.equal(target.reply);
      expect(wrapper.vm.supplement).to.deep.equal(target.supplement);
      const lifecycleDialog = wrapper.findComponent({ name: 'ManagementLifecycleDialog' });
      expect(lifecycleDialog.exists()).to.equal(true);
      expect(lifecycleDialog.props('action')).to.equal(target.action);
      expect(lifecycleDialog.props('resourceLabel')).to.equal(target.resourceLabel);
    }
  });
});
