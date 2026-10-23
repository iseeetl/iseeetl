import { describe, it, expect, vi } from 'vitest';
import { timelineDialogMethods } from '@/features/timeline/dialogMethods';
import { createTimelineViewState } from '@/features/timeline/viewState';

const context = () => ({
  dialogs: createTimelineViewState().dialogs, ui: { currentTabIndex: 0 }, $route: { params: {} },
  timeline: { filters: [{ conditions: null }, { conditions: { filterMode: 'exclude', displayOrder: [{ key: 'guide' }] } }] },
  ensureGuestRules: async () => true, setTargetLangs: vi.fn(), getPreviousOwnPostTagIds: () => [],
  $refs: { dialogsRef: { openEditPostDialogAndFocus: vi.fn(), openEditReplyDialogAndFocus: vi.fn() } },
});

describe('Editor column tag context', () => {
  it('uses the clicked column, including exclusion tags, for edits and replies', async () => {
    const ctx = context(); const post = { room_tags: ['saved'] }; const reply = { room_tags: ['reply'] };
    await timelineDialogMethods.showEditPostDialog.call(ctx, post, false, [], 1);
    await timelineDialogMethods.showEditReplyDialog.call(ctx, post, reply, null, 1);
    expect(ctx.dialogs.post.edit.columnTagIds).toEqual(['guide']);
    expect(ctx.dialogs.reply.edit.columnTagIds).toEqual(['guide']);
    expect(post.room_tags).toEqual(['saved']); expect(reply.room_tags).toEqual(['reply']);
    ctx.timeline.filters[1].conditions.displayOrder = [{ key: 'changed' }];
    expect(ctx.dialogs.reply.edit.columnTagIds).toEqual(['guide']);
  });
  it.each([0, null, 8])('does not retain tags when reopening from column %s', async index => {
    const ctx = context();
    await timelineDialogMethods.showEditReplyDialog.call(ctx, {}, null, null, 1);
    timelineDialogMethods.closeEditReplyDialog.call(ctx);
    expect(ctx.dialogs.reply.edit.columnTagIds).toEqual([]);
    await timelineDialogMethods.showEditReplyDialog.call(ctx, {}, null, null, index);
    expect(ctx.dialogs.reply.edit.columnTagIds).toEqual([]);
  });
  it('never uses filter tags on a post detail route', async () => {
    const ctx = context(); ctx.$route.params.post_id = 'detail';
    await timelineDialogMethods.showEditPostDialog.call(ctx, {}, false, [], 1);
    await timelineDialogMethods.showEditReplyDialog.call(ctx, {}, null, null, 1);
    expect(ctx.dialogs.post.edit.columnTagIds).toEqual([]);
    expect(ctx.dialogs.reply.edit.columnTagIds).toEqual([]);
  });
});
