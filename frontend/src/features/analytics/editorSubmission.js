// A local lifecycle token pairs an accepted action with one result. No text is collected.
export const createEditorSubmissionTracker = ({ track, getContext, getLayout }) => {
  let count = 0;
  const pending = new WeakSet();
  const send = (name, parameters) => {
    try { track(name, parameters); } catch { /* Measurement must never block saving. */ }
  };
  return {
    reset() { count = 0; },
    begin({ position, mode, content, action }) {
      let context; let layout;
      try { context = getContext(); layout = getLayout(); } catch { return null; }
      const token = Object.freeze({ ...context, control_position: position,
        submit_mode: mode, content_type: content, action_type: action,
        editor_layout: layout, attempt_phase: count++ ? 'repeat' : 'first' });
      pending.add(token);
      send('timeline_submit_select', token);
      return token;
    },
    finish(token, outcome) {
      if (!pending.has(token)) return;
      pending.delete(token);
      send('timeline_submit_result', { ...token, outcome });
    },
  };
};

export const editorSubmissionMixin = {
  inject: { analyticsEventReporter: { from: 'analyticsEventReporter', default: null } },
  created() {
    this.editorSubmissionTracker = createEditorSubmissionTracker({
      track: (name, parameters) => this.analyticsEventReporter?.track?.(name, parameters),
      getContext: () => ({ floor_id: this.$store.getters.floorId, room_id: this.$store.getters.roomId }),
      getLayout: () => window.matchMedia?.('(max-width: 896px)').matches ? 'mobile_dual' : 'desktop_current',
    });
  },
  watch: {
    visible(value) {
      if (value) {
        if (!this.keepSubmissionSequence) this.editorSubmissionTracker.reset();
        this.keepSubmissionSequence = false;
      }
    },
  },
};
