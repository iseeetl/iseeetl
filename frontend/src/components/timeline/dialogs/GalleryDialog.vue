<template>
  <UiDialog
    class="gallery-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="gallery_dialog_title"
    initial-focus="#gallery_dialog_title"
    data-testid="dialog-gallery"
    @request-close="onPressCancelButton"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <h2 id="gallery_dialog_title" ref="titleRef" class="voiceover-hidden" tabindex="-1">
      {{ $t('メディア') }}
    </h2>

    <div class="gallery-content">
      <UiTooltip v-if="downloadName" :text="downloadLabel">
        <UiButton
          class="gallery-download"
          appearance="filled"
          tone="neutral"
          icon-only
          :aria-label="downloadLabel"
          data-testid="dialog-gallery-download-button"
          :disabled="nativeSharePreparing"
          @click="onPressDownloadButton"
        >
          <UiIcon name="download" />
        </UiButton>
      </UiTooltip>

      <img
        v-if="imageName"
        class="gallery-image"
        data-testid="dialog-gallery-image"
        :alt="imageCaption ? imageCaption : $t('投稿された画像')"
        :src="imageUrl"
      />

      <p v-if="downloadError" class="gallery-download-error" role="alert">
        {{ $t('エラーが発生しました') }}
      </p>

      <div v-if="videoName" class="gallery-video">
        <video
          :src="videoUrl"
          controls
          playsinline
          autoplay
        >
          <track
            v-if="videoSubtitleName"
            kind="subtitles"
            :src="'/media/' + $store.getters.floorId + '/' + $store.getters.roomId + '/' + videoSubtitleName"
            :srclang="videoSubTitleLang"
            default
          />
        </video>
      </div>

      <UiTooltip ref="closeButtonTooltipRef" :text="$t('閉じる')">
        <UiButton
          class="gallery-close"
          appearance="filled"
          tone="neutral"
          icon-only
          :aria-label="$t('閉じる')"
          data-testid="dialog-gallery-close"
          @click="onPressCancelButton"
        >
          <UiIcon name="close" />
        </UiButton>
      </UiTooltip>
    </div>
  </UiDialog>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  emits: ['close'],
  name: 'GalleryDialog',
  components: {
    UiButton,
    UiDialog,
    UiIcon,
    UiTooltip,
  },
  props: {
    dialogVisible: Boolean,
    propsValue: Object,
  },
  data() {
    return {
      visible: this.dialogVisible,
      imageName: null,
      imageCaption: null,
      videoName: null,
      videoSubtitleName: null,
      videoSubTitleLang: null,
      nativeSharePreparing: false,
      shareFile: null,
      sharePreparationId: 0,
      downloadError: false,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  computed: {
    imageUrl() {
      if (!this.imageName) return '';
      return '/media/' + this.$store.getters.floorId + '/' + this.$store.getters.roomId + '/' + this.imageName;
    },
    videoUrl() {
      if (!this.videoName) return '';
      return '/media/' + this.$store.getters.floorId + '/' + this.$store.getters.roomId + '/' + this.videoName;
    },
    downloadName() {
      return this.imageName || this.videoName || '';
    },
    downloadUrl() {
      return this.imageUrl || this.videoUrl;
    },
    downloadLabel() {
      if (this.imageName) return this.$t('画像をダウンロード');
      if (this.videoName) return this.$t('動画をダウンロード');
      return '';
    },
    isIosStandalone() {
      return typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true;
    },
  },
  methods: {
    openedDialog() {
      if (this.propsValue.image_name) {
        this.imageName = this.propsValue.image_name;
      }
      if (this.propsValue.image_caption) {
        this.imageCaption = this.propsValue.image_caption;
      }
      if (this.propsValue.video_name) {
        this.videoName = this.propsValue.video_name;
      }
      if (this.propsValue.video_subtitle_name) {
        this.videoSubtitleName = this.propsValue.video_subtitle_name;
      }
      if (this.propsValue.lang) {
        this.videoSubTitleLang = this.propsValue.lang;
      }

      this.prepareNativeImageShare();

      this.$nextTick(() => {
        this.$refs.closeButtonTooltipRef.focusTrigger({ showTooltip: false });
      });
    },

    onPressCancelButton() {
      this.visible = false;
    },

    async prepareNativeImageShare() {
      this.sharePreparationId += 1;
      const preparationId = this.sharePreparationId;
      this.shareFile = null;
      this.downloadError = false;

      if (!this.isIosStandalone || !this.imageUrl || !this.imageName) return;

      const navigatorObject = window.navigator;
      if (
        typeof window.fetch !== 'function' ||
        typeof window.File !== 'function' ||
        typeof navigatorObject.share !== 'function' ||
        typeof navigatorObject.canShare !== 'function'
      ) {
        this.downloadError = true;
        return;
      }

      this.nativeSharePreparing = true;
      try {
        const response = await window.fetch(this.imageUrl, { credentials: 'same-origin' });
        if (!response || !response.ok) throw new Error('IMAGE_SHARE_FETCH_FAILED');

        const blob = await response.blob();
        const file = new window.File([blob], this.imageName, {
          type: blob.type || 'application/octet-stream',
        });
        if (!navigatorObject.canShare({ files: [file] })) throw new Error('IMAGE_FILE_SHARE_UNAVAILABLE');
        if (preparationId !== this.sharePreparationId) return;

        this.shareFile = file;
      } catch {
        if (preparationId === this.sharePreparationId) this.downloadError = true;
      } finally {
        if (preparationId === this.sharePreparationId) this.nativeSharePreparing = false;
      }
    },

    async onPressDownloadButton() {
      if (!this.downloadUrl || !this.downloadName) return;

      if (this.imageName && this.isIosStandalone) {
        if (!this.shareFile) {
          this.downloadError = true;
          return;
        }

        try {
          this.downloadError = false;
          await window.navigator.share({ title: this.imageName, files: [this.shareFile] });
        } catch (error) {
          if (!error || error.name !== 'AbortError') this.downloadError = true;
        }
        return;
      }

      const link = document.createElement('a');
      link.href = this.downloadUrl;
      link.download = this.downloadName;
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
    },

    clearValue() {
      this.imageName = null;
      this.imageCaption = null;
      this.videoName = null;
      this.videoSubtitleName = null;
      this.videoSubTitleLang = null;
      this.nativeSharePreparing = false;
      this.shareFile = null;
      this.sharePreparationId += 1;
      this.downloadError = false;
    },

    closedDialog(payload) {
      this.clearValue();
      this.$emit('close', payload);
    },
  },
};
</script>

<style scoped>
:global(.gallery-dialog .ui-dialog__backdrop) {
  background: rgba(0, 0, 0, 0.84);
}

:global(.gallery-dialog .ui-dialog__panel) {
  width: calc(100vw - 64px);
  height: calc(100vh - 64px);
  height: calc(100dvh - 64px);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #111;
}

:global(.gallery-dialog .ui-dialog__content) {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.gallery-content {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #111;
}

.gallery-image,
.gallery-video {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.gallery-image {
  display: block;
  object-fit: contain;
  -webkit-touch-callout: default;
}

.gallery-video {
  display: flex;
  align-items: center;
  justify-content: center;
}

.gallery-video video {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.gallery-download-error {
  position: absolute;
  bottom: calc(12px + env(safe-area-inset-bottom));
  margin: 0 16px;
  padding: 8px 12px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 4px;
  z-index: 3;
}

.gallery-download,
.gallery-close {
  width: 44px !important;
  min-width: 44px !important;
  max-width: 44px !important;
  height: 44px !important;
  min-height: 44px !important;
  max-height: 44px !important;
  margin: 0 !important;
  padding: 0 !important;
  color: #ffffff !important;
  background: rgba(17, 24, 39, 0.78) !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
  border-radius: 50% !important;
  position: absolute !important;
  top: calc(12px + env(safe-area-inset-top));
  z-index: 3;
}

.gallery-download {
  left: calc(12px + env(safe-area-inset-left));
}

.gallery-close {
  right: calc(12px + env(safe-area-inset-right));
}

@media screen and (max-width: 896px) {
  :global(.gallery-dialog .ui-dialog__panel) {
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    height: calc(100dvh - 16px);
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
  }
}
</style>
