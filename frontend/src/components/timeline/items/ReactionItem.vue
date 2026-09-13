<template>
  <div class="reaction-item" v-if="hasReactions">
    <div
      v-for="reaction in reactionTypes"
      :key="reaction.type"
      class="reaction-button"
      :class="{ reacted: hasReacted(reaction.type) }"
      v-show="getReactionCount(reaction.type) > 0"
    >
      <button
        @click="toggleReaction(reaction.type)"
        :disabled="sending"
        :aria-label="
          $t('{count}件の{reactionType}があります', {
            count: formatCount(getReactionCount(reaction.type)),
            reactionType: $t(reaction.type),
          }, getReactionCount(reaction.type))
        "
      >
        <img class="emoji-icon" :src="reaction.icon" :alt="$t(reaction.type)" aria-hidden="true" />
        <span class="reaction-count" aria-hidden="true">{{ formatCount(getReactionCount(reaction.type)) }}</span>
      </button>
    </div>
  </div>
</template>

<script>
import chatApi from '@/api/chat';
import { REACTION_TYPES } from '@/constants/reactionTypes';
import { formatLocaleNumber } from '@/utils/numberFormat';
export default {
  inject: {
    requireGuestRules: { from: 'requireGuestRules', default: null },
    timelineOperationReporter: { from: 'timelineOperationReporter', default: null },
  },
  props: {
    reactions: {
      type: Array,
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
    isGuestRulesAgreed: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      sending: false,
    };
  },
  computed: {
    currentUserId() {
      return this.$store.getters.userId !== null ? this.$store.getters.userId : this.$store.getters.guestId;
    },
    hasReactions() {
      return this.reactions.length > 0;
    },
    reactionTypes() {
      return REACTION_TYPES;
    },
  },
  methods: {
    formatCount(count) {
      return formatLocaleNumber(count, this.$i18n?.locale);
    },
    getReactionCount(reactionType) {
      return this.reactions.filter((r) => r.type === reactionType).length;
    },
    hasReacted(reactionType) {
      return this.reactions.some((r) => {
        if (typeof r.user !== 'undefined' && r.user !== null) {
          const userId = typeof r.user._id !== 'undefined' ? r.user._id : r.user;
          return this.currentUserId === userId && r.type === reactionType;
        } else {
          return this.currentUserId === r.guest_id && r.type === reactionType;
        }
      });
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
    async toggleReaction(reactionType) {
      if (!this.$store.getters.userIsLogin && !this.isGuestRulesAgreed) {
        if (this.requireGuestRules) {
          const ok = await this.requireGuestRules();
          if (!ok) return;
        }
      }

      if (this.sending) return;
      this.sending = true;

      try {
        const isUser = this.$store.getters.userId !== null;
        const isDelete = this.hasReacted(reactionType);
        const reactionId = isDelete
          ? this.reactions.find(
              (r) => this.currentUserId === (r.user ? r.user._id || r.user : r.guest_id) && r.type === reactionType
            )._id
          : null;
        const fixedReactionType = this.resolveFixedReactionType(reactionType);
        const capturedOperation = fixedReactionType ? this.captureTimelineOperation() : null;

        await chatApi.toggleReaction({
          postId: this.postId,
          reactionType,
          replyId: this.replyId,
          supplementId: this.supplementId,
          isUser,
          isDelete,
          reactionId,
          guestName: this.$store.getters.guestName,
        });
        if (fixedReactionType) {
          this.reportTimelineOperation(capturedOperation, {
            kind: 'reaction_change',
            content: this.resolveReactionContentType(),
            action: isDelete ? 'remove' : 'add',
            reactionType: fixedReactionType,
          });
        }
      } catch (error) {
        void error;
      } finally {
        this.sending = false;
      }
    },
  },
};
</script>

<style scoped>
.reaction-item {
  display: flex;
  margin: 8px 0;
}

.reaction-button button {
  font-size: inherit;
}
.reaction-count {
  font-size: inherit;
}
.reaction-button {
  margin-inline-end: 8px;
}

.reaction-button button {
  display: flex;
  align-items: center;
  background-color: transparent;
  border: none;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 4px;
}

.reaction-button.reacted button {
  border: 2px solid blue;
  border-radius: 4px;
}

.emoji-icon {
  width: 20px;
  height: 20px;
  margin-inline-end: 4px;
}

.reaction-count {
  color: white;
}
</style>
