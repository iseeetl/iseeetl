<template>
  <ConfirmDialog
    :dialog-visible="visible"
    :title="$t('返信削除')"
    title-id="delete_reply_dialog_title"
    :confirm-label="$t('削除')"
    :cancel-label="$t('キャンセル')"
    confirm-tone="danger"
    confirm-icon="delete"
    :sending="sending"
    :close-on-confirm="false"
    :close-on-escape="true"
    :close-on-backdrop="true"
    :actions-adjacent="true"
    progress-mode="determinate"
    :progress-amount="progressAmount"
    initial-focus="[data-testid='dialog-delete-reply-cancel']"
    cancel-test-id="dialog-delete-reply-cancel"
    confirm-test-id="dialog-delete-reply-confirm"
    data-testid="dialog-delete-reply"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @closed="closedDialog"
  >
    <p>{{ $t('返信を削除します') }}</p>
    <div v-if="targetAttribution || targetContentExcerpt" class="delete-target-summary">
      <strong v-if="targetAttribution" dir="auto">{{ targetAttribution }}</strong>
      <blockquote v-if="targetContentExcerpt" dir="auto">{{ targetContentExcerpt }}</blockquote>
    </div>
  </ConfirmDialog>
</template>

<script>
import chatApi from '@/api/chat';
import { appendApiErrorMessage } from '@/api/apiClient';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  emits: ['close', 'content-deleted'],
  name: 'DeleteReplyDialog',
  components: {
    ConfirmDialog,
  },
  props: {
    dialogVisible: Boolean,
    propsPostId: String,
    propsReplyValue: Object,
  },
  data() {
    return {
      visible: this.dialogVisible,
      sending: false,
      progressAmount: 0,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  computed: {
    targetAttribution() {
      const name = this.resolveActorDisplayName(this.propsReplyValue) || '';
      return name ? this.$t('{name}の返信', { name }) : '';
    },
    targetContentExcerpt() {
      const content = typeof this.propsReplyValue?.content === 'string' ? this.propsReplyValue.content.trim() : '';
      return content.length > 160 ? `${content.slice(0, 160)}…` : content;
    },
  },
  methods: {
    ...userDisplayMethods,
    onPressDoneButton() {
      if (this.sending) return;
      this.deleteReply();
    },

    onPressCancelButton() {
      if (this.sending) return;
      this.visible = false;
    },

    deleteReply() {
      this.sending = true;
      const presentationAnimation = this.propsReplyValue?.animation;
      const previousTagIds = Array.isArray(this.propsReplyValue?.room_tags)
        ? [...this.propsReplyValue.room_tags]
        : [];
      const data = {
        room_id: this.$store.getters.roomId,
        post_id: this.propsPostId,
        _id: this.propsReplyValue._id,
      };

      return chatApi
        .deleteReply(data, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        })
        .then(() => {
          this.$emit('content-deleted', {
            contentType: 'reply',
            actionType: 'delete',
            presentationAnimation,
            previousTagIds,
          });
          this.sending = false;
          this.visible = false;
        })
        .catch((e) => {
          this.sending = false;
          let message = appendApiErrorMessage(this.$t('返信の削除に失敗しました'), e, { translate: this.$t });
          this.setSnackbar(message, 'alert');

          return handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
        })
        .finally(() => {
          this.progressAmount = 0;
        });
    },

    closedDialog(payload) {
      if (this.sending) return;

      this.$emit('close', payload);
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },
  },
};
</script>

<style scoped>
.delete-target-summary {
  overflow-wrap: anywhere;
}

.delete-target-summary blockquote {
  margin: 8px 0 0;
  padding-inline-start: 12px;
  border-inline-start: 3px solid var(--ui-color-border, #ccc);
  white-space: pre-wrap;
}
</style>
