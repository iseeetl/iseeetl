import { h } from 'vue';
import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import PostManagement from '@/views/management/PostManagement.vue';
import chatApi from '@/api/chat';
import { createMountOptions, buildViewWithoutLifecycle } from './helpers';
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

describe('投稿の管理画面', () => {
  let originalPaginate;
  let originalManageDelete;

  beforeEach(() => {
    originalPaginate = chatApi.managementPaginate;
    originalManageDelete = chatApi.manageDelete;
  });

  afterEach(() => {
    chatApi.managementPaginate = originalPaginate;
    chatApi.manageDelete = originalManageDelete;
  });

  it('投稿検索をManagementListBaseで有効にする', () => {
    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const listBase = wrapper.findComponent({ name: 'ManagementListBase' });

    expect(listBase.props('searchEnabled')).to.equal(true);
    expect(listBase.props('payloadBuilder')).to.equal(wrapper.vm.buildSearchPayload);
    expect(listBase.props('tableLabel')).to.equal('managementUi.tableLabel');
  });

  it('投稿取得で管理APIを呼ぶ', async () => {
    const calls = [];
    chatApi.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [], page: 1, pages: 1, total: 0 } });
    };

    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const payload = wrapper.vm.buildSearchPayload({ page: 1, search: null });
    await wrapper.vm.fetchPost(payload);

    expect(calls[0]).to.deep.equal({ page: 1, search: null });
  });

  it('削除APIと一覧再取得が完了するまで送信状態と対象を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const calls = [];
    chatApi.manageDelete = (...args) => {
      calls.push(args);
      return mutation.promise;
    };

    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());
    let reloadCount = 0;
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
        return reload.promise;
      },
      showError: (...args) => showErrorCalls.push(args),
    });

    await wrapper.setData({
      dialogVisible: true,
      post: { _id: 'post1' },
      reply: { _id: 'reply1' },
      supplement: null,
      isDelete: true,
    });

    const operation = wrapper.vm.deleteValue();
    await wrapper.vm.$nextTick();

    expect(calls).to.deep.equal([[{ delete_flg: true, post_id: 'post1', reply_id: 'reply1' }]]);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.post._id).to.equal('post1');
    expect(wrapper.vm.reply._id).to.equal('reply1');
    expect(wrapper.vm.isDelete).to.equal(true);
    expect(reloadCount).to.equal(0);
    expect('progressAmount' in wrapper.vm.$data).to.equal(false);

    const lifecycleDialog = wrapper.findComponent({ name: 'ManagementLifecycleDialog' });
    expect(lifecycleDialog.props('sending')).to.equal(true);
    expect(lifecycleDialog.props('action')).to.equal('delete');

    wrapper.vm.clearDeleteValue();
    await wrapper.vm.deleteValue();
    expect(calls).to.have.lengthOf(1);
    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.post._id).to.equal('post1');

    mutation.resolve();
    await flushPromises();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.post._id).to.equal('post1');
    expect(wrapper.vm.reply._id).to.equal('reply1');

    reload.resolve();
    await operation;
    await wrapper.vm.$nextTick();

    expect(showErrorCalls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.post._id).to.equal('post1');
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.post).to.equal(null);
    expect(wrapper.vm.reply).to.equal(null);
    expect(wrapper.vm.supplement).to.equal(null);
    expect(wrapper.vm.isDelete).to.equal(false);
  });

  it('削除API失敗時は一覧を再取得せず対象を維持して再操作可能にする', async () => {
    const apiError = new Error('failed');
    chatApi.manageDelete = () => Promise.reject(apiError);

    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());
    let reloadCount = 0;
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
      },
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      dialogVisible: true,
      post: { _id: 'post1' },
      reply: null,
      supplement: null,
      isDelete: true,
    });

    await wrapper.vm.deleteValue();

    expect(reloadCount).to.equal(0);
    expect(showErrorCalls).to.deep.equal([['削除に失敗しました', apiError]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.post._id).to.equal('post1');
    expect(wrapper.vm.isDelete).to.equal(true);
  });

  it('復元API失敗時は復元操作に対応するエラーを表示する', async () => {
    const apiError = new Error('failed');
    chatApi.manageDelete = () => Promise.reject(apiError);

    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      dialogVisible: true,
      post: { _id: 'post1', delete_flg: true },
      reply: null,
      supplement: null,
      isDelete: false,
    });

    await wrapper.vm.deleteValue();

    expect(showErrorCalls).to.deep.equal([['復元に失敗しました', apiError]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.dialogVisible).to.equal(true);
  });

  it('一覧再取得失敗は削除失敗として表示せず処理終了後に対象をクリアする', async () => {
    chatApi.manageDelete = () => Promise.resolve();

    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => Promise.reject(new Error('reload failed')),
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      dialogVisible: true,
      post: { _id: 'post1' },
      reply: null,
      supplement: null,
      isDelete: true,
    });

    await wrapper.vm.deleteValue();

    expect(showErrorCalls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.post._id).to.equal('post1');
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.post).to.equal(null);
  });

  it('投稿・返信・付加情報を階層順に並べ、親が削除済みなら利用不可を示す', () => {
    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const postSupplement = { _id: 'post-supp', content: 'post supplement', delete_flg: false };
    const replySupplement = { _id: 'reply-supp', content: 'reply supplement', delete_flg: true };
    const reply = {
      _id: 'reply1',
      content: 'reply',
      delete_flg: false,
      supplementaries: [replySupplement],
    };
    const post = {
      _id: 'post1',
      content: 'post',
      delete_flg: true,
      replies: [reply],
      supplementaries: [postSupplement],
    };

    const rows = wrapper.vm.flattenPosts([post]);

    expect(rows.map((row) => row.item._id)).to.deep.equal([
      'post1',
      'reply1',
      'reply-supp',
      'post-supp',
    ]);
    expect(rows.map((row) => row.depth)).to.deep.equal([0, 1, 2, 1]);
    expect(rows.map((row) => row.parentUnavailable)).to.deep.equal([false, true, true, true]);
    expect(wrapper.vm.lifecycleActionUnavailable(rows[2])).to.equal(true);
    expect(wrapper.vm.lifecycleActionUnavailable(rows[1])).to.equal(false);

    wrapper.vm.showDeleteDialog(rows[2]);
    expect(wrapper.vm.selectedItem).to.equal(null);
  });

  it('親を利用できない状態は短いバッジと詳細理由を分けて表示する', () => {
    const post = {
      _id: 'post-deleted',
      content: 'deleted post',
      delete_flg: true,
      floor: { title: 'Floor' },
      room: { title: 'Room' },
      replies: [{ _id: 'reply-deleted', content: 'deleted reply', delete_flg: true }],
    };
    const ManagementListBaseStub = {
      name: 'ManagementListBase',
      setup(props, { slots }) {
        return () => h('div', slots.table?.({ items: [post], tableAttrs: {} }));
      },
    };
    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        stubs: { ManagementListBase: ManagementListBaseStub },
      })
    );

    const badgeLabels = wrapper
      .findAllComponents({ name: 'ManagementStatusBadge' })
      .map((badge) => badge.props('label'));
    expect(badgeLabels).to.contain('managementUi.statusUnavailable');
    expect(badgeLabels).not.to.contain('managementUi.postParentUnavailable');
    expect(wrapper.find('#post-management-unavailable-reply-deleted').text()).to.equal(
      'managementUi.postParentUnavailable'
    );
  });

  it('操作を開いた時点で現在状態の反対を削除または復元の対象にする', async () => {
    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const post = { _id: 'post1', content: 'post', delete_flg: true };

    wrapper.vm.showDeleteDialog({ post, reply: null, supplement: null });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.lifecycleAction).to.equal('restore');
    expect(wrapper.vm.selectedTypeLabel).to.equal('投稿');
    expect(wrapper.findComponent({ name: 'ManagementLifecycleDialog' }).props('action')).to.equal('restore');
  });

  it('添付メディアがある対象を削除するときだけ完全削除の警告を表示する', async () => {
    const View = buildViewWithoutLifecycle(PostManagement);
    const wrapper = shallowMount(View, createMountOptions());

    await wrapper.setData({
      post: { _id: 'post1', content: 'post', delete_flg: false, image_name: 'image.png' },
      isDelete: true,
      dialogVisible: true,
    });
    expect(wrapper.vm.lifecycleWarning).to.equal('managementUi.postMediaWarning');

    await wrapper.setData({ isDelete: false });
    expect(wrapper.vm.lifecycleWarning).to.equal('');
  });
});
