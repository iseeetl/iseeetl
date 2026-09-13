import { expect } from 'vitest';
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import { shallowMount } from '../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import ManagementListBase from '@/components/management/ManagementListBase.vue';


import flushPromises from '../../helpers/flushPromises';

const createRouter = () =>
  createVueRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Home', component: {} },
      { path: '/login', name: 'Login', component: {} },
    ],
  });

const createStoreMock = (overrides = {}) => ({
  getters: {
    userToken: null,
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const translate = (key, values = {}) =>
  Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), key);

const createMountOptions = (overrides = {}) => {
  const router = overrides.router || createRouter();
  return {
    stubs: {
      SearchField: true,
      Pager: true,
      UiSnackbar: true,
      ...(overrides.stubs || {}),
    },
    props: overrides.props || {},
    ...(overrides.realRouter ? { global: { plugins: [router] } } : { router }),
    mocks: {
      $store: overrides.store || createStoreMock(),
      $t: translate,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  };
};

describe('共通の管理一覧', () => {
  it('削除・復元後の候補を次、前の順で作り、候補がなければ見出しへフォーカスする', async () => {
    const wrapper = shallowMount(
      ManagementListBase,
      {
        ...createMountOptions({
          props: {
            title: 'test',
            fetcher: () => Promise.resolve({ data: { docs: [] } }),
            autoFetch: false,
          },
        }),
        attachTo: document.body,
      }
    );
    await wrapper.setData({ items: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }] });

    expect(wrapper.vm.createLifecycleFocusRequest('b')).to.deep.equal({
      candidateIds: ['c', 'a'],
    });

    const nextAction = document.createElement('button');
    nextAction.setAttribute('data-management-lifecycle-id', 'c');
    wrapper.element.append(nextAction);
    wrapper.vm.restoreLifecycleFocus({ candidateIds: ['c', 'a'] });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).to.equal(nextAction);

    nextAction.remove();
    wrapper.vm.restoreLifecycleFocus({ candidateIds: ['missing'] });
    await wrapper.vm.$nextTick();
    const heading = wrapper.get('h1.view-title');
    expect(heading.attributes('tabindex')).to.equal('-1');
    expect(document.activeElement).to.equal(heading.element);
    wrapper.unmount();
  });

  it('ヘッダ・操作・検索・絞り込みを順に表示し、取得状態をスロットへ渡す', () => {
    const options = createMountOptions({
      props: {
        title: 'test',
        fetcher: () => Promise.resolve({ data: { docs: [] } }),
        searchEnabled: true,
        autoFetch: false,
      },
      stubs: {
        SearchField: {
          name: 'SearchField',
          template: '<div data-testid="search-field-stub" />',
        },
      },
    });
    options.slots = {
      header: ({ fetching }) =>
        h('span', { 'data-testid': 'header-slot', 'data-fetching': String(fetching) }, 'header'),
      actions: ({ fetching }) =>
        h('span', { 'data-testid': 'actions-slot', 'data-fetching': String(fetching) }, 'actions'),
      filters: ({ fetching }) =>
        h('span', { 'data-testid': 'filters-slot', 'data-fetching': String(fetching) }, 'filters'),
    };
    const wrapper = shallowMount(ManagementListBase, options);

    expect(wrapper.get('[data-testid="header-slot"]').attributes('data-fetching')).to.equal('false');
    expect(wrapper.get('[data-testid="actions-slot"]').attributes('data-fetching')).to.equal('false');
    expect(wrapper.get('[data-testid="filters-slot"]').attributes('data-fetching')).to.equal('false');

    expect(wrapper.classes()).to.include('management-view');
    expect(wrapper.get('.management-page-actions').text()).to.equal('actions');
    const queryChildren = [...wrapper.get('.management-list-query').element.children];
    expect(
      queryChildren.map(
        (element) => element.dataset.testid || element.querySelector('[data-testid]')?.dataset.testid
      )
    ).to.deep.equal(['filters-slot', 'search-field-stub']);
    expect(wrapper.get('.management-list-query').classes()).to.include('management-list-query--with-filters');
  });

  it('fetchPageで一覧とページ情報を更新する', async () => {
    const calls = [];
    const fetcher = (payload) => {
      calls.push(payload);
      return Promise.resolve({
        data: { docs: [{ _id: 'item-1' }], page: 1, pages: 1, total: 1 },
      });
    };

    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher,
          searchEnabled: true,
          searchMinLength: 2,
          searchMaxLength: 10,
          autoFetch: false,
        },
      })
    );

    wrapper.setData({ search: 'draft', appliedSearch: 'keyword' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.fetchPage(1);
    await flushPromises();

    expect(calls[calls.length - 1]).to.deep.equal({ page: 1, search: 'keyword' });
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'item-1' }]);
    expect(wrapper.vm.current_page).to.equal(1);
    expect(wrapper.vm.last_page).to.equal(1);
    expect(wrapper.vm.total).to.equal(1);
  });

  it('fetchPageは後続リクエストの結果のみを反映する', async () => {
    const resolvers = [];
    const fetcher = (payload) =>
      new Promise((resolve) => {
        resolvers.push({ payload, resolve });
      });

    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher,
          autoFetch: false,
        },
      })
    );

    const first = wrapper.vm.fetchPage(1);
    const second = wrapper.vm.fetchPage(2);
    await flushPromises();

    expect(resolvers).to.have.lengthOf(2);
    resolvers[1].resolve({ data: { docs: [{ _id: 'new' }], page: 2, pages: 3, total: 1 } });
    await flushPromises();
    resolvers[0].resolve({ data: { docs: [{ _id: 'old' }], page: 1, pages: 3, total: 1 } });
    await Promise.all([first, second]);
    await flushPromises();

    expect(wrapper.vm.items).to.deep.equal([{ _id: 'new' }]);
    expect(wrapper.vm.current_page).to.equal(2);
    expect(wrapper.vm.fetching).to.equal(false);
  });

  it('searchEnabled=falseでは検索を含まないデータになる', () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: false,
          autoFetch: false,
        },
      })
    );

    wrapper.setData({ search: 'keyword' });

    expect(wrapper.vm.buildPayload(2)).to.deep.equal({ page: 2 });
  });

  it('searchEnabled=trueで空検索ならsearchはnullになる', () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: true,
          autoFetch: false,
        },
      })
    );

    wrapper.setData({ search: '' });

    expect(wrapper.vm.buildPayload(1)).to.deep.equal({ page: 1, search: null });
  });

  it('createdでクエリのページとqを取り込む', async () => {
    const router = createRouter();
    await router.push({ path: '/', query: { page: '2', q: 'hello' } });

    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: true,
          autoFetch: false,
        },
        router,
        realRouter: true,
      })
    );

    expect(wrapper.vm.current_page).to.equal(2);
    expect(wrapper.vm.search).to.equal('hello');
  });

  it('ルートクエリ変更でページングを更新する', async () => {
    const calls = [];
    const fetcher = (payload) => {
      calls.push(payload);
      return Promise.resolve({
        data: { docs: [], page: payload.page, pages: 3, total: 0 },
      });
    };

    const router = createRouter();
    await router.push({ path: '/', query: { page: '1', q: 'a' } });

    shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher,
          searchEnabled: true,
          autoFetch: true,
        },
        router,
        realRouter: true,
      })
    );

    await flushPromises();
    await router.push({ path: '/', query: { page: '2', q: 'b' } });
    await flushPromises();

    expect(calls).to.deep.equal([
      { page: 1, search: 'a' },
      { page: 2, search: 'b' },
    ]);
  });

  it('payloadBuilderが指定されていればその戻り値を使う', () => {
    const builderCalls = [];
    const payloadBuilder = (payload) => {
      builderCalls.push(payload);
      return { page: payload.page, q: payload.search };
    };

    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: true,
          payloadBuilder,
          autoFetch: false,
        },
      })
    );

    wrapper.setData({ search: 'draft', appliedSearch: 'kw' });

    expect(wrapper.vm.buildPayload(3)).to.deep.equal({ page: 3, q: 'kw' });
    expect(builderCalls[0]).to.deep.equal({ page: 3, search: 'kw' });
  });

  it('changePageは範囲内のみsyncRouteQueryを呼ぶ', () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          autoFetch: false,
        },
      })
    );

    const calls = [];
    wrapper.vm.syncRouteQuery = (page) => {
      calls.push(page);
    };

    wrapper.setData({ last_page: 3 });

    wrapper.vm.changePage(0);
    wrapper.vm.changePage(4);
    wrapper.vm.changePage(2);

    expect(calls).to.deep.equal([2]);
  });

  it('reloadは現在ページでfetchPageを呼ぶ', () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          autoFetch: false,
        },
      })
    );

    const calls = [];
    wrapper.vm.fetchPage = (page) => {
      calls.push(page);
    };

    wrapper.setData({ current_page: 2 });
    wrapper.vm.reload();

    expect(calls).to.deep.equal([2]);
  });

  it('reloadFromFirstPageは検索条件を保ったままURLを1ページ目へ戻して再取得する', async () => {
    const calls = [];
    const router = createRouter();
    await router.push({ path: '/', query: { page: '3', q: 'applied', keep: 'yes' } });
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: (payload) => {
            calls.push(payload);
            return Promise.resolve({ data: { docs: [], page: 1, pages: 1, total: 0 } });
          },
          searchEnabled: true,
          autoFetch: false,
        },
        router,
        realRouter: true,
      })
    );

    await wrapper.vm.reloadFromFirstPage();
    await flushPromises();

    expect(router.currentRoute.value.query).to.include({ page: '1', q: 'applied', keep: 'yes' });
    expect(calls).to.deep.equal([{ page: 1, search: 'applied' }]);
    expect(wrapper.vm.current_page).to.equal(1);
    expect(wrapper.vm.suppressNextRouteFetch).to.equal(false);
  });

  it('reloadFromFirstPageはURL遷移が拒否された場合に現在のページを再取得する', async () => {
    const calls = [];
    const router = createRouter();
    await router.push({ path: '/', query: { page: '3', q: 'applied' } });
    router.beforeEach((to) => (to.query.page === '1' ? false : true));
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: (payload) => {
            calls.push(payload);
            return Promise.resolve({ data: { docs: [], page: 3, pages: 3, total: 0 } });
          },
          searchEnabled: true,
          autoFetch: false,
        },
        router,
        realRouter: true,
      })
    );

    await wrapper.vm.reloadFromFirstPage();
    await flushPromises();

    expect(router.currentRoute.value.query).to.include({ page: '3', q: 'applied' });
    expect(calls).to.deep.equal([{ page: 3, search: 'applied' }]);
    expect(wrapper.vm.current_page).to.equal(3);
    expect(wrapper.vm.suppressNextRouteFetch).to.equal(false);
  });

  it('setItemsは配列以外を空配列にする', () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          autoFetch: false,
        },
      })
    );

    wrapper.setData({ items: [{ _id: 'a' }] });
    wrapper.vm.setItems('not-array');
    expect(wrapper.vm.items).to.deep.equal([]);

    wrapper.vm.setItems([{ _id: 'b' }]);
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'b' }]);
  });

  it('replaceItemは同じ_idを置換する', () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          autoFetch: false,
        },
      })
    );

    wrapper.setData({
      items: [
        { _id: 'a', name: 'old' },
        { _id: 'b', name: 'keep' },
      ],
    });
    wrapper.vm.replaceItem({ _id: 'a', name: 'new' });
    expect(wrapper.vm.items[0].name).to.equal('new');

    wrapper.vm.replaceItem({ name: 'no-id' });
    expect(wrapper.vm.items[1].name).to.equal('keep');
  });

  it('searchListはsearchEnabled=falseなら何もしない', () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: false,
          autoFetch: false,
        },
      })
    );

    const calls = [];
    wrapper.vm.syncRouteQuery = (page) => {
      calls.push(page);
    };

    wrapper.vm.searchList();

    expect(calls).to.deep.equal([]);
  });

  it('searchListはsearchEnabled=trueでルートを同期する', async () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: true,
          searchMinLength: 2,
          autoFetch: false,
        },
      })
    );

    const calls = [];
    wrapper.vm.syncRouteQuery = (page, search) => {
      calls.push({ page, search });
    };

    wrapper.setData({ search: 'keyword' });
    await wrapper.vm.$nextTick();

    wrapper.vm.searchList();
    await wrapper.vm.$nextTick();

    expect(calls).to.deep.equal([{ page: 1, search: 'keyword' }]);
    expect(wrapper.vm.v$.search.$dirty).to.equal(true);
  });

  it('検索の入力エラーを表示する条件を切り替える', async () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: true,
          searchMinLength: 2,
          searchMaxLength: 3,
          autoFetch: false,
        },
      })
    );

    wrapper.setData({ search: 'a' });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.showMinError).to.equal(true);
    expect(wrapper.vm.showMaxError).to.equal(false);

    wrapper.setData({ search: 'abcd' });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.showMinError).to.equal(false);
    expect(wrapper.vm.showMaxError).to.equal(true);
  });

  it('searchFieldClassMergedは呼び出し側のclassだけを維持する', async () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: true,
          searchMinLength: 2,
          searchFieldClass: 'base-class',
          autoFetch: false,
        },
      })
    );

    wrapper.setData({ search: 'a' });
    await wrapper.vm.$nextTick();
    wrapper.vm.v$.search.$touch();

    expect(wrapper.vm.searchFieldClassMerged).to.equal('base-class');
  });

  it('401エラーはログアウトしてログインへ遷移する', async () => {
    const dispatchCalls = [];
    const routerPushCalls = [];
    const router = createRouter();
    router.push = (payload) => {
      routerPushCalls.push(payload);
      return Promise.resolve();
    };

    const fetcher = () => Promise.reject({ response: { status: 401 } });

    shallowMount(
      ManagementListBase,
      createMountOptions({
        props: { title: 'test', fetcher },
        router,
        store: createStoreMock({
          dispatch: (action) => dispatchCalls.push(action),
        }),
      })
    );

    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
    expect(routerPushCalls).to.deep.equal([{ name: 'Login' }]);
  });

  it('showErrorはスナックバーにメッセージを設定する', async () => {
    const fetcher = () => Promise.resolve({ data: { docs: [], page: 1, pages: 1, total: 0 } });
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({ props: { title: 'test', fetcher, autoFetch: false } })
    );

    wrapper.vm.showError('取得に失敗しました', {
      response: { data: { error: { message: 'err' } } },
    });

    expect(wrapper.vm.snackbarMessage).to.include('取得に失敗しました');
  });

  it('管理操作の通知は既定で読み上げ優先度の高いalertを使い、呼出元で変更できる', async () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          autoFetch: false,
        },
      })
    );

    expect(wrapper.vm.resolvedSnackbarAttrs).to.deep.equal({
      role: 'alert',
      ariaLive: 'assertive',
      ariaAtomic: 'true',
    });

    await wrapper.setProps({
      snackbarAttrs: { role: 'status', ariaLive: 'polite', ariaAtomic: null },
    });

    expect(wrapper.vm.resolvedSnackbarAttrs).to.deep.equal({
      role: 'status',
      ariaLive: 'polite',
      ariaAtomic: null,
    });
  });

  it('table スロットへ画面固有ラベルとARIA属性を渡す', async () => {
    const options = createMountOptions({
      props: {
        title: 'ユーザー管理',
        tableLabel: '削除済みを含むユーザー一覧',
        fetcher: () => Promise.resolve({ data: { docs: [] } }),
        autoFetch: false,
      },
    });
    options.slots = {
      table: ({ tableLabel, tableAttrs }) =>
        h('table', {
          ...tableAttrs,
          'data-testid': 'labelled-management-table',
          'data-table-label': tableLabel,
        }),
    };
    const wrapper = shallowMount(ManagementListBase, options);

    await wrapper.setData({
      items: [{ _id: 'user-1' }],
      hasSuccessfulFetch: true,
      total: 1,
      current_page: 1,
      last_page: 1,
    });

    const table = wrapper.get('[data-testid="labelled-management-table"]');
    expect(table.attributes('aria-label')).to.equal('削除済みを含むユーザー一覧');
    expect(table.attributes('data-table-label')).to.equal('削除済みを含むユーザー一覧');
  });

  it('tableLabel未指定時は既存タイトルをtable ラベルとして使う', () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'フロア管理',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          autoFetch: false,
        },
      })
    );

    expect(wrapper.vm.resolvedTableLabel).to.equal('フロア管理');
    expect(wrapper.vm.tableAttrs).to.deep.equal({ 'aria-label': 'フロア管理' });
  });

  it('未取得・初回読込・取得済みの一覧と件数を区別する', async () => {
    let resolveFetch;
    const fetcher = () => new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: { title: 'test', fetcher, autoFetch: false },
        stubs: {
          SearchField: true,
          Pager: true,
          UiSnackbar: true,
        },
      })
    );

    expect(wrapper.find('[data-testid="management-list-empty"]').exists()).to.equal(false);
    const request = wrapper.vm.fetchPage(1);
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).to.equal('読み込み中です');
    expect(wrapper.attributes('aria-busy')).to.equal('true');
    expect(wrapper.find('[role="region"]').attributes('aria-busy')).to.equal('true');

    resolveFetch({ data: { docs: [{ _id: 'a' }], page: 1, pages: 2, total: 6 } });
    await request;
    await flushPromises();

    expect(wrapper.find('[role="status"]').exists()).to.equal(false);
    expect(wrapper.find('.management-list-summary').text()).to.contain('全6件');
    expect(wrapper.find('.management-list-summary').text()).to.contain('1 / 2ページ');
    expect(wrapper.attributes('aria-busy')).to.equal('false');
  });

  it('検索条件の有無に応じて0件の案内を切り替える', async () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [], page: 1, pages: 0, total: 0 } }),
          searchEnabled: true,
          autoFetch: false,
        },
      })
    );

    await wrapper.vm.fetchPage(1, { search: null });
    await flushPromises();
    expect(wrapper.find('[data-testid="management-list-empty"]').text()).to.equal('データがありません');
    expect(wrapper.findComponent({ name: 'Pager' }).exists()).to.equal(false);

    await wrapper.setData({ appliedSearch: 'missing' });
    await wrapper.vm.fetchPage(1, { search: 'missing' });
    await flushPromises();
    expect(wrapper.find('[data-testid="management-list-empty"]').text()).to.equal(
      '条件に一致するデータがありません'
    );
  });

  it('初回の取得失敗を一覧内に表示し、同じ条件で1回だけ再試行する', async () => {
    const calls = [];
    let succeed = false;
    const fetcher = (payload) => {
      calls.push(payload);
      if (!succeed) return Promise.reject({ response: { data: { error: { message: 'API error' } } } });
      return Promise.resolve({ data: { docs: [{ _id: 'ok' }], page: 2, pages: 2, total: 1 } });
    };
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher,
          errorMessage: '一覧取得失敗',
          searchEnabled: true,
          payloadBuilder: ({ page, search }) => ({ page, query: search, fixed: true }),
          autoFetch: false,
        },
      })
    );
    await wrapper.setData({ appliedSearch: 'applied' });

    await wrapper.vm.fetchPage(2);
    await flushPromises();
    expect(wrapper.find('.management-list-error [role="alert"]').text()).to.contain('一覧取得失敗');
    expect(wrapper.find('.management-list-error [role="alert"]').text()).to.contain('処理に失敗しました');
    expect(wrapper.find('.management-list-error [role="alert"]').text()).not.to.contain('API error');
    expect(wrapper.vm.snackbarVisible).to.equal(false);
    expect(wrapper.vm.hasSuccessfulFetch).to.equal(false);

    succeed = true;
    const retry = wrapper.vm.retryFetch();
    wrapper.vm.retryFetch();
    await retry;
    await flushPromises();
    expect(calls).to.deep.equal([
      { page: 2, query: 'applied', fixed: true },
      { page: 2, query: 'applied', fixed: true },
    ]);
    expect(wrapper.find('.management-list-error [role="alert"]').exists()).to.equal(false);
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'ok' }]);
  });

  it('errorMessage未指定時は現在の言語の既定エラーを表示する', async () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.reject(new Error('network')),
          autoFetch: false,
        },
        mocks: {
          $t: (key) => (key === '取得に失敗しました' ? 'Failed to retrieve data' : key),
        },
      })
    );

    await wrapper.vm.fetchPage(1);
    await flushPromises();

    expect(wrapper.vm.listErrorMessage).to.contain('Failed to retrieve data');
  });

  it('再取得中と再取得失敗で前回結果を維持し、次回成功でエラーを解除する', async () => {
    const requests = [];
    const fetcher = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({ props: { title: 'test', fetcher, autoFetch: false } })
    );

    const first = wrapper.vm.fetchPage(1);
    await flushPromises();
    requests[0].resolve({ data: { docs: [{ _id: 'old' }], page: 1, pages: 1, total: 1 } });
    await first;

    const refresh = wrapper.vm.reload();
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).to.equal('更新中です');
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'old' }]);
    requests[1].reject({ response: { data: { error: { message: 'refresh failed' } } } });
    await refresh;
    await flushPromises();
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'old' }]);
    expect(wrapper.find('.management-list-error').text()).to.contain(
      '前回取得した結果を表示しています'
    );

    const next = wrapper.vm.retryFetch();
    await flushPromises();
    requests[2].resolve({ data: { docs: [{ _id: 'new' }], page: 1, pages: 1, total: 1 } });
    await next;
    await flushPromises();
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'new' }]);
    expect(wrapper.find('.management-list-error').exists()).to.equal(false);
  });

  it('古いリクエストのsuccess・エラー・finallyを反映しない', async () => {
    const requests = [];
    const fetcher = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({ props: { title: 'test', fetcher, autoFetch: false } })
    );

    const first = wrapper.vm.fetchPage(1);
    const second = wrapper.vm.fetchPage(2);
    await flushPromises();
    requests[0].reject({ response: { data: { error: { message: 'stale error' } } } });
    await first;
    expect(wrapper.vm.fetching).to.equal(true);
    expect(wrapper.vm.listErrorMessage).to.equal('');

    requests[1].resolve({ data: { docs: [{ _id: 'latest' }], page: 2, pages: 2, total: 1 } });
    await second;
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'latest' }]);
    expect(wrapper.vm.fetching).to.equal(false);

    const staleSuccess = wrapper.vm.fetchPage(1);
    const latestFailure = wrapper.vm.fetchPage(2);
    await flushPromises();
    requests[3].reject({ response: { data: { error: { message: 'latest error' } } } });
    await latestFailure;
    requests[2].resolve({ data: { docs: [{ _id: 'stale' }], page: 1, pages: 2, total: 1 } });
    await staleSuccess;
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'latest' }]);
    expect(wrapper.vm.listErrorMessage).to.contain('処理に失敗しました');
    expect(wrapper.vm.listErrorMessage).not.to.contain('latest error');
  });

  it('最終ページを超えた指定をURLで補正し、1回だけ再取得する', async () => {
    const calls = [];
    const fetcher = ({ page, search }) => {
      calls.push({ page, search });
      return Promise.resolve({
        data: { docs: [{ _id: `page-${page}` }], page, pages: 2, total: 2 },
      });
    };
    const router = createRouter();
    await router.push({ path: '/', query: { page: '5', q: 'applied', keep: 'yes' } });
    const replaceCalls = [];
    const originalReplace = router.replace.bind(router);
    router.replace = (location) => {
      replaceCalls.push(location);
      return originalReplace(location);
    };
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: { title: 'test', fetcher, searchEnabled: true, autoFetch: false },
        router,
        realRouter: true,
      })
    );

    await wrapper.vm.fetchPage(5);
    await flushPromises();

    expect(calls).to.deep.equal([
      { page: 5, search: 'applied' },
      { page: 2, search: 'applied' },
    ]);
    expect(replaceCalls).to.have.lengthOf(1);
    expect(router.currentRoute.value.query).to.include({ page: '2', q: 'applied', keep: 'yes' });
    expect(wrapper.vm.current_page).to.equal(2);
  });

  it('ページだけの履歴変更では未送信の検索語を保持し、検索語の変更では入力と適用条件を同期する', async () => {
    const router = createRouter();
    await router.push({ path: '/', query: { page: '1', q: 'applied' } });
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: () => Promise.resolve({ data: { docs: [] } }),
          searchEnabled: true,
          autoFetch: false,
        },
        router,
        realRouter: true,
      })
    );
    await wrapper.setData({ search: 'draft' });

    await router.push({ path: '/', query: { page: '2', q: 'applied' } });
    await flushPromises();
    expect(wrapper.vm.search).to.equal('draft');
    expect(wrapper.vm.appliedSearch).to.equal('applied');
    expect(wrapper.vm.current_page).to.equal(2);

    await router.push({ path: '/', query: { page: '1', q: 'history' } });
    await flushPromises();
    expect(wrapper.vm.search).to.equal('history');
    expect(wrapper.vm.appliedSearch).to.equal('history');
  });

  it('検索入力が不正ならURL・適用値・ページ・リクエストを変更しない', async () => {
    const fetchCalls = [];
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: {
          title: 'test',
          fetcher: (payload) => {
            fetchCalls.push(payload);
            return Promise.resolve({ data: { docs: [] } });
          },
          searchEnabled: true,
          searchMinLength: 2,
          autoFetch: false,
        },
      })
    );
    const routeCalls = [];
    wrapper.vm.syncRouteQuery = (...args) => routeCalls.push(args);
    await wrapper.setData({ search: 'x', appliedSearch: 'old', current_page: 3 });

    wrapper.vm.searchList();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.v$.search.$invalid).to.equal(true);
    expect(wrapper.vm.appliedSearch).to.equal('old');
    expect(wrapper.vm.current_page).to.equal(3);
    expect(routeCalls).to.deep.equal([]);
    expect(fetchCalls).to.deep.equal([]);
  });

  it('reloadは現在ページと適用済み値のPromiseを返す', async () => {
    const expected = Promise.resolve('done');
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: { title: 'test', fetcher: () => Promise.resolve({ data: { docs: [] } }), autoFetch: false },
      })
    );
    const calls = [];
    wrapper.vm.fetchPage = (page, options) => {
      calls.push({ page, options });
      return expected;
    };
    await wrapper.setData({ current_page: 2, appliedSearch: 'applied', search: 'draft' });

    expect(wrapper.vm.reload()).to.equal(expected);
    expect(calls).to.deep.equal([{ page: 2, options: { search: 'applied' } }]);
  });

  it('setItemsとreplaceItemは取得状態とページ情報を維持する', async () => {
    const wrapper = shallowMount(
      ManagementListBase,
      createMountOptions({
        props: { title: 'test', fetcher: () => Promise.resolve({ data: { docs: [] } }), autoFetch: false },
      })
    );
    await wrapper.setData({
      items: [{ _id: 'a', name: 'old' }],
      current_page: 2,
      last_page: 4,
      total: 9,
      listErrorMessage: 'error',
      retryRequest: { page: 2 },
    });

    wrapper.vm.setItems([{ _id: 'a', name: 'set' }]);
    expect(wrapper.vm.hasSuccessfulFetch).to.equal(true);
    expect(wrapper.vm.listErrorMessage).to.equal('');
    expect(wrapper.vm.retryRequest).to.equal(null);
    expect([wrapper.vm.current_page, wrapper.vm.last_page, wrapper.vm.total]).to.deep.equal([2, 4, 9]);

    wrapper.vm.replaceItem({ _id: 'a', name: 'replaced' });
    expect(wrapper.vm.items).to.deep.equal([{ _id: 'a', name: 'replaced' }]);
    expect([wrapper.vm.current_page, wrapper.vm.last_page, wrapper.vm.total]).to.deep.equal([2, 4, 9]);
  });

  it('実SearchFieldとPagerからURL・適用済検索・取得を一貫して更新する', async () => {
    const calls = [];
    let deferClear = false;
    let resolveClear;
    const fetcher = (payload) => {
      calls.push(payload);
      if (deferClear && payload.search === null) {
        return new Promise((resolve) => {
          resolveClear = resolve;
        });
      }
      return Promise.resolve({ data: { docs: [{ _id: 'item' }], page: payload.page, pages: 3, total: 3 } });
    };
    const router = createRouter();
    await router.push({ path: '/', query: { page: '1', q: 'applied', keep: 'yes' } });
    const wrapper = mount(ManagementListBase, {
      attachTo: document.body,
      props: {
        title: 'test',
        fetcher,
        searchEnabled: true,
        resultRegionId: 'custom-results',
      },
      slots: {
        table: '<table data-testid="real-table"><tbody><tr><td>row</td></tr></tbody></table>',
      },
      global: {
        plugins: [router],
        mocks: { $store: createStoreMock(), $t: translate, $i18n: { locale: 'ja' } },
        stubs: { UiSnackbar: true },
      },
    });
    await flushPromises();

    const region = wrapper.find('#custom-results');
    expect(region.attributes('role')).to.equal('region');
    expect(wrapper.find('input').attributes('aria-controls')).to.equal('custom-results');
    wrapper.findComponent({ name: 'Pager' }).findAll('button').forEach((button) => {
      expect(button.attributes('aria-controls')).to.equal('custom-results');
    });

    await wrapper.find('input').setValue('draft');
    const pageTwo = wrapper.findComponent({ name: 'Pager' }).findAll('button').find((button) => button.text() === '2');
    await pageTwo.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).to.include({ page: '2', q: 'applied', keep: 'yes' });
    expect(calls.at(-1)).to.deep.equal({ page: 2, search: 'applied' });
    expect(wrapper.vm.search).to.equal('draft');

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.query).to.include({ page: '1', q: 'draft', keep: 'yes' });
    expect(calls.at(-1)).to.deep.equal({ page: 1, search: 'draft' });

    deferClear = true;
    await wrapper.find('[data-testid="management-search-clear"]').trigger('click');
    await flushPromises();
    expect(wrapper.vm.fetching).to.equal(true);
    const searchInput = wrapper.find('input').element;
    const focusSink = document.createElement('button');
    document.body.appendChild(focusSink);
    focusSink.focus();
    expect(document.activeElement).to.not.equal(searchInput);
    resolveClear({ data: { docs: [{ _id: 'item' }], page: 1, pages: 3, total: 3 } });
    await flushPromises();
    expect(router.currentRoute.value.query.page).to.equal('1');
    expect(router.currentRoute.value.query).to.not.have.property('q');
    expect(calls.at(-1)).to.deep.equal({ page: 1, search: null });
    expect(searchInput).to.equal(document.activeElement);
    focusSink.remove();
    wrapper.unmount();
  });
});
