import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineHeader from '@/components/timeline/core/TimelineHeader.vue';


const UiButtonStub = {
  name: 'UiButton',
  template:
    '<button v-bind="$attrs"><slot/></button>',
};
const UiIconStub = { name: 'UiIcon', template: '<i></i>' };
const UiTooltipStub = {
  name: 'UiTooltip',
  props: ['text'],
  template: '<span><slot/></span>',
  data: () => ({ lastFocusOptions: null }),
  methods: {
    focusTrigger(options) {
      this.lastFocusOptions = options;
    },
  },
};

const createStoreMock = (overrides = {}) => {
  const dispatchCalls = [];
  const store = {
    getters: {
      floorId: 'floor-1',
      ...(overrides.getters || {}),
    },
    dispatch(type, payload) {
      dispatchCalls.push({ type, payload });
      if (typeof overrides.dispatch === 'function') return overrides.dispatch(type, payload);
      return Promise.resolve();
    },
  };
  return { store, dispatchCalls };
};

const createRouterMock = (pushImpl) => {
  const pushCalls = [];
  return {
    pushCalls,
    router: {
      push(payload) {
        pushCalls.push(payload);
        if (typeof pushImpl === 'function') return pushImpl(payload);
        return Promise.resolve();
      },
    },
  };
};

const createWrapper = (overrides = {}) => {
  const { store, dispatchCalls } = createStoreMock(overrides.store || {});
  const { router, pushCalls } = createRouterMock(overrides.routerPush);
  const route = overrides.route || { fullPath: '/timeline/current' };

  const wrapper = shallowMount(TimelineHeader, {
    stubs: {
      UiButton: UiButtonStub,
      UiIcon: UiIconStub,
      UiTooltip: UiTooltipStub,
      TimelineParticipantCount: true,
    },
    props: {
      roomTitle: 'Room',
      roomImageUrl: null,
      isMemberOnly: false,
      isRoomMember: false,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: store,
      $router: router,
      $route: route,
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

  Object.defineProperty(wrapper.vm, '$store', { value: store, configurable: true });
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  Object.defineProperty(wrapper.vm, '$route', { value: route, configurable: true });

  return { wrapper, dispatchCalls, pushCalls };
};

describe('タイムラインのヘッダ', () => {
  it('roomStatusがnullでもヘッダを描画できる', () => {
    const { wrapper } = createWrapper({ props: { roomStatus: null } });

    expect(wrapper.exists()).to.equal(true);
  });

  it.each(['TimeLine', 'TimeLinePostDetail'])('%s はURLの所属フロアのルーム一覧へ戻る', (name) => {
    const { wrapper, dispatchCalls, pushCalls } = createWrapper({
      route: { name, params: { floor_id: 'current-floor' } },
      store: { getters: { floorId: 'old-floor' } },
    });
    wrapper.vm.returnToRoomList();
    expect(pushCalls).to.deep.equal([{ name: 'Room', params: { floor_id: 'current-floor' } }]);
    expect(dispatchCalls).to.deep.equal([]);
  });

  it('所属フロアを取得できない場合はフロア一覧へ戻る', () => {
    const { wrapper, pushCalls } = createWrapper({ route: { params: {} } });
    wrapper.vm.returnToRoomList();
    expect(pushCalls).to.deep.equal([{ name: 'Floor' }]);
  });

  it('音タグボタンへの復帰はツールチップを表示せずフォーカスする', () => {
    const { wrapper } = createWrapper();

    wrapper.vm.focusSoundTagButton();
    expect(wrapper.vm.$refs.soundTagButtonTooltip.lastFocusOptions).to.deep.equal({ showTooltip: false });
  });

  it('ヘッダに招待・メンバー一覧を表示せず、ルームメンバー本人の脱退操作を表示する', () => {
    const { wrapper } = createWrapper({
      props: { isMemberOnly: true, isRoomMember: true },
    });

    expect(wrapper.find('[data-testid="timeline-invite-member-button"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="timeline-room-member-button"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="timeline-leave-room-button"]').exists()).to.equal(true);
  });
});
