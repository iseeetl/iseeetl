<template>
  <div>
    <BaseEditDialog
      class="room-edit-dialog"
      ref="dialogRootRef"
      v-model:visible="visible"
      :sending="sending"
      :title-id="'edit_room_dialog_title'"
      :title-text="dialogTitle"
      :description-ids="editDialogDescriptionIds"
      :cancel-label="$t('キャンセル')"
      :confirm-label="dialogConfirmLabel"
      :progress-amount="progressAmount"
      actions-adjacent
      initial-focus="#room_title"
      @opened="openedDialog"
      @closed="closedDialog"
      @cancel="onPressCancelButton"
      @confirm="onPressDoneButton"
    >
      <DialogTargetContext
        v-if="showTargetContext"
        :context-id="targetContextId"
        :label="$t('対象ルーム')"
        :name="targetName || room.title || ''"
      />

      <div class="room-edit-section">
        <h3 class="room-edit-section__title">{{ $t('基本情報') }}</h3>
        <div class="edit-input-field">
          <UiField
            control-id="room_title"
            counter
            :label="`${$t('タイトル')} ${$t('必須')} ${$t('100文字まで')}`"
            :invalid="v$.title.$dirty && v$.title.$invalid"
            :error="titleError"
          >
            <template #default="{ controlAttrs }">
              <input
                v-bind="controlAttrs"
                ref="inputFieldTitle"
                v-model="title"
                dir="auto"
                class="edit-room-title"
                maxlength="100"
                :disabled="sending"
                aria-required="true"
                required
                @blur="v$.title.$touch()"
              />
            </template>
          </UiField>
        </div>

        <div class="edit-input-field">
          <UiField
            control-id="room_description"
            counter
            :label="`${$t('説明')} ${$t('200文字まで')}`"
            :invalid="v$.description.$dirty && v$.description.$invalid"
            :error="descriptionError"
          >
            <template #default="{ controlAttrs }">
              <textarea
                v-bind="controlAttrs"
                ref="inputFieldDescription"
                v-model="description"
                dir="auto"
                maxlength="200"
                :disabled="sending"
                @blur="v$.description.$touch()"
              ></textarea>
            </template>
          </UiField>
        </div>
      </div>

      <div class="room-edit-section">
        <h3 class="room-edit-section__title">{{ $t('画像') }}</h3>
        <div class="edit-input-field">
          <fieldset class="image-input-fieldset">
            <legend class="screen-reader-only">{{ $t('画像データを添付する') }}</legend>

            <div class="media-wrapper">
              <UiTooltip v-if="imageBase64 === null" :text="$t('画像データを添付する')">
                <UiButton
                  ref="imageSelectButton"
                  class="media-button"
                  icon-only
                  :aria-label="$t('画像データを添付する')"
                  :disabled="sending"
                  @click.stop="pressEnterOnInputImageFile"
                >
                  <UiIcon name="photo" />
                </UiButton>
              </UiTooltip>
              <input
                ref="inputImageFile"
                type="file"
                class="display-none-input"
                :accept="allowedImageTypes"
                :disabled="sending"
                @change="changeImageFile"
              />
            </div>

            <div class="image-wrapper">
              <div class="image-preview-wrapper" v-if="imageBase64 !== null">
                <img :src="imageBase64" alt="" />
                <UiTooltip :text="imageSelectionCancelLabel">
                  <UiButton
                    class="image-remove-button"
                    :aria-label="imageSelectionCancelLabel"
                    :disabled="sending"
                    @click="removeImageFile"
                  >
                    <UiIcon name="clear" :size="18" />
                    {{ imageSelectionCancelLabel }}
                  </UiButton>
                </UiTooltip>
              </div>
              <div class="image-uploaded-wrapper" v-else-if="imageName !== null">
                <img :src="`/media/${floorId}/${id}/${imageName}`" alt="" />
                <UiTooltip :text="$t('imageAttachment.delete')">
                  <UiButton
                    class="image-remove-button"
                    :aria-label="$t('imageAttachment.delete')"
                    :disabled="sending"
                    @click="deleteUploadedImageFile"
                  >
                    <UiIcon name="delete" :size="18" />
                    {{ $t('imageAttachment.delete') }}
                  </UiButton>
                </UiTooltip>
              </div>
            </div>
          </fieldset>
        </div>
      </div>

      <div class="room-edit-section">
        <h3 class="room-edit-section__title">{{ $t('参加・投稿設定') }}</h3>
        <div class="edit-input-field">
          <input
            type="checkbox"
            id="guest_reaction_only"
            class="input-checkbox"
            :true-value="true"
            :false-value="false"
            :disabled="sending"
            v-model="guestReactionOnly"
          />
          <label class="input-checkbox-label" for="guest_reaction_only">
            {{ $t('ゲストはリアクションのみ') }}
          </label>
        </div>

        <div class="edit-input-field">
          <input
            type="checkbox"
            id="member_only"
            class="input-checkbox"
            :true-value="true"
            :false-value="false"
            :disabled="sending"
            v-model="memberOnly"
          />
          <label class="input-checkbox-label" for="member_only">{{ $t('招待メンバーのみ') }}</label>
        </div>
      </div>

      <div class="room-edit-section">
        <h3 class="room-edit-section__title">{{ $t('表示・通知') }}</h3>
        <div class="edit-input-field">
          <input
            type="checkbox"
            id="notification"
            class="input-checkbox"
            :true-value="true"
            :false-value="false"
            :disabled="sending"
            v-model="notification"
          />
          <label class="input-checkbox-label" for="notification">{{ $t('タイムライン最上部に通知する') }}</label>
        </div>

        <div class="edit-input-field">
          <input
            type="checkbox"
            id="external_sns_button"
            class="input-checkbox"
            :true-value="true"
            :false-value="false"
            :disabled="sending"
            v-model="showExternalShareButton"
          />
          <label class="input-checkbox-label" for="external_sns_button">
            {{ $t('外部SNS連携ボタンを表示する') }}
          </label>
        </div>

        <div class="edit-input-field">
          <input
            type="checkbox"
            id="hidden_flg"
            class="input-checkbox"
            :true-value="true"
            :false-value="false"
            :disabled="sending"
            v-model="roomDisplayHidden"
          />
          <label class="input-checkbox-label" for="hidden_flg">{{ $t('非表示にする') }}</label>
        </div>

        <div v-if="managementMode && showLifecycleControl" class="edit-input-field">
          <input
            type="checkbox"
            id="delete_flg"
            class="checkbox-input"
            v-model="deleteFlg"
            :true-value="true"
            :false-value="false"
            :disabled="sending"
          />
          <label class="checkbox-label" for="delete_flg">
            {{ $t('論理削除') }}
          </label>
        </div>
      </div>
    </BaseEditDialog>

    <ConfirmDialog
      :dialog-visible="discardConfirmVisible"
      :title="$t('破棄')"
      :message="$t('編集中のコンテンツは失われます')"
      :confirm-label="$t('破棄')"
      :cancel-label="$t('キャンセル')"
      :actions-adjacent="true"
      :close-on-escape="true"
      :close-on-backdrop="true"
      confirm-icon="delete"
      @confirm="confirmDiscard"
      @cancel="cancelDiscard"
      @closed="handleDiscardConfirmationClosed"
    />
  </div>
</template>

<script>
import roomApi from '@/api/room';
import uploadApi from '@/api/upload';
import { appendApiErrorMessage } from '@/api/apiClient';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, maxLength } from '@vuelidate/validators';
import loadImage from 'blueimp-load-image';
import { ALLOWED_IMAGE_TYPES, isAllowedImageFile, isImageSizeWithinLimit } from '@/constants/mediaConstants';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  emits: ['close', 'success'],
  name: 'EditRoomDialog',
  components: {
    BaseEditDialog,
    ConfirmDialog,
    DialogTargetContext,
    UiButton,
    UiField,
    UiIcon,
    UiTooltip,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  props: {
    dialogVisible: Boolean,
    room: Object,
    targetName: {
      type: String,
      default: '',
    },
    managementMode: Boolean,
    showLifecycleControl: {
      type: Boolean,
      default: true,
    },
  },
  validations: {
    title: {
      required,
      maxLength: maxLength(100),
    },
    description: {
      maxLength: maxLength(200),
    },
  },
  data() {
    return {
      id: null,
      floorId: null,
      title: null,
      description: null,
      lang: null,
      imageBase64: null,
      imageFile: null,
      imageName: null,
      imageProcessing: false,
      imageLoadRequestVersion: 0,
      guestReactionOnly: false,
      memberOnly: false,
      notification: true,
      showExternalShareButton: false,
      roomDisplayHidden: false,
      deleteFlg: false,

      visible: false,
      sending: false,
      progressAmount: 0,
      initialFormSnapshot: null,
      discardConfirmVisible: false,
      closeAfterDiscardConfirmation: false,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  computed: {
    dialogTitle() {
      return this.room ? this.$t('ルームを編集') : this.$t('ルームを作成');
    },
    dialogConfirmLabel() {
      if (this.managementMode || this.room) return this.$t('managementUi.save');
      return this.$t('作成');
    },
    showTargetContext() {
      return Boolean(this.room);
    },
    targetContextId() {
      return 'edit_room_dialog_context';
    },
    editDialogDescriptionIds() {
      return this.showTargetContext ? this.targetContextId : '';
    },
    hasUnsavedChanges() {
      return this.initialFormSnapshot !== null && this.initialFormSnapshot !== this.createFormSnapshot();
    },
    allowedImageTypes() {
      return ALLOWED_IMAGE_TYPES.join(',');
    },
    imageSelectionCancelLabel() {
      return this.$t(this.imageName ? 'imageAttachment.cancelReplacement' : 'imageAttachment.cancel');
    },
    titleError() {
      const field = this.v$.title;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('必須');
      if (field.maxLength.$invalid) return this.$t('100文字まで');
      return '';
    },
    descriptionError() {
      const field = this.v$.description;
      if (!field.$dirty) return '';
      if (field.maxLength.$invalid) return this.$t('200文字まで');
      return '';
    },
  },
  methods: {
    openedDialog() {
      this.discardConfirmVisible = false;
      this.closeAfterDiscardConfirmation = false;
      if (this.room !== null) {
        this.id = this.room._id;
        this.floorId = this.room.floor;
        this.title = this.room.title;
        this.description = this.room.description;
        this.lang = this.room.lang ? this.room.lang : 'ja'; // 言語未設定の既存データは日本語として扱う。
        this.imageName = this.room.image_name;
        this.guestReactionOnly =
          typeof this.room.guest_reaction_only !== 'undefined' ? this.room.guest_reaction_only : false;
        this.memberOnly = this.room.member_only;
        this.notification = this.room.notification;
        this.showExternalShareButton = Boolean(this.room.external_sns_button);
        this.roomDisplayHidden = this.room.room_display_hidden;
        this.deleteFlg = this.room.delete_flg;
      } else {
        this.floorId = this.$store.getters.floorId;
        this.lang = this.$store.getters.lang;
      }
      this.initialFormSnapshot = this.createFormSnapshot();
    },

    createFormSnapshot() {
      return JSON.stringify({
        title: this.normalizeSnapshotText(this.title),
        description: this.normalizeSnapshotText(this.description),
        imageName: this.normalizeSnapshotText(this.imageName),
        hasSelectedImage: this.imageFile !== null || this.imageProcessing,
        guestReactionOnly: Boolean(this.guestReactionOnly),
        memberOnly: Boolean(this.memberOnly),
        notification: Boolean(this.notification),
        showExternalShareButton: Boolean(this.showExternalShareButton),
        roomDisplayHidden: Boolean(this.roomDisplayHidden),
        deleteFlg: Boolean(this.deleteFlg),
      });
    },

    normalizeSnapshotText(value) {
      return value === null || typeof value === 'undefined' ? '' : String(value);
    },

    pressEnterOnInputImageFile() {
      this.$refs.inputImageFile.click();
    },
    changeImageFile(event) {
      event.preventDefault();

      const file = event.target.files[0];
      if (typeof file === 'undefined') return;
      if (!isAllowedImageFile(file)) {
        this.invalidateImageLoad();
        this.setSnackbar(`${this.$t('対象ファイルではありません')} ${ALLOWED_IMAGE_TYPES.join(',')}`, 'alert');
        this.clearNativeImageInput();
        return;
      }

      const requestVersion = ++this.imageLoadRequestVersion;
      this.imageProcessing = true;

      loadImage(
        file,
        (canvas) => {
          if (requestVersion !== this.imageLoadRequestVersion) return;

          const base64 = canvas.toDataURL('image/jpeg', 0.5);
          const bin = atob(base64.replace(/^.*,/, ''));
          let buffer = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) {
            buffer[i] = bin.charCodeAt(i);
          }
          const blob = new Blob([buffer.buffer], { type: 'image/jpeg' });
          if (!isImageSizeWithinLimit(blob.size)) {
            this.setSnackbar(this.$t('メディアのファイルサイズが上限を超えています。'), 'alert');
            this.clearNativeImageInput();
            this.imageProcessing = false;
            return;
          }
          this.imageBase64 = base64;
          this.imageFile = blob;
          this.imageProcessing = false;
        },
        {
          maxHeight: 400,
          maxWidth: 400,
          canvas: true,
        }
      );
    },
    async removeImageFile() {
      this.clearImageSelection();
      await this.$nextTick();
      this.focusImageSelectButton();
    },
    clearNativeImageInput() {
      if (this.$refs.inputImageFile) this.$refs.inputImageFile.value = '';
    },
    clearImageSelection() {
      this.invalidateImageLoad();
      this.clearNativeImageInput();
      this.imageBase64 = null;
      this.imageFile = null;
    },
    invalidateImageLoad() {
      this.imageLoadRequestVersion += 1;
      this.imageProcessing = false;
    },
    focusImageSelectButton() {
      const button = this.$refs.imageSelectButton;
      if (button && typeof button.focus === 'function') button.focus();
    },
    async deleteUploadedImageFile() {
      this.imageName = null;
      await this.$nextTick();
      this.focusImageSelectButton();
    },

    async create() {
      this.sending = true;

      try {
        const createData = {
          floor_id: this.floorId,
          title: this.title,
          description: this.description,
          lang: this.lang,
          guest_reaction_only: this.guestReactionOnly,
          member_only: this.memberOnly,
          room_display_hidden: this.roomDisplayHidden,
          notification: this.notification,
          external_sns_button: this.showExternalShareButton,
        };
        const createResponse = await roomApi.create(createData, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        });
        const createdRoom = createResponse.data;
        this.progressAmount = 0;

        if (this.imageFile) {
          const formData = new FormData();
          formData.append('floor_id', createdRoom.floor);
          formData.append('_id', createdRoom._id);
          formData.append('image_file', this.imageFile, 'image.jpg');
          const fileUploadResponse = await uploadApi.uploadRoomImage(formData, {
            onUploadProgress: (progressEvent) => {
              this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
            },
          });
          this.progressAmount = 0;

          const uploadedImageName = fileUploadResponse.data.image_name;
          const updateData = {
            _id: createdRoom._id,
            title: createdRoom.title,
            description: createdRoom.description,
            lang: createdRoom.lang,
            image_name: uploadedImageName,
            guest_reaction_only: createdRoom.guest_reaction_only,
            member_only: createdRoom.member_only,
            room_display_hidden: createdRoom.room_display_hidden,
            notification: createdRoom.notification,
            external_sns_button: createdRoom.external_sns_button,
          };
          const updateResponse = await roomApi.update(
            updateData,
            { management: this.managementMode },
            {
              onUploadProgress: (progressEvent) => {
                this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
              },
            }
          );
          this.imageName = uploadedImageName;
          this.clearImageSelection();
          this.$emit('success', updateResponse.data);
        } else {
          this.$emit('success', createdRoom);
        }

        this.setSnackbar(this.$t('ルームを作成しました'), 'status');
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('ルームの作成に失敗しました'), err, { translate: this.$t });
        this.setSnackbar(message, 'alert');
        if (this.handleAuthError(err)) return;
      } finally {
        this.sending = false;
        this.progressAmount = 0;
      }
    },

    async update() {
      try {
        this.sending = true;

        let imageNameForUpdate = this.imageName;
        if (this.imageFile) {
          const formData = new FormData();
          formData.append('floor_id', this.floorId);
          formData.append('_id', this.id);
          formData.append('image_file', this.imageFile, 'image.jpg');
          const fileUploadResponse = await uploadApi.uploadRoomImage(formData, {
            onUploadProgress: (progressEvent) => {
              this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
            },
          });
          imageNameForUpdate = fileUploadResponse.data.image_name;
          this.progressAmount = 0;
        }
        const updateData = {
          _id: this.id,
          title: this.title,
          description: this.description,
          lang: this.lang,
          image_name: imageNameForUpdate,
          guest_reaction_only: this.guestReactionOnly,
          member_only: this.memberOnly,
          room_display_hidden: this.roomDisplayHidden,
          notification: this.notification,
          external_sns_button: this.showExternalShareButton,
        };
        if (this.deleteFlg !== null) {
          updateData['delete_flg'] = this.deleteFlg;
        }
        const updateResponse = await roomApi.update(
          updateData,
          { management: this.managementMode },
          {
            onUploadProgress: (progressEvent) => {
              this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
            },
          }
        );
        this.imageName = imageNameForUpdate;
        this.clearImageSelection();
        this.$emit('success', updateResponse.data);

        this.setSnackbar(this.$t('ルームを更新しました'), 'status');
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('ルームの更新に失敗しました'), err, { translate: this.$t });
        this.setSnackbar(message, 'alert');
        if (this.handleAuthError(err)) return;
      } finally {
        this.sending = false;
        this.progressAmount = 0;
      }
    },

    onPressCancelButton() {
      if (this.sending) return;
      if (this.hasUnsavedChanges) {
        this.discardConfirmVisible = true;
        return;
      }
      this.invalidateImageLoad();
      this.visible = false;
    },

    confirmDiscard() {
      this.closeAfterDiscardConfirmation = true;
      this.discardConfirmVisible = false;
    },

    cancelDiscard() {
      this.closeAfterDiscardConfirmation = false;
      this.discardConfirmVisible = false;
    },

    handleDiscardConfirmationClosed() {
      if (!this.closeAfterDiscardConfirmation) return;
      this.closeAfterDiscardConfirmation = false;
      this.invalidateImageLoad();
      this.visible = false;
    },

    focusFirstInvalidField() {
      const target = this.v$.title.$invalid ? this.$refs.inputFieldTitle : this.$refs.inputFieldDescription;
      if (!target) return;
      if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });
      if (typeof target.focus === 'function') target.focus();
    },

    onPressDoneButton() {
      this.v$.$touch();
      if (this.v$.$invalid) {
        this.$nextTick(() => this.focusFirstInvalidField());
        return;
      }
      if (this.sending) return;
      if (this.imageProcessing) return;
      if (this.managementMode && !this.id) return;

      if (this.room) {
        this.update();
      } else {
        this.create();
      }
    },

    clearValue() {
      this.v$.$reset();
      this.id = null;
      this.floorId = null;
      this.title = null;
      this.description = null;
      this.lang = null;
      this.clearImageSelection();
      this.imageName = null;
      this.guestReactionOnly = false;
      this.memberOnly = false;
      this.roomDisplayHidden = false;
      this.notification = true;
      this.showExternalShareButton = false;
      this.deleteFlg = false;
      this.initialFormSnapshot = null;
      this.discardConfirmVisible = false;
      this.closeAfterDiscardConfirmation = false;
    },

    closedDialog() {
      this.clearValue();
      if (!this.sending) {
        this.$emit('close');
      }
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },

    handleAuthError(err) {
      return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
    },
  },
};
</script>

<style scoped>
@media screen and (max-width: 896px) {
  :global(.room-edit-dialog) {
    --ui-dialog-width: 600px;
  }
}

.room-edit-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ddd;
}

.room-edit-section__title {
  margin: 0 8px 4px;
  font-size: 16px;
}

.input-checkbox {
  margin-inline-end: 0;
}
.input-checkbox-label {
  padding-block: 0;
  padding-inline: 2px 10px;
  height: 20px;
  line-height: 20px;
  font-size: 16px;
}
.image-preview-wrapper,
.image-uploaded-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  margin-top: 12px;
}
.image-wrapper img {
  display: block;
  width: 100%;
  max-height: 280px;
  object-fit: contain;
  background: var(--ui-color-cancel);
  border: 1px solid var(--ui-color-border);
  border-radius: 4px;
}
.image-remove-button {
  margin: 0;
  min-height: 44px;
  max-width: 100%;
  padding: 8px 12px;
  gap: 6px;
  border: 1px solid var(--ui-color-border);
  white-space: normal;
  text-align: start;
}

.media-button {
  margin-block: 0;
  margin-inline: 0 8px;
  padding: 2px;
  border: 1px solid #ccc;
  background: #fafafa;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
}
.media-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media screen and (max-width: 896px) {
  :global(.room-edit-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
