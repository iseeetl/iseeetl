<template>
  <ConfirmDialog
    :dialog-visible="visible"
    :title="$t('付加情報削除')"
    title-id="delete_supplement_dialog_title"
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
    initial-focus="[data-testid='dialog-delete-supplement-cancel']"
    cancel-test-id="dialog-delete-supplement-cancel"
    confirm-test-id="dialog-delete-supplement-confirm"
    data-testid="dialog-delete-supplement"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @closed="closedDialog"
  >
    <p>{{ $t('付加情報を削除します') }}</p>
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
  name: 'DeleteSupplementDialog',
  components: {
    ConfirmDialog,
  },
  props: {
    dialogVisible: Boolean,
    propsPostId: {
      validator: (prop) => typeof prop === 'string' || prop === null,
    },
    propsReplyId: {
      validator: (prop) => typeof prop === 'string' || prop === null,
    },
    propsSupplement: Object,
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
      const name = this.resolveActorDisplayName(this.propsSupplement) || '';
      return name ? this.$t('{name}の付加情報', { name }) : '';
    },
    targetContentExcerpt() {
      const content = typeof this.propsSupplement?.content === 'string' ? this.propsSupplement.content.trim() : '';
      return content.length > 160 ? `${content.slice(0, 160)}…` : content;
    },
  },
  methods: {
    ...userDisplayMethods,
    onPressDoneButton() {
      if (this.sending) return;
      this.deleteSupplement();
    },

    onPressCancelButton() {
      if (this.sending) return;
      this.visible = false;
    },

    deleteSupplement() {
      this.sending = true;
      const presentationAnimation = this.propsSupplement?.animation;
      const data = {
        room_id: this.$store.getters.roomId,
        post_id: this.propsPostId,
        _id: this.propsSupplement._id,
      };
      if (this.propsPostId !== null) data.post_id = this.propsPostId;
      if (this.propsReplyId !== null) data.reply_id = this.propsReplyId;

      const request =
        this.propsReplyId === null
          ? chatApi.deleteSupplement(data, {
              onUploadProgress: (progressEvent) => {
                this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
              },
            })
          : chatApi.deleteReplySupplement(data, {
              onUploadProgress: (progressEvent) => {
                this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
              },
            });

      return request
        .then(() => {
          this.$emit('content-deleted', {
            contentType: 'supplement',
            actionType: 'delete',
            presentationAnimation,
          });
          this.sending = false;
          this.visible = false;
        })
        .catch((e) => {
          this.sending = false;
          let message = appendApiErrorMessage(this.$t('付加情報の削除に失敗しました'), e, { translate: this.$t });
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
