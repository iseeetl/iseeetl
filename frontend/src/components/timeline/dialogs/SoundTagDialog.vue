<template>
  <BaseEditDialog
    :visible="visible"
    :sending="sending"
    title-id="sound_tag_dialog_title"
    :title-text="$t('音を鳴らすタグ')"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t('決定')"
    :actions-adjacent="true"
    :progress-amount="progressAmount"
    cancel-test-id="dialog-sound-tag-cancel-desktop"
    mobile-cancel-test-id="dialog-sound-tag-cancel-mobile"
    confirm-test-id="dialog-sound-tag-confirm"
    data-testid="dialog-sound-tag"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <div class="edit-input-field">
      <fieldset>
        <legend class="sound-tag-heading">
          <span class="sound-tag-heading-content">
            <span>{{ $t('タグ') }}</span>
            <span class="sound-tag-actions">
              <UiButton appearance="filled" tone="neutral" :disabled="sending" @click.stop="onPressAllButton">
                {{ $t('一括選択') }}
              </UiButton>
              <UiButton appearance="filled" tone="neutral" :disabled="sending" @click.stop="onPressClearButton">
                {{ $t('一括解除') }}
              </UiButton>
            </span>
          </span>
        </legend>
        <div class="tag-options">
          <label
            v-for="roomTag in [...roomTags].sort((a, b) => a.order - b.order)"
            :key="roomTag._id"
            :for="tagCheckboxId(roomTag._id)"
            class="tag-option"
          >
            <input
              type="checkbox"
              :id="tagCheckboxId(roomTag._id)"
              :data-testid="'sound-tag-checkbox-' + roomTag._id"
              :data-tag-id="roomTag._id"
              :value="roomTag._id"
              v-model="tags"
            />
            <span dir="auto">{{ roomTag.name }}</span>
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
import tagApi from '@/api/tag';
import { appendApiErrorMessage } from '@/api/apiClient';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import UiButton from '@/components/ui/UiButton.vue';

export default {
  emits: ['close', 'success'],
  name: 'SoundTagDialog',
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
    floorId: String,
    roomId: String,
    roomTags: Array,
    soundTagId: String,
    soundTags: Array,
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
  methods: {
    openedDialog() {
      this.tags = Array.isArray(this.soundTags) ? [...this.soundTags] : [];
      this.initialTags = this.tags.slice();
    },

    onPressAllButton() {
      if (this.sending) return;
      const ids = this.roomTags.map((roomTag) => roomTag._id);
      this.tags = ids;
    },

    onPressClearButton() {
      if (this.sending) return;
      this.tags = [];
    },

    onPressCancelButton() {
      if (this.sending) return;
      if (this.hasUnsavedChanges()) {
        this.discardConfirmVisible = true;
        return;
      }
      this.visible = false;
    },

    hasUnsavedChanges() {
      if (this.initialTags === null) return false;
      return JSON.stringify([...this.tags].sort()) !== JSON.stringify([...this.initialTags].sort());
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
      if (this.$store.getters.userIsLogin) {
        this.editSoundTag();
      } else {
        this.editGuestSoundTag();
      }
    },

    editGuestSoundTag() {
      const data = {
        roomId: this.$store.getters.roomId,
        soundTags: this.tags,
      };
      const guestSoundTags = this.$store.getters.guestSoundTags;
      const index = guestSoundTags.findIndex(({ roomId }) => roomId === this.$store.getters.roomId);

      if (index === -1) {
        guestSoundTags.push(data);
      } else {
        guestSoundTags[index] = data;
      }

      this.$store.dispatch('doSetGuestSoundTags', {
        guestSoundTags: guestSoundTags,
      });
      this.$emit('success', { _id: null, tags: this.tags });
    },

    editSoundTag() {
      if (this.sending) return;
      this.sending = true;
      const data = {
        floor_id: this.floorId,
        room_id: this.roomId,
        tags: this.tags,
      };
      if (this.soundTagId !== null) {
        data['_id'] = this.soundTagId;
      }
      const request =
        this.soundTagId === null
          ? tagApi.soundTag.create(data, {
              onUploadProgress: (progressEvent) => {
                this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
              },
            })
          : tagApi.soundTag.update(data, {
              onUploadProgress: (progressEvent) => {
                this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
              },
            });

      request
        .then((res) => {
          this.setSnackbar(this.$t('音を鳴らすタグを更新しました'), 'status');
          this.clearValue();
          this.$emit('success', res.data);
        })
        .catch((e) => {
          const message = appendApiErrorMessage(this.$t('音を鳴らすタグの更新に失敗しました'), e, {
            translate: this.$t,
          });
          this.setSnackbar(message, 'alert');
          return handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
        })
        .finally(() => {
          this.sending = false;
          this.progressAmount = 0;
        });
    },

    clearValue() {
      this.tags = [];
      this.initialTags = null;
      this.discardConfirmVisible = false;
      this.closeAfterDiscard = false;
    },

    closedDialog(payload) {
      if (this.sending) return;

      this.clearValue();

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
.sound-tag-heading {
  width: 100%;
}
.sound-tag-heading-content,
.sound-tag-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.sound-tag-heading-content {
  justify-content: space-between;
}
.sound-tag-actions {
  gap: 8px;
}
.sound-tag-actions :deep(.ui-button) {
  margin: 0;
  font-size: 14px;
}
</style>
