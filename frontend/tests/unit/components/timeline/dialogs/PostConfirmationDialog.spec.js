import { describe, it, expect, vi, afterEach } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import PostConfirmationDialog from '@/components/timeline/dialogs/PostConfirmationDialog.vue';
import chatApi from '@/api/chat';
afterEach(() => vi.restoreAllMocks());
const mountPanel = (login = false) => shallowMount(PostConfirmationDialog, {
  props: { open: false, postId: 'post-1', roomId: 'room-1', tags: [] },
  global: { mocks: { $store: { getters: { userIsLogin: login } }, $t: key => key } },
});
describe('Post confirmation', () => {
  it.each([true, false])('uses the existing authorized detail endpoint (login=%s)', async login => {
    const detail = vi.spyOn(chatApi, 'fetchDetail').mockResolvedValue({ data: { _id: 'post-1', replies: [] } });
    const wrapper = mountPanel(login); await wrapper.setProps({ open: true }); await flushPromises();
    expect(detail).toHaveBeenCalledWith({ room_id: 'room-1', post_id: 'post-1', isGuest: !login });
    expect(wrapper.vm.post._id).toBe('post-1');
  });
  it('a late reply cannot replace a newer selected post', async () => {
    let first; const detail = vi.spyOn(chatApi, 'fetchDetail').mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockResolvedValue({ data: { _id: 'post-2' } });
    const wrapper = mountPanel(); await wrapper.setProps({ open: true }); await wrapper.setProps({ postId: 'post-2' }); await flushPromises();
    first({ data: { _id: 'post-1' } }); await flushPromises();
    expect(detail).toHaveBeenCalledTimes(2); expect(wrapper.vm.post._id).toBe('post-2');
  });
  it.each([403,404,500])('reports an inaccessible or failed response (%s)', async status => {
    vi.spyOn(chatApi, 'fetchDetail').mockRejectedValue({ response: { status } });
    const wrapper = mountPanel(); await wrapper.setProps({ open: true }); await flushPromises();
    expect(wrapper.vm.post).toBe(null); expect(wrapper.vm.error).toBe(status === 500 ? 'postDefaults.loadFailed' : 'postDefaults.unavailable');
  });
  it('refresh fetches only detail and receives later replies', async () => {
    const detail = vi.spyOn(chatApi, 'fetchDetail').mockResolvedValueOnce({ data: { _id: 'post-1', replies: [] } }).mockResolvedValue({ data: { _id: 'post-1', replies: [{ _id: 'reply-1' }] } });
    const wrapper = mountPanel(); await wrapper.setProps({ open: true }); await flushPromises(); await wrapper.vm.fetchPost();
    expect(detail).toHaveBeenCalledTimes(2); expect(wrapper.vm.post.replies).toHaveLength(1);
  });
});
