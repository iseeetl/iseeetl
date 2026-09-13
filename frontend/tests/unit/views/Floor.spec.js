import { expect, vi } from 'vitest';
import { reactive } from 'vue';
import { setTestRoute, shallowMount } from '../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import Floor from '@/views/Floor.vue';
import floorApi from '@/api/floor';

const buildViewWithoutLifecycle = (view) => ({
  ...view,
  created() {},
  mounted() {},
  beforeUnmount() {},
});

const UpdateFloorDisplayConfirmStub = {
  name: 'UpdateFloorDisplayConfirm',
  props: {
    confirmVisible: Boolean,
    floorDisplayHidden: Boolean,
    sending: Boolean,
  },
  template: '<div />',
};

const baseStubs = {
  EditFloorDialog: true,
  DeleteFloorDialog: true,
  UpdateFloorDisplayConfirm: UpdateFloorDisplayConfirmStub,
  'router-link': true,
};

import flushPromises from '../helpers/flushPromises';

const buildFloorFixture = (id) => ({
  _id: id,
  image_name: null,
  floor_display_hidden: false,
  lang: 'ja',
  title: id,
  description: '',
  translations: [],
  user: { _id: 'u1', image_name: null, username: 'User' },
  created_at: '2026-07-11T00:00:00.000Z',
});


const createRouter = (overrides = {}) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/page/:page?', name: 'Floor', component: {} }],
  });
  const route = overrides.route || {};
  const params = route.params || {};
  const query = route.query || {};
  return setTestRoute(router, { name: 'Floor', params, query });
};

const createStoreMock = (overrides = {}) => {
  const getters = {
    userRole: 'Administrator',
    userIsLogin: true,
    userId: 'u1',
    ...(overrides.getters || {}),
  };
  const state = {
    user: {
      role: getters.userRole,
      isLogin: getters.userIsLogin,
      id: getters.userId,
    },
    ...(overrides.state || {}),
  };
  return {
    getters,
    state,
    dispatch: overrides.dispatch || (() => {}),
  };
};

const createWrapper = (overrides = {}) =>
  shallowMount(buildViewWithoutLifecycle(Floor), {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    router: overrides.router || createRouter({ route: overrides.route }),
    mocks: {
      $store: createStoreMock(overrides.store || {}),
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('フロア一覧画面', () => {
  it('全フロア表示確認へ送信状態を渡す', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({ sending: true, updateFloorDisplayVisible: true, floorDisplayHidden: false });

    expect(wrapper.findComponent(UpdateFloorDisplayConfirmStub).props()).to.include({
      confirmVisible: true,
      floorDisplayHidden: false,
      sending: true,
    });
  });

  it('フロアカードを内容に合うHTML要素で表示する', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({ floors: [buildFloorFixture('floor-1')] });

    expect(wrapper.find('article.floor-card').exists()).to.equal(true);
    expect(wrapper.find('figure.floor-card__media').exists()).to.equal(true);
    expect(wrapper.find('section.floor-card__content').exists()).to.equal(true);
    expect(wrapper.find('footer.floor-card__actions').exists()).to.equal(true);
    expect(wrapper.get('.floor-card__link').attributes('id')).to.equal('floor-1');
  });

  it('表示中の本人作成フロアへ最新プロフィール名と画像削除を即時反映する', async () => {
    const profile = reactive({ name: '旧名', imageName: 'old.png' });
    const wrapper = createWrapper({
      store: {
        getters: {
          resolveUserDisplayName: (user) => (user?._id === 'u1' ? profile.name : user?.username),
          resolveUserDisplayImageName: (user) =>
            user?._id === 'u1' ? profile.imageName : user?.image_name,
        },
      },
    });
    await wrapper.setData({ floors: [buildFloorFixture('floor-1')] });

    expect(wrapper.get('.floor-created').text()).to.contain('旧名');
    expect(wrapper.get('.floor-created img').attributes('src')).to.equal('/profile/u1/old.png');

    profile.name = '新名';
    profile.imageName = null;
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.floor-created').text()).to.contain('新名');
    expect(wrapper.find('.floor-created img').exists()).to.equal(false);
  });

  it('作成ボタンと編集・削除ダイアログへ用途別の文言と翻訳済み対象名を渡す', async () => {
    const wrapper = createWrapper();
    const floor = buildFloorFixture('floor-1');
    floor.lang = 'en';
    floor.translations = [{ lang: 'ja', title: '翻訳済みフロア', description: '' }];
    await wrapper.setData({
      floors: [floor],
      editFloorDialogVisible: true,
      editFloorValue: floor,
      deleteFloorDialogVisible: true,
      deleteFloorValue: floor,
    });

    expect(wrapper.get('[data-testid="floor-list-create-button"]').text()).to.equal('フロア作成');
    expect(wrapper.findComponent({ name: 'EditFloorDialog' }).props('targetName')).to.equal('翻訳済みフロア');
    expect(wrapper.findComponent({ name: 'DeleteFloorDialog' }).props('targetName')).to.equal('翻訳済みフロア');
  });

  it('検索欄は入力前にエラーを出さず、入力後だけ文字数エラーを返す', async () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.searchError).to.equal('');
    await wrapper.setData({ search: 'a'.repeat(101) });
    wrapper.vm.v$.search.$touch();

    expect(wrapper.vm.searchError).to.equal('100文字以内です');
  });

  it('翻訳がある場合はタイトルと説明に反映する', () => {
    const wrapper = createWrapper();
    const floor = {
      lang: 'en',
      title: 'Title',
      description: 'Desc',
      translations: [{ lang: 'ja', title: '日本語', description: '説明' }],
    };

    expect(wrapper.vm.getFloorTitle(floor)).to.equal('日本語');
    expect(wrapper.vm.getFloorDescription(floor)).to.equal('説明');
  });

  it('検索クエリ付きのページリンクを生成する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ search: 'hello' });
    expect(wrapper.vm.generatePageLink(2)).to.equal('/page/2?q=hello');
  });

  it('不正なページ番号は検索条件を維持して1ページ目へ正規化する', () => {
    const replaceCalls = [];
    const router = createRouter({ route: { params: { page: '2' }, query: { q: 'test' } } });
    router.replace = (route) => replaceCalls.push(route);
    const wrapper = createWrapper({ router });
    let fetchCalls = 0;
    wrapper.vm.fetchFloor = () => {
      fetchCalls += 1;
    };

    wrapper.vm.syncFloorRoute({ params: { page: '0' }, query: { q: 'test' } });

    expect(replaceCalls[0]).to.deep.equal({ path: '/page/1', query: { q: 'test' } });
    expect(fetchCalls).to.equal(0);
    expect(wrapper.vm.normalizePageParam('foo')).to.equal(1);
    expect(wrapper.vm.normalizePageParam('-1')).to.equal(1);
    expect(wrapper.vm.normalizePageParam('1.5')).to.equal(1);
  });

  it('フロアの管理操作は管理者または作成者本人のフロア編集ユーザだけに許可する', () => {
    const floor = { user: { _id: 'u1' } };
    const administrator = createWrapper({
      store: { getters: { userRole: 'Administrator', userIsLogin: true, userId: 'admin' } },
    });
    const editor = createWrapper({
      store: { getters: { userRole: 'Editor', userIsLogin: true, userId: 'u1' } },
    });
    const author = createWrapper({
      store: { getters: { userRole: 'Author', userIsLogin: true, userId: 'u1' } },
    });

    expect(administrator.vm.canManageFloor(floor)).to.equal(true);
    expect(editor.vm.canManageFloor(floor)).to.equal(true);
    expect(author.vm.canManageFloor(floor)).to.equal(false);
  });

  it('編集・削除成功時は検索条件を維持してURLも1ページ目へ戻す', async () => {
    const replaceCalls = [];
    const router = createRouter({ route: { params: { page: '2' }, query: { q: 'test' } } });
    router.replace = (route) => replaceCalls.push(route);
    const wrapper = createWrapper({ router });
    await wrapper.setData({ currentPage: 2, editFloorDialogVisible: true, deleteFloorDialogVisible: true });

    wrapper.vm.successEditFloor();
    wrapper.vm.successDeleteFloor();

    expect(replaceCalls).to.deep.equal([
      { path: '/page/1', query: { q: 'test' } },
      { path: '/page/1', query: { q: 'test' } },
    ]);
    expect(wrapper.vm.editFloorDialogVisible).to.equal(false);
    expect(wrapper.vm.deleteFloorDialogVisible).to.equal(false);
  });

  it('削除成功後も対象を実際のcloseまで保持し、一覧更新後に次のフロアへフォーカスする', async () => {
    const wrapper = createWrapper();
    const floors = ['floor-1', 'floor-2', 'floor-3'].map(buildFloorFixture);
    const nextFloorLink = document.createElement('a');
    nextFloorLink.id = 'floor-3';
    document.body.appendChild(nextFloorLink);
    const focus = vi.spyOn(nextFloorLink, 'focus');
    wrapper.vm.refreshFirstPage = vi.fn();
    await wrapper.setData({
      floors,
      deleteFloorDialogVisible: true,
      deleteFloorValue: floors[1],
    });

    wrapper.vm.successDeleteFloor();

    expect(wrapper.vm.deleteFloorDialogVisible).to.equal(false);
    expect(wrapper.vm.deleteFloorValue).to.deep.equal(floors[1]);
    expect(wrapper.vm.deleteFloorFocusRequest.candidateIds).to.deep.equal(['floor-3', 'floor-1']);
    wrapper.vm.markDeleteFloorListReady();
    expect(focus).not.toHaveBeenCalled();

    wrapper.vm.closeDeleteFloor();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.deleteFloorValue).to.equal(null);
    expect(wrapper.vm.deleteFloorFocusRequest).to.equal(null);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    nextFloorLink.remove();
  });

  it('削除後に隣接フロアがなければ作成操作へフォーカスする', async () => {
    const wrapper = createWrapper();
    const floor = buildFloorFixture('floor-1');
    const createButton = document.createElement('button');
    createButton.dataset.testid = 'floor-list-create-button';
    document.body.appendChild(createButton);
    const focus = vi.spyOn(createButton, 'focus');
    wrapper.vm.refreshFirstPage = vi.fn();
    await wrapper.setData({
      floors: [floor],
      deleteFloorDialogVisible: true,
      deleteFloorValue: floor,
    });

    wrapper.vm.successDeleteFloor();
    wrapper.vm.closeDeleteFloor();
    wrapper.vm.markDeleteFloorListReady();
    await wrapper.vm.$nextTick();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    createButton.remove();
  });

  it('検索文字が空ならページ1へ戻す', () => {
    const replaceCalls = [];
    const router = createRouter({ route: { params: { page: '1' }, query: {} } });
    router.replace = (route) => replaceCalls.push(route);
    const wrapper = createWrapper({
      router,
    });

    wrapper.setData({ search: '' });
    wrapper.vm.handleSearch();

    expect(replaceCalls[0]).to.deep.equal({ path: '/page/1' });
  });

  it('検索文字がある場合はクエリ付きでページ1へ遷移する', () => {
    const replaceCalls = [];
    const router = createRouter({ route: { params: { page: '2' }, query: { q: 'old' } } });
    router.replace = (route) => replaceCalls.push(route);
    const wrapper = createWrapper({
      router,
    });

    wrapper.setData({ search: 'new' });
    wrapper.vm.handleSearch();

    expect(replaceCalls[0]).to.deep.equal({ path: '/page/1', query: { q: 'new' } });
  });

  it('fetchFloor は401時にログアウトしてログイン画面へ遷移する', async () => {
    const originalPaginate = floorApi.paginate;
    floorApi.paginate = () =>
      Promise.reject({
        response: { status: 401 },
      });

    const dispatchCalls = [];
    const pushCalls = [];
    const router = createRouter({ route: { params: { page: '1' }, query: {} } });
    router.push = (route) => pushCalls.push(route);
    const wrapper = createWrapper({
      store: {
        getters: { userRole: 'Administrator', userIsLogin: true, userId: 'u1' },
        dispatch: (type) => dispatchCalls.push(type),
      },
      router,
    });

    wrapper.vm.setSnackbar = () => {};
    await wrapper.vm.fetchFloor(1);
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls[0]).to.deep.equal({ name: 'Login' });

    floorApi.paginate = originalPaginate;
  });

  it('fetchFloor は後続リクエストの結果のみを反映する', async () => {
    const originalPaginate = floorApi.paginate;
    const requests = [];
    floorApi.paginate = (payload) =>
      new Promise((resolve) => {
        requests.push({ payload, resolve });
      });

    const wrapper = createWrapper();
    wrapper.vm.setSnackbar = () => {};

    const first = wrapper.vm.fetchFloor(1);
    wrapper.setData({ search: 'new' });
    await wrapper.vm.$nextTick();
    const second = wrapper.vm.fetchFloor(2);
    const newFloor = buildFloorFixture('new');
    const oldFloor = buildFloorFixture('old');

    expect(requests).to.have.lengthOf(2);
    requests[1].resolve({ data: { docs: [newFloor], page: 2, pages: 2, total: 1 } });
    await flushPromises();
    requests[0].resolve({ data: { docs: [oldFloor], page: 1, pages: 2, total: 1 } });
    await Promise.all([first, second]);
    await flushPromises();

    expect(wrapper.vm.floors).to.deep.equal([newFloor]);
    expect(wrapper.vm.currentPage).to.equal(2);
    expect(wrapper.vm.sending).to.equal(false);

    floorApi.paginate = originalPaginate;
  });

  it('updateFloorDisplay は全表示成功時に表示文言を通知し、一覧を更新して閉じる', async () => {
    const originalUpdate = floorApi.updateDisplayHidden;
    floorApi.updateDisplayHidden = () => Promise.resolve();

    const snackbarCalls = [];
    const wrapper = createWrapper();
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    await wrapper.setData({ updateFloorDisplayVisible: true });
    wrapper.vm.fetchFloor = () => {};

    await wrapper.vm.updateFloorDisplay(false);
    await flushPromises();

    expect(snackbarCalls[0]).to.deep.equal({ message: '全フロアを表示に変更しました', role: 'status' });
    expect(wrapper.vm.updateFloorDisplayVisible).to.equal(false);

    floorApi.updateDisplayHidden = originalUpdate;
  });

  it('updateFloorDisplay は失敗時にエラーメッセージを表示する', async () => {
    const originalUpdate = floorApi.updateDisplayHidden;
    floorApi.updateDisplayHidden = () => Promise.reject(new Error('fail'));

    const snackbarCalls = [];
    const wrapper = createWrapper();
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    await wrapper.setData({ updateFloorDisplayVisible: true });

    await wrapper.vm.updateFloorDisplay(false);
    await flushPromises();

    expect(snackbarCalls[0].role).to.equal('alert');
    expect(snackbarCalls[0].message).to.include('全フロアの表示変更に失敗しました');
    expect(wrapper.vm.updateFloorDisplayVisible).to.equal(true);

    floorApi.updateDisplayHidden = originalUpdate;
  });

  it('updateFloorDisplay は401時にログアウトしてログイン画面へ遷移する', async () => {
    const originalUpdate = floorApi.updateDisplayHidden;
    floorApi.updateDisplayHidden = () => Promise.reject({ response: { status: 401 } });

    const dispatchCalls = [];
    const pushCalls = [];
    const router = createRouter();
    router.push = (route) => pushCalls.push(route);
    const wrapper = createWrapper({
      store: {
        getters: { userRole: 'Administrator', userIsLogin: true, userId: 'u1' },
        dispatch: (type) => dispatchCalls.push(type),
      },
      router,
    });
    wrapper.vm.setSnackbar = () => {};

    await wrapper.vm.updateFloorDisplay(true);
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls.some((call) => call.name === 'Login')).to.equal(true);

    floorApi.updateDisplayHidden = originalUpdate;
  });
});
