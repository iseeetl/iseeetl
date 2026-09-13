import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from '@/App.vue';
import BackButton from '@/components/common/BackButton.vue';
import ChangePassword from '@/views/ChangePassword.vue';
import SendResetPasswordLink from '@/views/SendResetPasswordLink.vue';

const wrappers = [];
const View = { template: '<div />' };
const factory = async (initial = '/floor/f1?search=sample') => {
  const state = reactive({ user: { isLogin: true, imageName: null } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Floor', component: View },
      { path: '/floor/:floor_id', name: 'Room', component: View },
      { path: '/login', name: 'Login', component: View },
      { path: '/changepassword', name: 'ChangePassword', component: ChangePassword },
      { path: '/user/sendresetpasswordlink', name: 'SendResetPasswordLink', component: SendResetPasswordLink },
    ],
  });
  await router.push(initial);
  const wrapper = mount(App, {
    global: {
      plugins: [router],
      mocks: {
        $i18n: { locale: 'ja' },
        $t: (key) => key,
        $store: {
          state,
          getters: { lang: 'ja', mailDeliveryAvailable: true, get userIsLogin() { return state.user.isLogin; } },
          dispatch: vi.fn(() => Promise.resolve()),
        },
      },
      stubs: {
        AppMenu: true,
        GuestProfileDialog: true,
        HelpDialog: true,
        UiAvatar: true,
        UiIcon: true,
        UiSnackbar: true,
        UiField: true,
        UiButton: { template: '<button><slot /></button>' },
        UiTooltip: { template: '<span><slot /></span>' },
        ProfileDialog: {
          props: ['dialogVisible'],
          emits: ['change-password', 'close'],
          template: '<div v-if="dialogVisible" data-testid="profile"><button data-testid="change-password" @click="$emit(\'change-password\'); $emit(\'close\')">変更</button></div>',
        },
      },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router, state };
};

const startPasswordChange = async (wrapper) => {
  await wrapper.get('[data-testid="app-profile-button"]').trigger('click');
  await wrapper.get('[data-testid="change-password"]').trigger('click');
  await flushPromises();
};
const back = async (wrapper) => {
  await wrapper.getComponent(BackButton).get('button').trigger('click');
  await flushPromises();
};

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe('パスワード変更からプロフィールへの復帰', () => {
  it.each(['/floor/f1?search=sample', '/user/sendresetpasswordlink'])(
    '再設定リンク送信との往復後も最初の画面 %s でプロフィールを開く', async (origin) => {
      const { wrapper, router } = await factory(origin);
      await startPasswordChange(wrapper);
      expect(router.currentRoute.value.name).toBe('ChangePassword');
      await wrapper.get('a.text-link').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('SendResetPasswordLink');
      await back(wrapper);
      expect(router.currentRoute.value.name).toBe('ChangePassword');
      await back(wrapper);
      expect(router.currentRoute.value.fullPath).toBe(origin);
      expect(wrapper.find('[data-testid="profile"]').exists()).toBe(true);
    }
  );

  it('直接開いたパスワード変更からはフロア一覧でプロフィールを開く', async () => {
    const { wrapper, router } = await factory('/changepassword');
    await back(wrapper);
    expect(router.currentRoute.value.name).toBe('Floor');
    expect(wrapper.find('[data-testid="profile"]').exists()).toBe(true);
  });

  it('戻る遷移が中止された場合はプロフィールを開かない', async () => {
    const { wrapper, router } = await factory();
    await startPasswordChange(wrapper);
    router.beforeEach((to) => to.name !== 'Room');
    await back(wrapper);
    expect(router.currentRoute.value.name).toBe('ChangePassword');
    expect(wrapper.find('[data-testid="profile"]').exists()).toBe(false);
  });

  it('途中で別の画面に移動した後は新しい開始元へ戻る', async () => {
    const { wrapper, router } = await factory();
    await startPasswordChange(wrapper);
    await router.push('/floor/f2');
    await startPasswordChange(wrapper);
    await back(wrapper);
    expect(router.currentRoute.value.path).toBe('/floor/f2');
    expect(wrapper.find('[data-testid="profile"]').exists()).toBe(true);
  });

  it('ログアウトした場合は開始元を破棄し、プロフィールを再表示しない', async () => {
    const { wrapper, state } = await factory();
    await startPasswordChange(wrapper);
    state.user.isLogin = false;
    await flushPromises();
    await back(wrapper);
    expect(wrapper.find('[data-testid="profile"]').exists()).toBe(false);
    expect(wrapper.vm.passwordChangeOrigin).toBeNull();
  });
});
