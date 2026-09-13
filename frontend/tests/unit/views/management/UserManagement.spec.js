import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import UserManagement from '@/views/management/UserManagement.vue';
import userApi from '@/api/user';
import { createMountOptions, createStoreMock, buildViewWithoutLifecycle } from './helpers';

import flushPromises from '../../helpers/flushPromises';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  props: {
    visible: Boolean,
    sending: Boolean,
    titleId: String,
    titleText: String,
    descriptionIds: String,
    cancelLabel: String,
    confirmLabel: String,
    confirmTestId: String,
    actionsAdjacent: Boolean,
    initialFocus: String,
    progressMode: String,
  },
  emits: ['cancel', 'closed', 'confirm', 'update:visible'],
  template: '<section><h2 :id="titleId">{{ titleText }}</h2><slot /></section>',
};

const ManagementListBaseRowsStub = {
  name: 'ManagementListBase',
  props: ['title', 'tableLabel', 'payloadBuilder'],
  data() {
    return { rows: [] };
  },
  computed: {
    tableAttrs() {
      return { 'aria-label': this.tableLabel || this.title };
    },
  },
  methods: {
    reload() {},
    reloadFromFirstPage() {},
    showError() {},
  },
  template: `
    <div>
      <slot name="actions" :fetching="false" />
      <slot name="table" :items="rows" :table-attrs="tableAttrs" />
      <slot name="dialogs" />
    </div>
  `,
};

const mountView = () => {
  const View = buildViewWithoutLifecycle(UserManagement);
  return shallowMount(
    View,
    createMountOptions({
      stubs: {
        BaseEditDialog: BaseEditDialogStub,
      },
    })
  );
};

describe('ユーザの管理画面', () => {
  let originalPaginate;
  let originalUpdate;
  let originalSetDeleteState;

  beforeEach(() => {
    originalPaginate = userApi.managementPaginate;
    originalUpdate = userApi.managementUpdate;
    originalSetDeleteState = userApi.managementSetDeleteState;
  });

  afterEach(() => {
    userApi.managementPaginate = originalPaginate;
    userApi.managementUpdate = originalUpdate;
    userApi.managementSetDeleteState = originalSetDeleteState;
  });

  it('ユーザ取得で管理APIを呼ぶ', async () => {
    const calls = [];
    userApi.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [], page: 1, pages: 1, total: 0 } });
    };

    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.vm.getUsers({ page: 1, search: 'user' });

    expect(calls[0]).to.deep.equal({ page: 1, search: 'user' });
  });

  it('状態絞り込み条件をデータへ反映し、変更時は先頭ページから再取得する', async () => {
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    wrapper.vm.$refs.listBase.reloadFromFirstPage = () => {
      reloadCalls.push('reload');
      return Promise.resolve();
    };

    expect(wrapper.vm.statusFilter).to.equal('all');
    expect(wrapper.vm.buildListPayload({ page: 2, search: 'user' })).to.deep.equal({
      page: 2,
      search: 'user',
    });

    await wrapper.vm.onStatusFilterChange('deleted');
    expect(wrapper.vm.buildListPayload({ page: 1, search: null })).to.deep.equal({
      page: 1,
      search: null,
      delete_flg: true,
    });

    await wrapper.vm.onStatusFilterChange('all');
    expect(wrapper.vm.buildListPayload({ page: 1, search: null })).to.deep.equal({ page: 1, search: null });
    expect(reloadCalls).to.deep.equal(['reload', 'reload']);
    expect(wrapper.findComponent({ name: 'ManagementStatusFilter' }).exists()).to.equal(true);
    expect(wrapper.findComponent({ name: 'ManagementListBase' }).props('payloadBuilder')).to.equal(
      wrapper.vm.buildListPayload
    );
  });

  it('showRoleLabel はロール名を返す', () => {
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());

    expect(wrapper.vm.showRoleLabel('Author')).to.equal('投稿者');
    expect(wrapper.vm.showRoleLabel('Editor')).to.equal('フロア編集者');
    expect(wrapper.vm.showRoleLabel('developer')).to.equal('開発者');
    expect(wrapper.vm.showRoleLabel('Administrator')).to.equal('管理者');
    expect(wrapper.vm.showRoleLabel('Unknown')).to.equal(null);
  });

  it('行クリックに依存せず、有効行は削除、編集の順、削除済み行は復元だけを表示する', async () => {
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ManagementListBase: ManagementListBaseRowsStub } })
    );
    const listBase = wrapper.findComponent(ManagementListBaseRowsStub);
    await listBase.setData({
      rows: [
        { _id: 'active', username: 'active', role: 'Author', delete_flg: false },
        { _id: 'deleted', username: 'deleted', role: 'Author', delete_flg: true },
        { _id: 'admin', username: 'admin', role: 'Administrator', delete_flg: false },
      ],
    });

    expect(wrapper.findAll('[data-testid="management-user-edit"]')).to.have.lengthOf(2);
    expect(wrapper.findAll('[data-testid="management-user-lifecycle"]')).to.have.lengthOf(2);
    expect(
      wrapper.get('tbody tr').findAllComponents({ name: 'UiButton' }).map((button) => button.text())
    ).to.deep.equal(['managementUi.delete', 'managementUi.edit']);
    expect(wrapper.findAll('.management-table__interactive-row')).to.have.lengthOf(0);
    expect(wrapper.get('table').attributes('aria-label')).to.equal('managementUi.tableLabel');
    expect(wrapper.findAllComponents({ name: 'ManagementStatusBadge' })).to.have.lengthOf(3);
  });

  it('editUser は入力不正時に更新しない', () => {
    const calls = [];
    userApi.managementUpdate = () => {
      calls.push('called');
      return Promise.resolve();
    };

    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());

    wrapper.vm.editUser();

    expect(calls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('showEditUserDialog は選択ユーザ情報を編集フォームへ反映する', () => {
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const user = {
      _id: 'user-1',
      username: 'tester',
      mail: 'tester@example.com',
      role: 'Editor',
      image_name: 'avatar.png',
      delete_flg: false,
    };

    wrapper.vm.showEditUserDialog(user);

    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);
    expect(wrapper.vm.editUserValue._id).to.equal('user-1');
    expect(wrapper.vm.editUserValue.username).to.equal('tester');
    expect(wrapper.vm.editUserValue.mail).to.equal('tester@example.com');
    expect(wrapper.vm.editUserValue.password).to.equal(null);
    expect(wrapper.vm.editUserValue.role).to.equal('Editor');
    expect(wrapper.vm.editUserValue.image_name).to.equal('avatar.png');
    expect(wrapper.vm.editUserValue.delete_flg).to.equal(false);
  });

  it('共通編集ダイアログへ対象・操作・フォーカス・送信状態を渡す', async () => {
    const wrapper = mountView();
    wrapper.vm.showEditUserDialog({
      _id: 'user-1',
      username: '保存済みユーザ',
      mail: 'user@example.com',
      role: 'Author',
      image_name: null,
      delete_flg: false,
    });
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent(BaseEditDialogStub);
    const target = wrapper.findComponent({ name: 'DialogTargetContext' });
    const discardDialog = wrapper.findComponent({ name: 'ConfirmDialog' });

    expect(dialog.props()).to.include({
      visible: true,
      sending: false,
      titleId: 'user-management-edit-dialog-title',
      titleText: 'ユーザ編集',
      descriptionIds: 'user-management-target-context',
      cancelLabel: 'キャンセル',
      confirmLabel: 'managementUi.save',
      confirmTestId: 'management-user-submit',
      actionsAdjacent: true,
      initialFocus: '#user-management-username',
      progressMode: 'indeterminate',
    });
    expect(target.props()).to.include({
      contextId: 'user-management-target-context',
      label: '対象ユーザ',
      name: '保存済みユーザ',
    });
    expect(discardDialog.props()).to.include({
      actionsAdjacent: true,
      closeOnEscape: true,
      closeOnBackdrop: true,
      confirmIcon: 'delete',
    });
  });

  it('権限選択はAuthor・Editor・developerで、Administratorのロールを変更できず削除チェックボックスを表示しない', async () => {
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const buildUser = (overrides = {}) => ({
      _id: 'user-2',
      username: 'target',
      mail: 'target@example.com',
      role: 'Administrator',
      image_name: null,
      delete_flg: false,
      ...overrides,
    });

    expect(wrapper.find('option[value="Author"]').exists()).to.equal(true);
    expect(wrapper.find('option[value="Editor"]').exists()).to.equal(true);
    expect(wrapper.find('option[value="developer"]').exists()).to.equal(true);
    expect(wrapper.find('option[value="Administrator"]').exists()).to.equal(false);

    wrapper.vm.showEditUserDialog(buildUser());
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isEditingAdministrator).to.equal(true);
    expect(wrapper.find('input#role').exists()).to.equal(true);
    expect(wrapper.find('#role').attributes()).to.have.property('disabled');
    expect(wrapper.find('#delete_flg').exists()).to.equal(false);

    wrapper.vm.showEditUserDialog(
      buildUser({
        role: 'Author',
      })
    );
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isEditingAdministrator).to.equal(false);
    expect(wrapper.find('select#role').exists()).to.equal(true);
    expect(wrapper.find('#role').attributes('disabled')).to.equal(undefined);
    expect(wrapper.find('#delete_flg').exists()).to.equal(false);
  });

  it('削除済みユーザは編集せず復元対象とし、Administratorは削除・復元対象にしない', async () => {
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const deletedUser = {
      _id: 'user-deleted',
      username: 'deleted-user',
      mail: null,
      role: 'Author',
      delete_flg: true,
    };

    wrapper.vm.showEditUserDialog(deletedUser);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(false);

    wrapper.vm.showLifecycleDialog(deletedUser);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.lifecycleAction).to.equal('restore');
    expect(wrapper.findComponent({ name: 'ManagementLifecycleDialog' }).props('action')).to.equal('restore');

    wrapper.vm.clearLifecycleDialog();
    wrapper.vm.handleLifecycleDialogClosed();
    wrapper.vm.showLifecycleDialog({
      _id: 'admin',
      username: 'admin',
      role: 'Administrator',
      delete_flg: false,
    });
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
  });

  it('削除状態APIと一覧再取得が完了するまで対象と送信状態を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const calls = [];
    userApi.managementSetDeleteState = (payload) => {
      calls.push(payload);
      return mutation.promise;
    };
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCalls.push('reload');
        return reload.promise;
      },
      showError: () => {},
    });
    wrapper.vm.showLifecycleDialog({
      _id: 'user-1',
      username: 'target',
      role: 'Author',
      delete_flg: false,
    });

    const operation = wrapper.vm.setDeleteState('delete');
    await wrapper.vm.$nextTick();

    expect(calls).to.deep.equal([{ _id: 'user-1', delete_flg: true }]);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('user-1');
    wrapper.vm.clearLifecycleDialog();
    await wrapper.vm.setDeleteState('delete');
    expect(calls).to.have.lengthOf(1);

    mutation.resolve();
    await flushPromises();
    expect(reloadCalls).to.deep.equal(['reload']);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('user-1');

    reload.resolve();
    await operation;
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(false);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('user-1');
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
  });

  it('削除状態API失敗時は対象を維持して再操作可能にする', async () => {
    const apiError = new Error('failed');
    const calls = [];
    userApi.managementSetDeleteState = (payload) => {
      calls.push(payload);
      return Promise.reject(apiError);
    };
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => reloadCalls.push('reload'),
      showError: (...args) => showErrorCalls.push(args),
    });
    wrapper.vm.showLifecycleDialog({
      _id: 'user-2',
      username: 'deleted',
      role: 'Author',
      delete_flg: true,
    });

    await wrapper.vm.setDeleteState('restore');

    expect(calls).to.deep.equal([{ _id: 'user-2', delete_flg: false }]);
    expect(reloadCalls).to.have.lengthOf(0);
    expect(showErrorCalls).to.deep.equal([['復元に失敗しました', apiError]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('user-2');
  });

  it('編集フォームは入力前に入力検証エラーを表示しない', async () => {
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());

    expect(wrapper.vm.usernameError).to.equal('');
    expect(wrapper.vm.mailError).to.equal('');
    expect(wrapper.vm.passwordError).to.equal('');

    wrapper.vm.v$.editUserValue.username.$touch();
    wrapper.vm.v$.editUserValue.mail.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.usernameError).to.equal('必須です');
    expect(wrapper.vm.mailError).to.equal('');

    wrapper.setData({
      editUserValue: {
        ...wrapper.vm.editUserValue,
        mail: '',
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.mailError).to.equal('必須です');
  });

  it('編集フォームのユーザ名は20文字まで受け付け、21文字を拒否する', async () => {
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());

    await wrapper.setData({
      editUserValue: { ...wrapper.vm.editUserValue, username: 'a'.repeat(20) },
    });
    wrapper.vm.v$.editUserValue.username.$touch();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.v$.editUserValue.username.$invalid).to.equal(false);
    expect(wrapper.get('#user-management-username').attributes('maxlength')).to.equal('20');

    await wrapper.setData({
      editUserValue: { ...wrapper.vm.editUserValue, username: 'a'.repeat(21) },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.v$.editUserValue.username.$invalid).to.equal(true);
    expect(wrapper.vm.usernameError).to.equal('20文字まで');
  });

  it('mail=nullのユーザを編集すると元のdelete_flgを保持したデータで送信する', async () => {
    const calls = [];
    userApi.managementUpdate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };

    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {},
      showError: () => {},
    });
    wrapper.vm.showEditUserDialog({
      _id: 'line-user',
      username: 'line-user',
      mail: null,
      role: 'Author',
      image_name: null,
      delete_flg: false,
    });
    wrapper.vm.editUserValue.role = 'Editor';
    await wrapper.vm.$nextTick();

    wrapper.vm.v$.editUserValue.$touch();
    expect(wrapper.vm.v$.editUserValue.mail.$invalid).to.equal(false);

    wrapper.vm.editUser();
    await flushPromises();

    expect(calls).to.deep.equal([
      {
        _id: 'line-user',
        username: 'line-user',
        mail: null,
        role: 'Editor',
        delete_flg: false,
      },
    ]);
  });

  it('mailの空文字は入力不正として送信しない', async () => {
    const calls = [];
    userApi.managementUpdate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };

    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    wrapper.vm.showEditUserDialog({
      _id: 'line-user',
      username: 'line-user',
      mail: null,
      role: 'Author',
      image_name: null,
      delete_flg: false,
    });
    await wrapper.setData({
      editUserValue: {
        ...wrapper.vm.editUserValue,
        mail: '',
      },
    });

    wrapper.vm.editUser();

    expect(wrapper.vm.v$.editUserValue.mail.requiredWhenNotNull.$invalid).to.equal(true);
    expect(calls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('新しいパスワードを空欄に戻した場合はpasswordを送信しない', async () => {
    const calls = [];
    userApi.managementUpdate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };

    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, { reload: () => Promise.resolve() });
    wrapper.vm.showEditUserDialog({
      _id: 'user-no-password-change',
      username: 'target',
      mail: 'target@example.com',
      role: 'Author',
      image_name: null,
      delete_flg: false,
    });
    wrapper.vm.editUserValue.password = '';

    await wrapper.vm.editUser();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).not.to.have.property('password');
  });

  it('管理画面でログイン中の本人を更新した場合は表示用プロフィールも同期する', async () => {
    userApi.managementUpdate = () => Promise.resolve({ data: { ok: true } });
    const dispatchCalls = [];
    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          getters: {
            userId: 'user-1',
            userName: '旧名',
            userImageName: 'old.png',
          },
          dispatch: (type, payload) => {
            dispatchCalls.push({ type, payload });
            return Promise.resolve();
          },
        }),
      })
    );
    Object.assign(wrapper.vm.$refs.listBase, { reload: () => Promise.resolve() });
    wrapper.vm.showEditUserDialog({
      _id: 'user-1',
      username: '旧名',
      mail: 'self@example.com',
      role: 'Author',
      image_name: 'old.png',
      delete_flg: false,
    });
    wrapper.vm.editUserValue.username = '新名';
    wrapper.vm.editUserValue.image_name = 'new.png';

    await wrapper.vm.editUser();

    expect(dispatchCalls).to.deep.equal([
      {
        type: 'doUpdateUserIdentity',
        payload: { name: '新名', imageName: 'new.png' },
      },
    ]);
  });

  it('editUser は更新APIと一覧再取得の完了後もclosedまで編集対象を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const calls = [];
    userApi.managementUpdate = (payload) => {
      calls.push(payload);
      return mutation.promise;
    };

    const wrapper = mountView();
    const reloadCalls = [];
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCalls.push('reload');
        return reload.promise;
      },
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      editUserValue: {
        dialogVisible: true,
        _id: 'user-1',
        username: 'tester',
        mail: 'tester@example.com',
        password: null,
        role: 'Author',
        image_name: 'icon.png',
        delete_flg: false,
      },
    });

    const operation = wrapper.vm.editUser();
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent(BaseEditDialogStub);
    await flushPromises();

    expect(calls).to.deep.equal([
      {
        _id: 'user-1',
        username: 'tester',
        mail: 'tester@example.com',
        role: 'Author',
        image_name: 'icon.png',
        delete_flg: false,
      },
    ]);
    expect(reloadCalls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);
    expect(wrapper.vm.editUserValue._id).to.equal('user-1');
    expect(wrapper.vm.editUserValue.username).to.equal('tester');
    expect(dialog.props()).to.include({
      visible: true,
      sending: true,
      progressMode: 'indeterminate',
    });

    wrapper.vm.clearEditUserValue();
    wrapper.vm.editUser();
    expect(calls).to.have.lengthOf(1);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);

    mutation.resolve({ data: { ok: true } });
    await flushPromises();

    expect(reloadCalls).to.deep.equal(['reload']);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);
    expect(wrapper.vm.editUserValue._id).to.equal('user-1');
    expect(wrapper.vm.editUserValue.username).to.equal('tester');

    reload.resolve();
    await operation;
    await wrapper.vm.$nextTick();

    expect(showErrorCalls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.editUserValue._id).to.equal('user-1');
    expect(wrapper.vm.editUserValue.username).to.equal('tester');

    dialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editUserValue._id).to.equal(null);
    expect(wrapper.vm.editUserValue.username).to.equal(null);
  });

  it('editUser は更新API失敗時に一覧を再取得せず編集対象を維持して再操作できる', async () => {
    const apiError = new Error('failed');
    const updateCalls = [];
    userApi.managementUpdate = (payload) => {
      updateCalls.push(payload);
      return updateCalls.length === 1 ? Promise.reject(apiError) : Promise.resolve();
    };

    const View = buildViewWithoutLifecycle(UserManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCalls.push('reload');
        return Promise.resolve();
      },
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      editUserValue: {
        dialogVisible: true,
        _id: 'user-1',
        username: 'tester',
        mail: 'tester@example.com',
        password: null,
        role: 'Author',
        image_name: null,
        delete_flg: false,
      },
    });

    await wrapper.vm.editUser();

    expect(reloadCalls).to.have.lengthOf(0);
    expect(showErrorCalls).to.have.lengthOf(1);
    expect(showErrorCalls[0][0]).to.equal('更新に失敗しました');
    expect(showErrorCalls[0][1]).to.equal(apiError);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);
    expect(wrapper.vm.editUserValue._id).to.equal('user-1');
    expect(wrapper.vm.editUserValue.username).to.equal('tester');

    await wrapper.vm.editUser();

    expect(updateCalls).to.have.lengthOf(2);
    expect(reloadCalls).to.deep.equal(['reload']);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(false);
  });

  it('editUser は一覧再取得失敗を更新エラーに変換せずダイアログを閉じる', async () => {
    userApi.managementUpdate = () => Promise.resolve({ data: { ok: true } });

    const showErrorCalls = [];
    const wrapper = mountView();
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => Promise.reject(new Error('reload failed')),
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      editUserValue: {
        dialogVisible: true,
        _id: 'user-1',
        username: 'tester',
        mail: 'tester@example.com',
        password: null,
        role: 'Author',
        image_name: null,
        delete_flg: false,
      },
    });

    await wrapper.vm.editUser();

    expect(showErrorCalls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.editUserValue._id).to.equal('user-1');
    expect(wrapper.vm.editUserValue.username).to.equal('tester');

    wrapper.findComponent(BaseEditDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editUserValue._id).to.equal(null);
    expect(wrapper.vm.editUserValue.username).to.equal(null);
  });

  it('変更のない取消では編集ダイアログを先に非表示にし、closedイベントの後に編集対象を解除する', async () => {
    const wrapper = mountView();
    wrapper.vm.showEditUserDialog({
      _id: 'user-cancel',
      username: 'cancel-target',
      mail: 'cancel@example.com',
      role: 'Author',
      image_name: null,
      delete_flg: false,
    });
    const editDialog = wrapper.findComponent(BaseEditDialogStub);

    wrapper.vm.requestCloseEditUserDialog();

    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.editUserValue._id).to.equal('user-cancel');
    expect(wrapper.vm.editUserValue.username).to.equal('cancel-target');

    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editUserValue._id).to.equal(null);
    expect(wrapper.vm.editUserValue.username).to.equal(null);
    expect(wrapper.vm.selectedUserName).to.equal('');
  });

  it('入力変更後のclose要求では破棄確認を表示し、送信中は閉じない', async () => {
    const wrapper = mountView();
    wrapper.vm.showEditUserDialog({
      _id: 'user-1', username: 'before', mail: 'a@example.com', role: 'Author',
      image_name: null, delete_flg: false,
    });
    wrapper.vm.editUserValue.username = 'after';
    wrapper.vm.requestCloseEditUserDialog();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);

    wrapper.vm.discardConfirmVisible = false;
    wrapper.vm.sending = true;
    wrapper.vm.requestCloseEditUserDialog();
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);
  });

  it('破棄確定時は確認ダイアログのclosed後に編集ダイアログを閉じる', async () => {
    const wrapper = mountView();
    wrapper.vm.showEditUserDialog({
      _id: 'user-1', username: 'before', mail: 'a@example.com', role: 'Author',
      image_name: null, delete_flg: false,
    });
    wrapper.vm.editUserValue.username = 'after';
    wrapper.vm.requestCloseEditUserDialog();
    const editDialog = wrapper.findComponent(BaseEditDialogStub);
    const discardDialog = wrapper.findComponent({ name: 'ConfirmDialog' });

    wrapper.vm.cancelDiscardChanges();
    discardDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);

    wrapper.vm.requestCloseEditUserDialog();
    wrapper.vm.confirmDiscardChanges();

    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.discardClosePending).to.equal(true);
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(true);

    discardDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.editUserValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.discardClosePending).to.equal(false);
    expect(wrapper.vm.editUserValue._id).to.equal('user-1');
    expect(wrapper.vm.editUserValue.username).to.equal('after');

    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editUserValue._id).to.equal(null);
    expect(wrapper.vm.editUserValue.username).to.equal(null);
    expect(wrapper.vm.selectedUserName).to.equal('');
  });
});
