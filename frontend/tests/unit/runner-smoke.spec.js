import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';

const SmokeComponent = defineComponent({
  props: {
    message: {
      type: String,
      required: true,
    },
  },
  template: '<p data-testid="runner-smoke">{{ message }}</p>',
});

describe('VitestでのVue 3テストの基本動作', () => {
  it('Vue 3 コンポーネントをマウントできる', () => {
    const wrapper = mount(SmokeComponent, {
      props: { message: 'ready' },
    });

    expect(wrapper.get('[data-testid="runner-smoke"]').text()).toBe('ready');
    wrapper.unmount();
  });

  it('連続実行でもDOMとモックを共有しない', () => {
    expect(document.body.childElementCount).toBe(0);
    expect(vi.isMockFunction(window.setTimeout)).toBe(false);
  });
});
