import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import LineLoginButton from '@/components/login/LineLoginButton.vue';

const createWrapper = (overrides = {}) =>
  shallowMount(LineLoginButton, {
    props: { lang: 'en', expectedOrigin: 'http://example.com', ...(overrides.props || {}) },
    mocks: { $t: (key) => key, ...(overrides.mocks || {}) },
  });

describe('LINEログインボタン', () => {
  let originalOpen;

  beforeEach(() => {
    originalOpen = window.open;
  });

  afterEach(() => {
    window.open = originalOpen;
  });

  it('openPopup は認証 URL を window.open で開き floor_id/room_id を付与する', () => {
    const openCalls = [];

    window.open = (url) => {
      openCalls.push(url);
      return { closed: false };
    };

    const wrapper = createWrapper({
      props: { authorizePath: '/api/auth/line/authorize', floorId: 'floor-1', roomId: 'room-1' },
    });
    wrapper.vm.openPopup();

    expect(openCalls[0]).to.include('/api/auth/line/authorize');
    expect(openCalls[0]).to.include('lang=en');
    expect(openCalls[0]).to.include('floor_id=floor-1');
    expect(openCalls[0]).to.include('room_id=room-1');
  });

  it('ポップアップを開けない場合は同じ認証URLへのリンクを使う', () => {
    window.open = () => null;
    const wrapper = createWrapper({
      props: { authorizePath: '/api/auth/line/authorize', floorId: 'floor-1', roomId: 'room-1' },
    });
    const fallback = wrapper.get('[data-testid="line-login-fallback"]');
    let clicked = false;
    fallback.element.addEventListener('click', (event) => {
      event.preventDefault();
      clicked = true;
    });

    wrapper.vm.openPopup();

    expect(clicked).to.equal(true);
    expect(fallback.attributes('href')).to.include('/api/auth/line/authorize?lang=en');
    expect(fallback.attributes('href')).to.include('floor_id=floor-1');
    expect(fallback.attributes('href')).to.include('room_id=room-1');
  });

  it('expectedOrigin のメッセージで success を通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.onMsg({ origin: 'http://example.com', data: { type: 'line-login', payload: { ok: true } } });
    expect(wrapper.emitted().success[0][0]).to.deep.equal({ ok: true });
  });

  it('オリジンが違う場合は何もしない', () => {
    const wrapper = createWrapper();
    wrapper.vm.onMsg({ origin: 'http://other.example.com', data: { type: 'line-login', payload: { ok: true } } });
    expect(wrapper.emitted().success).to.equal(undefined);
    expect(wrapper.emitted().error).to.equal(undefined);
  });

  it('データが無い場合はエラーを通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.onMsg({ origin: 'http://example.com', data: { type: 'line-login', payload: null } });
    expect(wrapper.emitted().error).to.have.lengthOf(1);
  });
});
