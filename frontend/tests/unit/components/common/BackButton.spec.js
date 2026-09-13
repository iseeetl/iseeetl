import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import BackButton from '@/components/common/BackButton.vue';

const wrappers = [];
const factory = async (props = {}, initial = '/privacy') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Floor', component: {} },
      { path: '/help', name: 'Help', component: {} },
      { path: '/privacy', name: 'Privacy', component: {} },
      { path: '/login', name: 'Login', component: {} },
    ],
  });
  await router.push(initial);
  const wrapper = mount(BackButton, {
    props,
    global: {
      plugins: [router],
      mocks: { $t: (key) => key },
      stubs: {
        UiButton: { template: '<button><slot /></button>' },
        UiTooltip: { props: ['text'], template: '<span :title="text"><slot /></span>' },
        UiIcon: true,
      },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, router };
};

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe('画面で指定した戻り先への移動', () => {
  it('直接開いた画面にも戻るボタンを表示し、フロア一覧へ移動する', async () => {
    const { wrapper, router } = await factory();
    expect(wrapper.get('button').attributes('aria-label')).toBe('フロア一覧へ戻る');
    expect(wrapper.get('span').attributes('title')).toBe('フロア一覧へ戻る');
    await wrapper.vm.onClickBackButton();
    expect(router.currentRoute.value.name).toBe('Floor');
  });

  it('ヘルプからプライバシーを開いてもフロア一覧へ戻る', async () => {
    const { wrapper, router } = await factory({}, '/');
    await router.push('/help');
    await router.push('/privacy');
    await wrapper.vm.onClickBackButton();
    expect(router.currentRoute.value.name).toBe('Floor');
  });

  it('指定した画面と入室先を使い、遷移完了後に復帰処理を呼ぶ', async () => {
    const afterNavigate = vi.fn();
    const { wrapper, router } = await factory({
      to: { name: 'Login', query: { floor_id: 'f1', room_id: 'r1' } },
      label: 'ログインページへ戻る',
      afterNavigate,
    });
    afterNavigate.mockImplementation(() => expect(router.currentRoute.value.name).toBe('Login'));
    await wrapper.vm.onClickBackButton();
    expect(router.currentRoute.value.query).toEqual({ floor_id: 'f1', room_id: 'r1' });
    expect(afterNavigate).toHaveBeenCalledOnce();
    expect(wrapper.get('button').attributes('aria-label')).toBe('ログインページへ戻る');
  });

  it('同じ戻り先を再度選んでも復帰処理を呼ぶ', async () => {
    const afterNavigate = vi.fn();
    const { wrapper } = await factory({ afterNavigate }, '/');
    await wrapper.vm.onClickBackButton();
    expect(afterNavigate).toHaveBeenCalledOnce();
  });

  it('遷移を取り消した場合は復帰処理を呼ばない', async () => {
    const afterNavigate = vi.fn();
    const { wrapper, router } = await factory({ afterNavigate });
    router.beforeEach(() => false);
    await wrapper.vm.onClickBackButton();
    expect(router.currentRoute.value.name).toBe('Privacy');
    expect(afterNavigate).not.toHaveBeenCalled();
  });

  it('遷移中にボタンが破棄されても復帰処理を完了する', async () => {
    const afterNavigate = vi.fn();
    const { wrapper, router } = await factory({ afterNavigate });
    router.afterEach(() => wrapper.unmount());
    await wrapper.vm.onClickBackButton();
    expect(afterNavigate).toHaveBeenCalledOnce();
  });
});
