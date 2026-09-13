<template>
  <div
    v-if="reactionPickerVisible"
    ref="picker"
    class="reaction-picker"
    role="group"
    :aria-label="$t('リアクション')"
    :id="pickerId"
    @keydown.tab="onTabKey"
    @keydown.esc.stop.prevent="closeReactionPicker"
  >
    <div class="reaction-buttons">
      <button
        v-for="(reaction, index) in reactionTypes"
        :key="reaction.type"
        :disabled="sending"
        :ref="'reactionButton' + index"
        @click.stop="addReaction($event, reaction.type)"
      >
        <img class="emoji-icon" :src="reaction.icon" :alt="$t(reaction.type)" />
      </button>

      <button
        ref="closeButton"
        class="close-button"
        :aria-label="$t('閉じる')"
        @click.stop="closeReactionPicker"
      >
        <UiIcon class="close-icon" name="close" :size="18" />
      </button>
    </div>
  </div>
</template>

<script>
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
  },
  beforeUnmount() {
    document.body.removeEventListener('pointerup', this.handleClickOutside);
  },
  data() {
    return {
      sending: false,
    };
  },
  computed: {
    reactionTypes() {
      return REACTION_TYPES;
    },
    currentUserId() {
      return this.$store.getters.userId !== null ? this.$store.getters.userId : this.$store.getters.guestId;
    },
  },
  methods: {
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

      this.sending = true;
      try {
        const isUser = this.$store.getters.userId !== null;
        const fixedReactionType = this.resolveFixedReactionType(type);
        const capturedOperation = fixedReactionType ? this.captureTimelineOperation() : null;

        await chatApi.addReaction({
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
        void error;
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
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 8px;
  display: inline-block;
}

.reaction-buttons {
  display: flex;
  justify-content: center;
}

.reaction-buttons button {
  margin: 0 4px;
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
