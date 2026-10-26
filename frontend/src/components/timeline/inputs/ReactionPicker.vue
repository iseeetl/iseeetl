<template>
  <div
    v-if="reactionPickerVisible"
    ref="picker"
    class="reaction-picker"
    role="group"
    :aria-label="targetLabel || $t('リアクション')"
    :id="pickerId"
    :style="{ transform: `translateX(${pickerShift}px)`, maxWidth: pickerMaxWidth ? `min(${pickerMaxWidth}px, calc(100vw - 40px))` : null }"
    @keydown.tab="onTabKey"
    @keydown.esc.stop.prevent="closeReactionPicker"
  >
    <div ref="reactionRow" class="reaction-row">
      <button v-if="scrollable" ref="previousButton" class="scroll-button" :class="{ unavailable: !canScrollLeft }"
        :disabled="sending || !canScrollLeft" :aria-label="$t('roomEmoji.scrollPrevious')" :title="$t('roomEmoji.scrollPrevious')"
        @click.stop="scrollChoices(-1)"><UiIcon name="chevron_left" :size="22" /></button>
      <div ref="reactionScroll" class="reaction-buttons" @scroll.passive="updateScrollState">
      <button
        v-for="(reaction, index) in reactionTypes"
        :key="reaction.type"
        :disabled="sending"
        :aria-pressed="String(hasReacted(reaction.type))"
        :title="reaction.label || $t(reaction.type)"
        :ref="'reactionButton' + index"
        @click.stop="addReaction($event, reaction.type)"
      >
        <img v-if="reaction.icon" class="emoji-icon" :src="reaction.icon" :alt="$t(reaction.type)" /><span v-else :aria-label="reaction.label" role="img" style="font-size:20px">{{ reaction.emoji }}</span>
      </button>

      </div>
      <button v-if="scrollable" ref="nextButton" class="scroll-button" :class="{ unavailable: !canScrollRight }"
        :disabled="sending || !canScrollRight" :aria-label="$t('roomEmoji.scrollNext')" :title="$t('roomEmoji.scrollNext')"
        @click.stop="scrollChoices(1)"><UiIcon name="chevron_right" :size="22" /></button>
    </div>
      <button
        ref="closeButton"
        class="close-button"
        :aria-label="$t('閉じる')"
        @click.stop="closeReactionPicker"
      >
        <UiIcon class="close-icon" name="close" :size="18" />
      </button>
  </div>
  <span v-if="reactionError" role="alert">{{ $t('roomEmoji.failed') }}</span>
</template>

<script>
import { changeScopedReaction } from '@/api/scopedReactions';
import chatApi from '@/api/chat';
import UiIcon from '@/components/ui/UiIcon.vue';
import { REACTION_TYPES } from '@/constants/reactionTypes';
export default {
  emits: ['close'],
  components: {
    UiIcon,
  },
  inject: {
    requireGuestRules: { from: 'requireGuestRules', default: null },
    timelineOperationReporter: { from: 'timelineOperationReporter', default: null },
  },
  props: {
    mediaKind: String,
    targetLabel: String,
    pickerId: {
      type: String,
      required: true,
    },
    reactionPickerVisible: {
      type: Boolean,
      required: true,
    },
    postId: {
      type: String,
      required: true,
    },
    replyId: {
      type: String,
      default: null,
    },
    supplementId: {
      type: String,
      default: null,
    },
    reactions: {
      type: Array,
      required: true,
    },
    isGuestRulesAgreed: {
      type: Boolean,
      default: false,
    },
  },
  mounted() {
    document.body.addEventListener('pointerup', this.handleClickOutside);
    window.addEventListener('resize', this.fitPickerToViewport);
    this.$nextTick(() => {
      this.observePickerContainers();
      this.fitPickerToViewport();
    });
  },
  beforeUnmount() {
    document.body.removeEventListener('pointerup', this.handleClickOutside);
    window.removeEventListener('resize', this.fitPickerToViewport);
    this.pickerResizeObserver?.disconnect();
    this.pickerFitVersion += 1;
  },
  data() {
    return {
      scrollable: false,
      canScrollLeft: false,
      canScrollRight: false,
      pickerShift: 0,
      pickerMaxWidth: 0,
      pickerFitVersion: 0,
      sending: false,
      reactionError: false,
    };
  },
  computed: {
    reactionTypes() {
      return this.$store.getters.roomEmojiChoices || REACTION_TYPES;
    },
    currentUserId() {
      return this.$store.getters.userId !== null ? this.$store.getters.userId : this.$store.getters.guestId;
    },
  },
  methods: {
    observePickerContainers() {
      if (typeof ResizeObserver === 'undefined') return;
      const widths = new WeakMap();
      this.pickerResizeObserver = new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (widths.get(entry.target) !== width) {
            widths.set(entry.target, width);
            changed = true;
          }
        }
        // Height changes caused by the picker must not trigger a resize loop.
        if (changed) this.fitPickerToViewport();
      });
      for (let parent = this.$refs.picker?.parentElement; parent; parent = parent.parentElement) {
        this.pickerResizeObserver.observe(parent);
      }
    },
    async fitPickerToViewport() {
      const picker = this.$refs.picker;
      if (!picker) return;
      const version = ++this.pickerFitVersion;
      let leftEdge = 0;
      let rightEdge = document.documentElement.clientWidth || window.innerWidth;
      for (let parent = picker.parentElement; parent; parent = parent.parentElement) {
        const style = window.getComputedStyle(parent);
        if (/auto|scroll|hidden|clip/.test(style.overflowX || style.overflow)) {
          const bounds = parent.getBoundingClientRect();
          leftEdge = Math.max(leftEdge, bounds.left);
          rightEdge = Math.min(rightEdge, bounds.right);
        }
      }
      this.pickerMaxWidth = Math.max(40, rightEdge - leftEdge - 40);
      await this.$nextTick();
      if (!this.$refs.picker || version !== this.pickerFitVersion) return;
      const rect = picker.getBoundingClientRect();
      const left = Math.max(leftEdge + 16, Math.min(rect.left, rightEdge - rect.width - 24));
      this.pickerShift += left - rect.left;
      this.updateScrollState();
    },
    updateScrollState() {
      const scroller = this.$refs.reactionScroll;
      const row = this.$refs.reactionRow;
      if (!scroller || !row) return;
      const scrollable = scroller.scrollWidth > row.clientWidth + 1;
      if (this.scrollable !== scrollable) {
        this.scrollable = scrollable;
        this.$nextTick(this.updateScrollState);
        return;
      }
      this.canScrollLeft = scrollable && scroller.scrollLeft > 1;
      this.canScrollRight = scrollable && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      const active = document.activeElement;
      if ((!this.canScrollLeft && active === this.$refs.previousButton) ||
          (!this.canScrollRight && active === this.$refs.nextButton)) {
        const buttons = scroller.querySelectorAll('button:not(:disabled)');
        const target = active === this.$refs.previousButton ? buttons[0] : buttons[buttons.length - 1];
        target?.focus({ preventScroll: true });
      }
    },
    scrollChoices(direction) {
      const scroller = this.$refs.reactionScroll;
      if (!scroller) return;
      scroller.scrollLeft += direction * Math.max(44, scroller.clientWidth * 0.75);
      this.updateScrollState();
    },
    onTabKey(event) {
      const buttons = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'));
      if (!buttons.length) return;

      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = document.activeElement;
      const boundary = event.shiftKey ? first : last;
      if (active === boundary || !buttons.includes(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    },
    focusFirstReactionButton() {
      const ref = this.$refs.reactionButton0;
      const target = Array.isArray(ref) ? ref[0] : ref;
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    },
    closeReactionPicker(event) {
      if (event) {
        event.preventDefault();
      }
      this.$emit('close');
    },
    handleClickOutside(event) {
      const trigger = event.target.closest?.('[aria-controls]');
      const isOwnTrigger = trigger?.getAttribute('aria-controls') === this.pickerId;
      if (
        this.$refs.picker &&
        !this.$refs.picker.contains(event.target) &&
        !isOwnTrigger
      ) {
        this.closeReactionPicker();
      }
    },
    resolveReactionContentType() {
      if (this.supplementId) {
        return this.replyId ? 'reply_supplement' : 'post_supplement';
      }
      return this.replyId ? 'reply' : 'post';
    },
    resolveFixedReactionType(reactionType) {
      return REACTION_TYPES.some(({ type }) => type === reactionType) ? reactionType : null;
    },
    captureTimelineOperation() {
      const reporter = this.timelineOperationReporter;
      if (
        !reporter ||
        typeof reporter.capture !== 'function' ||
        typeof reporter.report !== 'function'
      ) {
        return null;
      }
      try {
        return { reporter, token: reporter.capture() };
      } catch (error) {
        void error;
        return null;
      }
    },
    reportTimelineOperation(captured, operation) {
      if (!captured) return;
      try {
        const result = captured.reporter.report(captured.token, operation);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            void error;
          });
        }
      } catch (error) {
        void error;
      }
    },
    async addReaction(event, type) {
      if (event) {
        event.preventDefault();
      }

      if (!this.$store.getters.userIsLogin && !this.isGuestRulesAgreed) {
        if (this.requireGuestRules) {
          const ok = await this.requireGuestRules();
          if (!ok) return;
        }
      }

      if (this.sending || this.hasReacted(type)) {
        return;
      }

      this.sending = true; this.reactionError = false;
      try {
        const isUser = this.$store.getters.userId !== null;
        const fixedReactionType = this.mediaKind ? null : this.resolveFixedReactionType(type);
        const capturedOperation = fixedReactionType ? this.captureTimelineOperation() : null;

        await (this.mediaKind || type.startsWith('room:') ? changeScopedReaction : chatApi.addReaction)({
          mediaKind: this.mediaKind,
          postId: this.postId,
          reactionType: type,
          replyId: this.replyId,
          supplementId: this.supplementId,
          isUser,
          guestName: this.$store.getters.guestName,
        });
        if (fixedReactionType) {
          this.reportTimelineOperation(capturedOperation, {
            kind: 'reaction_change',
            content: this.resolveReactionContentType(),
            action: 'add',
            reactionType: fixedReactionType,
          });
        }
      } catch (error) {
        void error; this.reactionError = true;
      } finally {
        this.sending = false;
        this.$emit('close');
      }
    },
    hasReacted(type) {
      return this.reactions.some((reaction) => {
        if (typeof reaction.user !== 'undefined' && reaction.user !== null) {
          const userId = typeof reaction.user._id !== 'undefined' ? reaction.user._id : reaction.user;
          return this.currentUserId === userId && reaction.type === type;
        } else {
          return this.currentUserId === reaction.guest_id && reaction.type === type;
        }
      });
    },
  },
};
</script>

<style scoped>
.reaction-picker {
  position: relative;
  background-color: white;
  color:#243040;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 8px;
  display: inline-block;
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100vw - 40px);
}

.reaction-row { display:flex;align-items:center;gap:4px; }
.scroll-button { flex:0 0 28px;width:28px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;border:1px solid #aab7d1;border-radius:4px;background:#eef2fa;color:#243040;cursor:pointer; }
.scroll-button.unavailable { display:none; }
.scroll-button:focus-visible { outline:2px solid #245a98;outline-offset:2px; }
.reaction-buttons {
  min-width:0;
  flex:1 1 auto;
  display: flex;
  justify-content: flex-start;
  overflow-x: auto;
  overflow-y: hidden;
  padding-block: 3px;
  margin-block: -3px;
  overscroll-behavior-x: contain;
}

.reaction-buttons button {
  margin: 0 4px;
  flex: 0 0 auto;
}

.reaction-buttons button .emoji-icon {
  max-width: none;
  width: 20px;
  height: 20px;
}

.close-button {
  position: absolute;
  top: -10px;
  inset-inline-end: -18px;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  border: none;
  cursor: pointer;
}
.close-icon {
  width: 18px !important;
  height: 18px !important;
  font-size: 18px !important;
}
</style>
