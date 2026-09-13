<template>
  <div>
    <BaseEditDialog
      class="floor-edit-dialog"
      ref="dialogRootRef"
      v-model:visible="visible"
      :sending="sending"
      :title-id="'edit_floor_dialog_title'"
      :title-text="dialogTitle"
      :description-ids="editDialogDescriptionIds"
      :cancel-label="$t('キャンセル')"
      :confirm-label="dialogConfirmLabel"
      :progress-amount="progressAmount"
      actions-adjacent
      initial-focus="#edit_floor_title"
      @opened="openedDialog"
      @closed="closedDialog"
      @cancel="onPressCancelButton"
      @confirm="onPressDoneButton"
    >
      <DialogTargetContext
        v-if="showTargetContext"
        :context-id="targetContextId"
        :label="$t('対象フロア')"
        :name="targetName || propsFloor.title || ''"
      />

      <div class="floor-edit-section">
        <h3 class="floor-edit-section__title">{{ $t('基本情報') }}</h3>
        <div class="edit-input-field">
          <UiField
            control-id="edit_floor_title"
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
            control-id="edit_floor_description"
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

        <div v-if="googleTranslateAvailable" class="edit-input-field">
          <fieldset>
            <legend>{{ $t('自動翻訳') }}</legend>
            <div v-for="language in LANGUAGES" :key="language.value" class="checkbox-group">
              <input
                :id="language.value"
                v-model="target_langs"
                type="checkbox"
                :value="language.value"
                :disabled="sending"
              />
              <label :for="language.value">{{ $t(language.label) }}</label>
            </div>
          </fieldset>
        </div>
      </div>

      <div class="floor-edit-section">
        <h3 class="floor-edit-section__title">{{ $t('画像') }}</h3>
        <div class="edit-input-field">
          <fieldset class="image-input-fieldset">
            <legend class="screen-reader-only">{{ $t('画像データを添付する') }}</legend>

            <div class="media-wrapper">
              <UiTooltip :text="$t('画像データを添付する')">
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
                <img :src="'/media/' + id + '/' + imageName" alt="" />
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

      <div class="floor-edit-section">
        <h3 class="floor-edit-section__title">{{ $t('表示・通知') }}</h3>
        <div class="edit-input-field">
          <input
            id="floor_display_hidden"
            v-model="floorDisplayHidden"
            class="checkbox-input"
            type="checkbox"
            :true-value="true"
            :false-value="false"
            :disabled="sending"
          />
          <label for="floor_display_hidden" class="checkbox-label">{{ $t('非表示にする') }}</label>
        </div>

        <div v-if="managementMode && showLifecycleControl" class="edit-input-field">
          <input
            id="delete_flg"
            v-model="deleteFlg"
            class="checkbox-input"
            type="checkbox"
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
import floorApi from '@/api/floor';
import uploadApi from '@/api/upload';
import { appendApiErrorMessage } from '@/api/apiClient';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, maxLength } from '@vuelidate/validators';
import loadImage from 'blueimp-load-image';
import { LANGUAGES } from '@/constants/languages';
import { ALLOWED_IMAGE_TYPES, isAllowedImageFile, isImageSizeWithinLimit } from '@/constants/mediaConstants';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  emits: ['close', 'success'],
  name: 'EditFloorDialog',
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
    propsFloor: Object,
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
      title: null,
      description: null,
      lang: null,
      target_langs: ['ja', 'en'],
      translations: [],
      imageBase64: null,
      imageFile: null,
      imageName: null,
      imageProcessing: false,
      imageLoadRequestVersion: 0,
      floorDisplayHidden: false,
      deleteFlg: null,

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
      return this.propsFloor ? this.$t('フロアを編集') : this.$t('フロアを作成');
    },
    dialogConfirmLabel() {
      if (this.managementMode || this.propsFloor) return this.$t('managementUi.save');
      return this.$t('作成');
    },
    showTargetContext() {
      return Boolean(this.propsFloor);
    },
    targetContextId() {
      return 'edit_floor_dialog_context';
    },
    editDialogDescriptionIds() {
      return this.showTargetContext ? this.targetContextId : '';
    },
    hasUnsavedChanges() {
      return this.initialFormSnapshot !== null && this.initialFormSnapshot !== this.createFormSnapshot();
    },
    googleTranslateAvailable() {
      return this.$store.getters.googleTranslateAvailable;
    },
    targetLangsForSave() {
      if (!this.googleTranslateAvailable && !this.propsFloor) return [];
      return this.target_langs;
    },
    LANGUAGES() {
      return LANGUAGES;
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
      if (this.propsFloor) {
        this.id = this.propsFloor._id;
        this.title = this.propsFloor.title;
        this.description = this.propsFloor.description;
        // 既存データの未設定項目は、言語を日本語、翻訳情報を空配列で補う。
        this.lang = this.propsFloor.lang ? this.propsFloor.lang : 'ja';
        this.target_langs = this.propsFloor.target_langs ? [...this.propsFloor.target_langs] : [];
        this.translations = this.propsFloor.translations ? this.propsFloor.translations : [];
        this.imageName = this.propsFloor.image_name;
        this.floorDisplayHidden = this.propsFloor.floor_display_hidden;
        this.deleteFlg = this.propsFloor.delete_flg;
      } else {
        this.lang = this.$store.getters.lang;
      }
      this.initialFormSnapshot = this.createFormSnapshot();
    },

    createFormSnapshot() {
      return JSON.stringify({
        title: this.normalizeSnapshotText(this.title),
        description: this.normalizeSnapshotText(this.description),
        targetLangs: [...this.target_langs].map(String).sort(),
        imageName: this.normalizeSnapshotText(this.imageName),
        hasSelectedImage: this.imageFile !== null || this.imageProcessing,
        floorDisplayHidden: Boolean(this.floorDisplayHidden),
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

          const base64 = canvas.toDataURL('image/jpeg', 0.8);
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
          maxWidth: 800,
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

    async create() {
      this.sending = true;

      try {
        const createData = {
          title: this.title,
          description: this.description,
          lang: this.$store.getters.lang,
          target_langs: this.targetLangsForSave,
          floor_display_hidden: this.floorDisplayHidden,
        };

        const createResponse = await floorApi.create(createData, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        });
        const createdFloor = createResponse.data;
        this.progressAmount = 0;

        // 画像の保存先にフロアIDが必要なため、フロアの作成後にアップロードする。
        if (this.imageFile) {
          const formData = new FormData();
          formData.append('_id', createdFloor._id);
          formData.append('image_file', this.imageFile, 'image.jpg');
          const fileUploadResponse = await uploadApi.uploadFloorImage(formData, {
            onUploadProgress: (progressEvent) => {
              this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
            },
          });
          this.progressAmount = 0;

          const uploadedImageName = fileUploadResponse.data.image_name;
          const updateData = {
            _id: createdFloor._id,
            title: createdFloor.title,
            description: createdFloor.description,
            lang: this.$store.getters.lang,
            target_langs: this.targetLangsForSave,
            image_name: uploadedImageName,
            floor_display_hidden: createdFloor.floor_display_hidden,
          };
          const updateResponse = await floorApi.update(
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
          this.$emit('success', createdFloor);
        }

        this.setSnackbar(this.$t('フロアを作成しました'), 'status');

        this.visible = false;
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('フロアの作成に失敗しました'), err, { translate: this.$t });
        this.setSnackbar(message, 'alert');

        if (this.handleAuthError(err)) return;
      } finally {
        this.sending = false;
        this.progressAmount = 0;
      }
    },

    async update() {
      this.sending = true;

      try {
        let imageNameForUpdate = this.imageName;
        if (this.imageFile) {
          const formData = new FormData();
          formData.append('_id', this.id);
          formData.append('image_file', this.imageFile, 'image.jpg');
          const fileUploadResponse = await uploadApi.uploadFloorImage(formData, {
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
          lang: this.lang, // 翻訳元の言語は編集前の値を維持する。
          target_langs: this.targetLangsForSave,
          image_name: imageNameForUpdate,
          floor_display_hidden: this.floorDisplayHidden,
        };
        if (this.deleteFlg !== null) {
          updateData['delete_flg'] = this.deleteFlg;
        }
        const updateResponse = await floorApi.update(
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

        this.setSnackbar(this.$t('フロアを更新しました'), 'status');

        this.visible = false;
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('フロアの更新に失敗しました'), err, { translate: this.$t });
        this.setSnackbar(message, 'alert');

        if (this.handleAuthError(err)) return;
      } finally {
        this.sending = false;
        this.progressAmount = 0;
      }
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

      if (this.propsFloor) {
        this.update();
      } else {
        this.create();
      }
    },

    clearValue() {
      this.v$.$reset();
      this.id = null;
      this.title = null;
      this.description = null;
      this.lang = null;
      this.target_langs = ['ja', 'en'];
      this.clearImageSelection();
      this.imageName = null;
      this.floorDisplayHidden = false;
      this.deleteFlg = null;
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
  :global(.floor-edit-dialog) {
    --ui-dialog-width: 600px;
  }
}

.floor-edit-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ddd;
}

.floor-edit-section__title {
  margin: 0 8px 4px;
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
  margin: 0;
  margin-inline-end: 8px;
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
  :global(.floor-edit-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
