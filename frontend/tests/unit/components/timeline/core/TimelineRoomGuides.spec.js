import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimelineRoomGuides from '@/components/timeline/core/TimelineRoomGuides.vue';
import chatApi from '@/api/chat';

vi.mock('@/api/chat', () => ({ default: { fetchDetail: vi.fn() } }));
const roomId = '111111111111111111111111';
const ids = ['222222222222222222222222', '333333333333333333333333'];
const group = { lang: 'ja', label: '日本語の案内', postIds: ids };
const guideConfig = { [roomId]: [group] };
const post = (id, extra = {}) => ({ _id: id, room: roomId, lang: 'ja', content: `案内 ${id}\n本文`, ...extra });
const wrappers = [];
const create = (props = {}) => {
  const wrapper = mount(TimelineRoomGuides, {
    props: { roomId, guideConfig, ...props },
    global: {
      mocks: { $t: (key) => key },
      stubs: {
        UiButton: { template: '<button><slot /></button>' },
        UiDialog: { props: ['open'], template: '<div v-if="open"><slot name="title"/><slot/></div>' },
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.resetAllMocks(); });

describe('fixed room guides', () => {
  it('shows only configured room buttons and fetches on opening', async () => {
    const wrapper = create();
    expect(wrapper.get('[data-testid="room-guide-ja"]').attributes('lang')).toBe('ja');
    expect(chatApi.fetchDetail).not.toHaveBeenCalled();
    await wrapper.setProps({ roomId: '666666666666666666666666' });
    expect(wrapper.find('[data-testid="timeline-room-guides"]').exists()).toBe(false);
  });
  it('uses guest access and preserves original text and configured order', async () => {
    chatApi.fetchDetail.mockImplementation(({ post_id }) => Promise.resolve({ data: post(post_id, { translations: [{ lang: 'en', content: 'translation' }] }) }));
    const wrapper = create();
    await wrapper.get('[data-testid="room-guide-ja"]').trigger('click');
    await flushPromises();
    expect(chatApi.fetchDetail).toHaveBeenCalledWith({ room_id: roomId, post_id: ids[0], isGuest: true });
    expect(wrapper.findAll('.room-guide-part h3').map((node) => node.text())).toEqual(ids.map((id) => `案内 ${id}`));
    expect(wrapper.text()).not.toContain('translation');
  });
  it('uses authenticated access without changing profile language', async () => {
    chatApi.fetchDetail.mockImplementation(({ post_id }) => Promise.resolve({ data: post(post_id) }));
    const wrapper = create({ isGuest: false });
    await wrapper.vm.openGuide(group);
    expect(chatApi.fetchDetail).toHaveBeenCalledWith({ room_id: roomId, post_id: ids[0], isGuest: false });
    expect(wrapper.emitted()).toEqual({});
  });
  it.each([
    { room: '666666666666666666666666' }, { lang: 'en' }, { delete_flg: true }, { content: '' }, { _id: 'wrong' },
  ])('rejects mismatched or unavailable source %j', async (extra) => {
    chatApi.fetchDetail.mockImplementation(({ post_id }) => Promise.resolve({ data: post(post_id, extra) }));
    const wrapper = create();
    await wrapper.vm.openGuide(group);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.find('.room-guide-part').exists()).toBe(false);
  });
  it('can retry a failed request and reloads edits on each open', async () => {
    chatApi.fetchDetail.mockRejectedValue(new Error('network'));
    const wrapper = create();
    await wrapper.vm.openGuide(group);
    expect(wrapper.vm.failed).toBe(true);
    chatApi.fetchDetail.mockImplementation(({ post_id }) => Promise.resolve({ data: post(post_id, { content: 'Updated\nNew text' }) }));
    await wrapper.vm.loadGuide();
    expect(wrapper.vm.failed).toBe(false);
    expect(wrapper.text()).toContain('New text');
    wrapper.vm.closeGuide();
    await wrapper.vm.openGuide(group);
    expect(chatApi.fetchDetail).toHaveBeenCalledTimes(6);
  });
  it('does not display an old response after navigation or closing', async () => {
    let resolve;
    chatApi.fetchDetail.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const wrapper = create({ guideConfig: { [roomId]: [{ ...group, postIds: [ids[0]] }] } });
    const pending = wrapper.vm.openGuide(wrapper.vm.groups[0]);
    await wrapper.setProps({ roomId: '666666666666666666666666' });
    resolve({ data: post(ids[0]) });
    await pending;
    expect(wrapper.vm.posts).toEqual([]);
    expect(wrapper.vm.activeGroup).toBeNull();
  });
  it('renders source markup as text rather than HTML', async () => {
    chatApi.fetchDetail.mockImplementation(({ post_id }) => Promise.resolve({ data: post(post_id, { content: 'Title\n<img src=x onerror=alert(1)>' }) }));
    const wrapper = create();
    await wrapper.vm.openGuide(group);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>');
  });
});
