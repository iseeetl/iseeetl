import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineParticipantCount from '@/components/timeline/core/TimelineParticipantCount.vue';

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineParticipantCount, {
    stubs: {
      UiIcon: true,
    },
    props: {
      participantCount: null,
      ...(overrides.props || {}),
    },
    mocks: {
      $t: (key, params) => {
        if (!params) return key;
        return key.replace('{count}', params.count);
      },
      ...(overrides.mocks || {}),
    },
  });

describe('タイムラインの参加者数', () => {
  it('participantCountが無い場合は参加者数を表示しない', () => {
    const wrapper = createWrapper({ props: { participantCount: null } });
    expect(wrapper.text()).to.not.contain('参加者');
  });

  it('participantCountがある場合は参加者数を表示する', () => {
    const wrapper = createWrapper({ props: { participantCount: 3 } });
    expect(wrapper.text()).to.contain('3人の参加者');
  });

  it('参加者数の変動をライブリージョンとして自動通知しない', () => {
    const wrapper = createWrapper({ props: { participantCount: 3 } });
    const clients = wrapper.find('.clients');

    expect(clients.attributes('aria-live')).to.equal(undefined);
  });
});
