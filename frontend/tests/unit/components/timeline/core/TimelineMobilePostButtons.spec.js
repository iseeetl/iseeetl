import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineMobilePostButtons from '@/components/timeline/core/TimelineMobilePostButtons.vue';

const UiButtonStub = {
  name: 'UiButton',
  template: '<button @click="$emit(\'click\', $event)"><slot/></button>',
};
const UiIconStub = { name: 'UiIcon', template: '<i></i>' };

const createWrapper = (overrides = {}) => {
  const calls = [];
  const onShowEditPostDialog = (...args) => calls.push(args);

  const wrapper = shallowMount(TimelineMobilePostButtons, {
    stubs: {
      UiButton: UiButtonStub,
      UiIcon: UiIconStub,
    },
    props: {
      isGuestReactionOnly: false,
      defaultTagIds: ['t1'],
      onShowEditPostDialog,
      ...(overrides.props || {}),
    },
    mocks: {
      $t: (key) => key,
    },
  });

  return { wrapper, calls };
};

describe('スマートフォンの投稿ボタン', () => {
  it('流すボタンで投稿ダイアログをアニメーション投稿として呼ぶ', () => {
    const { wrapper, calls } = createWrapper();
    wrapper.findAll('button')[0].trigger('click');

    expect(calls[0]).to.deep.equal([null, true, ['t1']]);
  });

  it('投稿ボタンで通常投稿として呼ぶ', () => {
    const { wrapper, calls } = createWrapper();
    wrapper.findAll('button')[1].trigger('click');

    expect(calls[0]).to.deep.equal([null, false, ['t1']]);
  });

  it('ゲストリアクションのみの場合は投稿ボタンを表示しない', () => {
    const { wrapper } = createWrapper({ props: { isGuestReactionOnly: true } });
    expect(wrapper.findAll('button').length).to.equal(1);
  });
});
