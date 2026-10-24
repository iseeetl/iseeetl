import { describe, it, expect, vi } from 'vitest';
import { createEditorSubmissionTracker } from '@/features/analytics/editorSubmission';
import { buildAnalyticsEventPayload } from '@/features/analytics/contract';

const args = { position: 'bottom', mode: 'continuous', content: 'post', action: 'create' };
const context = { floor_id: '202610240000000000000001', room_id: '202610240000000000000002' };
const create = (options = {}) => {
  const track = vi.fn();
  return { track, tracker: createEditorSubmissionTracker({ track, getContext: () => context,
    getLayout: () => 'mobile_dual', ...options }) };
};
describe('送信位置と保存結果の計測', () => {
  it('上下・ショートカットを保持し、結果を一度だけ記録する', () => {
    const { track, tracker } = create();
    for (const position of ['top', 'bottom', 'shortcut', 'desktop']) {
      const token = tracker.begin({ ...args, position });
      tracker.finish(token, 'success'); tracker.finish(token, 'success');
      expect(track.mock.calls.at(-1)[1]).toMatchObject({ control_position: position, outcome: 'success' });
    }
    expect(track).toHaveBeenCalledTimes(8);
  });
  it('初回と同じ編集セッション内の再操作を分け、リセットできる', () => {
    const { tracker } = create();
    expect(tracker.begin(args).attempt_phase).toBe('first');
    expect(tracker.begin(args).attempt_phase).toBe('repeat');
    tracker.reset(); expect(tracker.begin(args).attempt_phase).toBe('first');
  });
  it('処理中に画面条件が変わっても操作時の位置とルームを保持する', () => {
    let room = context.room_id; let layout = 'mobile_dual';
    const { tracker, track } = create({ getContext: () => ({ ...context, room_id: room }), getLayout: () => layout });
    const token = tracker.begin(args); room = '202610240000000000000003'; layout = 'desktop_current';
    tracker.finish(token, 'request_error');
    expect(track.mock.calls[1][1]).toMatchObject({ ...context, editor_layout: 'mobile_dual', outcome: 'request_error' });
  });
  it('計測の失敗が保存処理を中断しない', () => {
    const { tracker } = create({ track: () => { throw Error('disabled'); } });
    expect(() => tracker.finish(tracker.begin(args), 'success')).not.toThrow();
    const broken = create({ getContext: () => { throw Error('unavailable'); } }).tracker;
    expect(() => broken.finish(broken.begin(args), 'success')).not.toThrow();
  });
  it('結果と位置は許可値だけを送信し、本文を追加しても送信しない', () => {
    const { tracker } = create();
    const parameters = { ...tracker.begin(args), visitor_type: 'guest', outcome: 'validation_error', content: 'PRIVATE DRAFT' };
    const payload = buildAnalyticsEventPayload('timeline_submit_result', parameters);
    expect(payload).toMatchObject({ outcome: 'validation_error', control_position: 'bottom' });
    expect(JSON.stringify(payload)).not.toContain('PRIVATE');
    expect(buildAnalyticsEventPayload('timeline_submit_result', { ...parameters, control_position: 'arbitrary' })).toBeNull();
  });
});
