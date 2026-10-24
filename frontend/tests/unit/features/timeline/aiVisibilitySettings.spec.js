import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AIVisibilitySettings from '@/components/timeline/inputs/AIVisibilitySettings.vue';
import apiClient from '@/api/apiClient';
vi.mock('@/api/apiClient', () => ({ default: { get: vi.fn() } }));
const tag = (id, name) => ({ _id: id, name, lang: 'ja', ai_enabled: true });
const render = (props = {}) => mount(AIVisibilitySettings, {
  props: { roomId: 'room-a', roomTitle: 'Room A', enabled: true,
    modelValue: { mode: 'tags', hiddenTagIds: ['sound'] }, ...props },
  global: { mocks: { $t: (key, args) => args?.tag ? `${key}: ${args.tag}` : key, $i18n: { locale: 'ja' } } },
});
describe('current AI source metadata', () => {
  it('uses fresh names and settings instead of the timeline snapshot', async () => {
    apiClient.get.mockResolvedValueOnce({ data: [tag('sound', '会場の音'), tag('new', '交通案内')] });
    const wrapper = render({ tags: [tag('sound', '音解析'), tag('disabled', '質問')] });
    await flushPromises();
    expect(wrapper.text()).toContain('会場の音');
    expect(wrapper.text()).not.toContain('音解析');
    expect(wrapper.text()).not.toContain('質問');
    const boxes = wrapper.findAll('input[type="checkbox"]');
    expect(boxes.map((b) => b.element.checked)).toEqual([false, true]);
    expect(boxes[0].attributes('aria-label')).toBe('aiVisibility.showSource: 会場の音');
    wrapper.unmount();
  });
  it('fetches again when reopened and keeps historical sources after AI is disabled', async () => {
    apiClient.get.mockResolvedValueOnce({ data: [tag('sound', '音解析')] });
    const first = render(); await flushPromises(); first.unmount();
    apiClient.get.mockResolvedValueOnce({ data: [{ ...tag('sound', '会場の音'), ai_enabled: false }] });
    const second = render(); await flushPromises();
    expect(second.text()).toContain('会場の音');
    expect(second.find('input[type="checkbox"]').element.checked).toBe(false);
    second.unmount();
  });
  it('ignores a late response from the previous room', async () => {
    let finishA;
    apiClient.get.mockImplementationOnce(() => new Promise((resolve) => { finishA = resolve; }));
    const wrapper = render();
    apiClient.get.mockResolvedValueOnce({ data: [tag('b', '展示の紹介')] });
    await wrapper.setProps({ roomId: 'room-b', roomTitle: 'Room B', modelValue: { mode: 'tags', hiddenTagIds: [] } });
    await flushPromises();
    finishA({ data: [tag('a', '今回の研究')] }); await flushPromises();
    expect(wrapper.text()).toContain('展示の紹介');
    expect(wrapper.text()).not.toContain('今回の研究');
    expect(wrapper.find('input[type="checkbox"]').element.checked).toBe(true);
    wrapper.unmount();
  });
});
