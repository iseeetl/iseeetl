<template>
  <BaseEditDialog
    :visible="visible"
    :sending="sending"
    title-id="edit_tag_dialog_title"
    :title-text="$t('タグ更新')"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t('更新')"
    :progress-amount="progressAmount"
    :actions-adjacent="true"
    cancel-test-id="dialog-edit-tag-cancel-desktop"
    mobile-cancel-test-id="dialog-edit-tag-cancel-mobile"
    confirm-test-id="dialog-edit-tag-submit-desktop"
    mobile-confirm-test-id="dialog-edit-tag-submit-mobile"
    data-testid="dialog-edit-tag"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <div class="edit-input-field">
      <fieldset>
        <legend class="tag-heading">
          <span class="tag-heading-content">
            <span>{{ $t('タグ') }}</span>
            <span class="tag-action-row">
              <UiButton
                appearance="filled"
                tone="neutral"
                :disabled="sending"
                data-testid="dialog-edit-tag-clear"
                @click.stop="clearTags"
              >
                {{ $t('クリア') }}
              </UiButton>
              <UiButton
                appearance="filled"
                tone="neutral"
                :disabled="!hasCopiedTags || sending"
                data-testid="dialog-edit-tag-paste"
                @click.stop="pasteCopiedTags"
              >
                {{ $t('貼り付け') }}
              </UiButton>
            </span>
          </span>
        </legend>
        <div class="tag-options">
          <label
            v-for="roomTag in [...selectableRoomTags].sort((a, b) => a.order - b.order)"
            :key="roomTag._id"
            :for="tagCheckboxId(roomTag._id)"
            class="tag-option"
          >
            <input
              type="checkbox"
              :id="tagCheckboxId(roomTag._id)"
              :value="roomTag._id"
              v-model="tags"
              :data-testid="'dialog-edit-tag-checkbox-' + roomTag._id"
            />
            <span dir="auto">
              {{ getTagName(roomTag) }}
            </span>
          </label>
        </div>
      </fieldset>
    </div>

  </BaseEditDialog>

  <ConfirmDialog
    :dialog-visible="discardConfirmVisible"
    :title="$t('確認')"
    :message="$t('編集中のコンテンツは失われます')"
    :confirm-label="$t('破棄')"
    :cancel-label="$t('キャンセル')"
    confirm-tone="danger"
    confirm-icon="delete"
    :actions-adjacent="true"
    :close-on-escape="true"
    :close-on-backdrop="true"
    @confirm="confirmDiscard"
    @cancel="cancelDiscard"
    @closed="closedDiscardConfirm"
  />
</template>

<script>
import { useId } from 'vue';
import chatApi from '@/api/chat';
import { appendApiErrorMessage } from '@/api/apiClient';
import TranslationUtil from '@/utils/translationUtil';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import UiButton from '@/components/ui/UiButton.vue';

export default {
  emits: ['close', 'success'],
  name: 'EditTagDialog',
  components: {
    BaseEditDialog,
    ConfirmDialog,
    UiButton,
  },
  setup() {
    const tagCheckboxPrefix = useId();
    return {
      tagCheckboxId: (tagId) => `${tagCheckboxPrefix}-tag-checkbox-${tagId}`,
    };
  },
  props: {
    dialogVisible: Boolean,
    propsRoomTags: Array,
    propsPostId: {
      validator: (prop) => typeof prop === 'string' || prop === null,
    },
    propsReplyId: {
      validator: (prop) => typeof prop === 'string' || prop === null,
    },
    propsTags: Array,
  },
  data() {
    return {
      tags: [],
      visible: this.dialogVisible,
      sending: false,
      progressAmount: 0,
      initialTags: null,
      discardConfirmVisible: false,
      closeAfterDiscard: false,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  computed: {
    selectableRoomTags() {
      return Array.isArray(this.propsRoomTags) ? this.propsRoomTags : [];
    },
    submittableTagIds() {
      return Array.isArray(this.tags) ? this.tags : [];
    },
    copyableCopiedTags() {
      const tagIds = new Set(this.selectableRoomTags.map((tag) => tag._id));
      const result = [];
      const copiedTags = this.$store.getters.tagClipboardList || [];
      copiedTags.forEach((tagId) => {
        if (tagIds.has(tagId) && !result.includes(tagId)) {
          result.push(tagId);
        }
      });
      return result;
    },
    hasCopiedTags() {
      return this.copyableCopiedTags.length > 0;
    },
    hasUnsavedChanges() {
      if (this.initialTags === null) return false;
      return JSON.stringify([...this.tags].sort()) !== JSON.stringify([...this.initialTags].sort());
    },
  },
  methods: {
    openedDialog() {
      this.tags = Array.isArray(this.propsTags) ? this.propsTags.slice() : [];
      this.initialTags = this.tags.slice();
    },

    getTagName(tag) {
      return TranslationUtil.getTagName(tag, this.$i18n.locale);
    },

    clearTags() {
      if (this.sending) return;
      this.tags = [];
    },

    pasteCopiedTags() {
      if (!this.hasCopiedTags || this.sending) return;
      this.tags = this.copyableCopiedTags.slice();
      this.setSnackbar(this.$t('タグを貼り付けました'), 'status');
    },

    editTag() {
      this.sending = true;

      const data = {
        room_id: this.$store.getters.roomId,
        room_tags: this.submittableTagIds,
        _id: this.propsReplyId || this.propsPostId,
        ...(this.propsReplyId ? { post_id: this.propsPostId } : {}),
      };

      const request =
        this.propsReplyId === null
          ? chatApi.tagPost(data, {
              onUploadProgress: (progressEvent) => {
                this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
              },
            })
          : chatApi.tagReply(data, {
              onUploadProgress: (progressEvent) => {
                this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
              },
            });

      request
        .then((response) => {
          this.$emit('success', response.data);
          this.sending = false;
          this.visible = false;
        })
        .catch((err) => {
          this.sending = false;
          const message = appendApiErrorMessage(this.$t('タグの更新に失敗しました'), err, { translate: this.$t });
          this.setSnackbar(message, 'alert');

          return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
        })
        .finally(() => {
          this.progressAmount = 0;
        });
    },

    onPressCancelButton() {
      if (this.sending) return;
      if (this.hasUnsavedChanges) {
        this.discardConfirmVisible = true;
        return;
      }
      this.visible = false;
    },

    confirmDiscard() {
      this.closeAfterDiscard = true;
      this.discardConfirmVisible = false;
    },

    cancelDiscard() {
      this.discardConfirmVisible = false;
    },

    closedDiscardConfirm() {
      if (!this.closeAfterDiscard) return;
      this.closeAfterDiscard = false;
      this.visible = false;
    },

    onPressDoneButton() {
      if (this.sending) return;
      this.editTag();
    },

    closedDialog(payload) {
      if (this.sending) return;

      this.initialTags = null;
      this.discardConfirmVisible = false;
      this.closeAfterDiscard = false;
      this.$emit('close', payload);
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },
  },
};
</script>

<style scoped src="@/styles/tag-options.css"></style>
<style scoped>
.tag-heading {
  width: 100%;
}
.tag-heading-content,
.tag-action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.tag-heading-content {
  justify-content: space-between;
}
.tag-action-row {
  gap: 8px;
}
.tag-action-row :deep(.ui-button) {
  margin: 0;
  font-size: 14px;
}
</style>
