import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import Help from '@/views/Help.vue';

const createWrapper = (overrides = {}) =>
  shallowMount(Help, {
    stubs: {
      BackButton: true,
      HelpContent: true,
    },
    mocks: {
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('ヘルプ画面', () => {
  it('画面見出しに共通view-titleを使用する', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('h1.view-title').exists()).to.equal(true);
  });

  it('ヘルプ共通本文を表示する', () => {
    const wrapper = createWrapper();

    expect(wrapper.findComponent({ name: 'HelpContent' }).exists()).to.equal(true);
    expect(wrapper.text()).to.include('ヘルプ及びショートカット一覧');
  });
});
