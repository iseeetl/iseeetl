import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import CategoryTagManagement from '@/views/management/CategoryTagManagement.vue';
import AIAnalysisSettingManagement from '@/views/management/AIAnalysisSettingManagement.vue';
import FloorMemberManagement from '@/views/management/FloorMemberManagement.vue';
import PostManagement from '@/views/management/PostManagement.vue';
import RoomMemberManagement from '@/views/management/RoomMemberManagement.vue';
import SpamManagement from '@/views/management/SpamManagement.vue';
import UserManagement from '@/views/management/UserManagement.vue';
import { buildViewWithoutLifecycle, createMountOptions } from './helpers';

const ManagementListBaseStub = {
  name: 'ManagementListBase',
  template: '<div><slot name="dialogs" /></div>',
};

const UiDialogStub = {
  name: 'UiDialog',
  props: ['open', 'titleId', 'closeOnEscape', 'closeOnBackdrop', 'initialFocus'],
  template:
    '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><slot name="status" /></section>',
};

const UiProgressStub = {
  name: 'UiProgress',
  inheritAttrs: false,
  props: ['mode'],
  template: '<div class="management-dialog-progress" v-bind="$attrs" />',
};

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  emits: ['closed'],
  props: {
    visible: Boolean,
    sending: Boolean,
    titleId: String,
    titleText: String,
    descriptionIds: String,
    cancelLabel: String,
    confirmLabel: String,
    confirmTestId: String,
    confirmDisabled: Boolean,
    actionsAdjacent: Boolean,
    initialFocus: String,
    progressMode: String,
  },
  template: '<section><h2 :id="titleId">{{ titleText }}</h2><slot /></section>',
};

const AIAnalysisSettingFormFieldsStub = {
  name: 'AIAnalysisSettingFormFields',
  props: ['searching', 'sending'],
  template: '<section />',
};

const ManagementLifecycleDialogStub = {
  name: 'ManagementLifecycleDialog',
  props: ['open', 'sending', 'action', 'resourceLabel', 'resourceName', 'warning'],
  template: '<section data-testid="management-lifecycle-dialog-stub"><slot /></section>',
};

const cases = [
  {
    name: 'AI解析設定',
    view: AIAnalysisSettingManagement,
    shell: 'base-edit',
    dialogs: [
      {
        titleId: 'ai-analysis-setting-dialog-title',
        initialFocus: '#ai-analysis-setting-tag',
        confirmTestId: 'ai-analysis-setting-submit',
      },
    ],
  },
  {
    name: '共通タグ',
    view: CategoryTagManagement,
    shell: 'base-edit',
    dialogs: [
      {
        titleId: 'category-tag-management-dialog-title',
        initialFocus: '#category-tag-order',
        confirmTestId: 'management-categorytag-submit',
      },
    ],
  },
  {
    name: 'スパム',
    view: SpamManagement,
    shell: 'base-edit',
    dialogs: [
      {
        titleId: 'spam-management-edit-dialog-title',
        initialFocus: '#spam-word',
        confirmTestId: 'management-spam-submit',
      },
    ],
  },
  {
    name: 'ユーザ',
    view: UserManagement,
    shell: 'base-edit',
    dialogs: [
      {
        titleId: 'user-management-edit-dialog-title',
        initialFocus: '#user-management-username',
        confirmTestId: 'management-user-submit',
      },
    ],
  },
];

const memberDialogCases = [
  {
    name: 'フロアメンバー',
    view: FloorMemberManagement,
    stateKey: 'deleteFloorMemberValue',
    titleId: 'floor-member-management-delete-dialog-title',
    resourceLabel: '対象フロア',
    resourceName: 'フロアA',
    userName: 'ユーザA',
    state: {
      dialogVisible: true,
      _id: 'floor-member-1',
      floor_id: 'floor-1',
      floorTitle: 'フロアA',
      username: 'ユーザA',
    },
  },
  {
    name: 'ルームメンバー',
    view: RoomMemberManagement,
    stateKey: 'deleteRoomMemberValue',
    titleId: 'room-member-management-delete-dialog-title',
    resourceLabel: '対象ルーム',
    resourceName: 'ルームA',
    userName: 'ユーザA',
    state: {
      dialogVisible: true,
      _id: 'room-member-1',
      roomTitle: 'ルームA',
      username: 'ユーザA',
    },
  },
];

describe('管理画面のダイアログ共通仕様', () => {
  cases.forEach((testCase) => {
    it(testCase.name + 'は固定タイトルと初期フォーカスを持ち、送信中は閉じない', async () => {
      const View = buildViewWithoutLifecycle(testCase.view);
      const wrapper = shallowMount(
        View,
        createMountOptions({
          stubs: {
            ManagementListBase: ManagementListBaseStub,
            BaseEditDialog: BaseEditDialogStub,
            UiDialog: UiDialogStub,
            UiProgress: UiProgressStub,
          },
        })
      );

      const usesBaseEditDialog = testCase.shell === 'base-edit';
      let dialogs = usesBaseEditDialog
        ? wrapper.findAllComponents(BaseEditDialogStub)
        : wrapper.findAllComponents(UiDialogStub);
      expect(dialogs.length).to.equal(testCase.dialogs.length);

      dialogs.forEach((dialog, index) => {
        const expected = testCase.dialogs[index];
        if (usesBaseEditDialog) {
          expect(dialog.props()).to.include({
            sending: false,
            titleId: expected.titleId,
            initialFocus: expected.initialFocus,
            confirmTestId: expected.confirmTestId,
            actionsAdjacent: true,
            progressMode: 'indeterminate',
          });
        } else {
          expect(dialog.props()).to.include({
            titleId: expected.titleId,
            initialFocus: expected.initialFocus,
            closeOnEscape: true,
            closeOnBackdrop: true,
          });
        }
        expect(dialog.find('#' + expected.titleId).exists()).to.equal(true);
        if (!usesBaseEditDialog && expected.hasMutationProgress) {
          const progress = dialog.findComponent(UiProgressStub);
          expect(progress.exists()).to.equal(true);
          expect(progress.props('mode')).to.equal('indeterminate');
          expect(progress.attributes('aria-labelledby')).to.equal(expected.titleId);
        }
      });

      wrapper.setData({ sending: true });
      await wrapper.vm.$nextTick();
      dialogs = usesBaseEditDialog
        ? wrapper.findAllComponents(BaseEditDialogStub)
        : wrapper.findAllComponents(UiDialogStub);

      dialogs.forEach((dialog, index) => {
        if (usesBaseEditDialog) {
          expect(dialog.props('sending')).to.equal(true);
        } else {
          expect(dialog.props('closeOnEscape')).to.equal(false);
          expect(dialog.props('closeOnBackdrop')).to.equal(false);
        }
        if (!usesBaseEditDialog && testCase.dialogs[index].hasMutationProgress) {
          expect(dialog.findComponent(UiProgressStub).isVisible()).to.equal(true);
        }
      });
    });
  });

  it('AI解析設定はユーザ検索中も共通編集ダイアログを閉じられ、保存だけを無効にする', async () => {
    const View = buildViewWithoutLifecycle(AIAnalysisSettingManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        stubs: {
          AIAnalysisSettingFormFields: AIAnalysisSettingFormFieldsStub,
          BaseEditDialog: BaseEditDialogStub,
          ManagementListBase: ManagementListBaseStub,
        },
      })
    );

    await wrapper.setData({
      dialogVisible: true,
      resultUsersLoading: true,
    });

    expect(wrapper.findComponent(BaseEditDialogStub).props()).to.include({
      visible: true,
      sending: false,
      confirmDisabled: true,
      titleId: 'ai-analysis-setting-dialog-title',
      initialFocus: '#ai-analysis-setting-tag',
      progressMode: 'indeterminate',
    });
    expect(wrapper.findComponent(AIAnalysisSettingFormFieldsStub).props()).to.include({
      searching: true,
      sending: false,
    });
  });

  it('AI解析設定はダイアログが閉じた通知を受けるまで編集対象を保持する', async () => {
    const View = buildViewWithoutLifecycle(AIAnalysisSettingManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        stubs: {
          AIAnalysisSettingFormFields: AIAnalysisSettingFormFieldsStub,
          BaseEditDialog: BaseEditDialogStub,
          ManagementListBase: ManagementListBaseStub,
        },
      })
    );
    const target = {
      _id: 'setting-1',
      tag: { _id: 'tag-1', name: 'Tag A' },
      analysis_kind: 'vision',
      additional_prompt: 'prompt',
      result_user: { _id: 'user-1', username: 'User A' },
      revision: 2,
      delete_flg: false,
    };

    wrapper.vm.openEditDialog(target);
    wrapper.vm.closeDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.form._id).to.equal('setting-1');
    expect(wrapper.vm.dialogTargetName).to.equal('aiAnalysisSettings.kindVision / Tag A');

    wrapper.findComponent(BaseEditDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.form._id).to.equal(null);
    expect(wrapper.vm.dialogTargetName).to.equal('');
  });

  memberDialogCases.forEach((testCase) => {
    it(testCase.name + 'は対象情報と送信状態を共通のメンバー削除ダイアログへ渡す', async () => {
      const View = buildViewWithoutLifecycle(testCase.view);
      const wrapper = shallowMount(
        View,
        createMountOptions({
          stubs: {
            ManagementListBase: ManagementListBaseStub,
          },
        })
      );

      await wrapper.setData({
        [testCase.stateKey]: testCase.state,
        sending: true,
      });

      const dialog = wrapper.findComponent({ name: 'ManagementMemberDeleteDialog' });
      expect(dialog.exists()).to.equal(true);
      expect(dialog.props()).to.include({
        open: true,
        sending: true,
        titleId: testCase.titleId,
        resourceLabel: testCase.resourceLabel,
        resourceName: testCase.resourceName,
        userName: testCase.userName,
      });
    });
  });

  it('投稿は削除・復元をManagementLifecycleDialogの共通契約へ渡す', async () => {
    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        stubs: {
          ManagementListBase: ManagementListBaseStub,
          ManagementLifecycleDialog: ManagementLifecycleDialogStub,
        },
      })
    );
    const activePost = {
      _id: 'post-1',
      content: '投稿A',
      delete_flg: false,
      floor: { title: 'フロアA' },
      room: { title: 'ルームA' },
      user: { username: 'ユーザA' },
    };

    await wrapper.setData({
      dialogVisible: true,
      post: activePost,
      isDelete: true,
      sending: false,
    });

    let dialog = wrapper.findComponent(ManagementLifecycleDialogStub);
    expect(dialog.props()).to.include({
      open: true,
      sending: false,
      action: 'delete',
      resourceLabel: '投稿',
      resourceName: '投稿A',
      warning: '',
    });

    await wrapper.setData({
      post: { ...activePost, delete_flg: true },
      isDelete: false,
      sending: true,
    });

    dialog = wrapper.findComponent(ManagementLifecycleDialogStub);
    expect(dialog.props()).to.include({
      open: true,
      sending: true,
      action: 'restore',
      resourceLabel: '投稿',
      resourceName: '投稿A',
    });
  });
});
