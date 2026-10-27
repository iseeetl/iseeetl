import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TimelineImage from '@/components/timeline/TimelineImage.vue';

let resize, intersection;
const start = ({ width = 400, height = 283, dpr = 1 } = {}) => {
  vi.stubGlobal('devicePixelRatio', dpr);
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { resize = callback; } observe() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { constructor(callback) { intersection = callback; } observe() {} disconnect() {} });
  const wrapper = mount(TimelineImage, { props: { src: '/small.png', previewSrc: '/full.png?preview=800' }, attrs: { alt: 'Description' } });
  const element = wrapper.element;
  Object.defineProperty(element, 'complete', { value: true });
  Object.defineProperty(element, 'naturalWidth', { value: 400 });
  element.getBoundingClientRect = () => ({ width, height });
  return wrapper;
};
afterEach(() => vi.unstubAllGlobals());

describe('TimelineImage', () => {
  it('通常密度では400pxのまま、名前と遅延読み込みを維持する', async () => {
    const wrapper = start(); intersection([{ isIntersecting: true }]); await wrapper.vm.$nextTick();
    expect(wrapper.attributes('src')).toBe('/small.png');
    expect(wrapper.attributes('alt')).toBe('Description');
    expect(wrapper.attributes('loading')).toBe('lazy'); wrapper.unmount();
  });
  it('高密度でも画面外は追加取得せず、表示時に800pxへ切り替える', async () => {
    const wrapper = start({ dpr: 3 }); await wrapper.trigger('load');
    expect(wrapper.attributes('src')).toBe('/small.png');
    intersection([{ isIntersecting: true }]); await wrapper.vm.$nextTick();
    expect(wrapper.attributes('src')).toBe('/full.png?preview=800'); wrapper.unmount();
  });
  it('狭い列は400pxを維持し、列幅変更時に追従する', async () => {
    const wrapper = start({ width: 150, height: 100, dpr: 2 });
    intersection([{ isIntersecting: true }]); await wrapper.vm.$nextTick();
    expect(wrapper.attributes('src')).toBe('/small.png');
    wrapper.element.getBoundingClientRect = () => ({ width: 350, height: 250 });
    resize(); await wrapper.vm.$nextTick();
    expect(wrapper.attributes('src')).toBe('/full.png?preview=800'); wrapper.unmount();
  });
  it('800px取得失敗は400pxへ戻り、再試行を繰り返さない', async () => {
    const wrapper = start({ dpr: 2 }); intersection([{ isIntersecting: true }]); await wrapper.vm.$nextTick();
    await wrapper.trigger('error'); await wrapper.trigger('load'); resize();
    expect(wrapper.attributes('src')).toBe('/small.png'); wrapper.unmount();
  });
  it('画像を入れ替えたら以前の高解像度状態を引き継がない', async () => {
    const wrapper = start({ dpr: 2 }); intersection([{ isIntersecting: true }]); await wrapper.vm.$nextTick();
    await wrapper.setProps({ src: '/next.png', previewSrc: '' });
    expect(wrapper.attributes('src')).toBe('/next.png'); wrapper.unmount();
  });
});
