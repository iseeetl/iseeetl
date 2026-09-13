import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelinePostButtons from '@/components/timeline/core/TimelinePostButtons.vue';

const UiButtonStub = {
  name: 'UiButton',
  template: '<button @click="$emit(\'click\', $event)"><slot/></button>',
};
const UiIconStub = { name: 'UiIcon', template: '<i></i>' };
const UiTooltipStub = { name: 'UiTooltip', template: '<div><slot/></div>' };

const createWrapper = (overrides = {}) =>
  shallowMount(TimelinePostButtons, {
    stubs: {
      UiButton: UiButtonStub,
      UiIcon: UiIconStub,
      UiTooltip: UiTooltipStub,
    },
    props: {
      isGuestReactionOnly: false,
      defaultTagIds: ['t1'],
      ...(overrides.props || {}),
    },
    mocks: {
      $t: (key) => key,
    },
  });

describe('タイムラインの投稿ボタン', () => {
  it('流すボタンはshowEditPostDialogをアニメーション投稿で通知する', () => {
    const wrapper = createWrapper();
    wrapper.findAll('button')[0].trigger('click');

    const args = wrapper.emitted().showEditPostDialog[0];
    expect(args).to.deep.equal([null, true, ['t1']]);
  });

  it('投稿ボタンはshowEditPostDialogを通常投稿で通知する', () => {
    const wrapper = createWrapper();
    wrapper.findAll('button')[1].trigger('click');

    const args = wrapper.emitted().showEditPostDialog[0];
    expect(args).to.deep.equal([null, false, ['t1']]);
  });

  it('ゲストリアクションのみの場合は投稿ボタンを表示しない', () => {
    const wrapper = createWrapper({ props: { isGuestReactionOnly: true } });
    expect(wrapper.findAll('button').length).to.equal(1);
  });
});
