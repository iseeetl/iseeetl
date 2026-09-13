<template>
  <figure class="timeline-audio-player">
    <div class="timeline-audio-player__row">
      <audio :src="src" :aria-label="audioTitle || null" :preload="preload" controls></audio>

      <UiTooltip :text="$t('音声をダウンロード')">
        <UiButton
          class="timeline-audio-player__download"
          appearance="filled"
          tone="neutral"
          icon-only
          :aria-label="$t('音声をダウンロード')"
          :data-testid="downloadTestId || undefined"
          @click.stop="onPressDownloadButton"
        >
          <UiIcon name="download" />
        </UiButton>
      </UiTooltip>
    </div>

    <figcaption v-if="description" class="timeline-audio-player__description" dir="auto">
      {{ description }}
    </figcaption>
  </figure>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

const PRELOAD_VALUES = ['none', 'metadata', 'auto'];

export default {
  name: 'TimelineAudioPlayer',
  components: {
    UiButton,
    UiIcon,
    UiTooltip,
  },
  props: {
    src: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    audioTitle: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    preload: {
      type: String,
      default: 'none',
      validator: (value) => PRELOAD_VALUES.includes(value),
    },
    downloadTestId: {
      type: String,
      default: '',
    },
  },
  methods: {
    onPressDownloadButton() {
      const link = document.createElement('a');
      link.href = this.src;
      link.download = this.fileName;
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
    },
  },
};
</script>

<style scoped>
.timeline-audio-player {
  width: 100%;
  max-width: 448px;
  margin: 0;
}

.timeline-audio-player__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
}

.timeline-audio-player audio {
  flex: 1 1 auto;
  width: calc(100% - 48px);
  min-width: 0;
  max-width: 400px;
}

.timeline-audio-player__download {
  width: 40px;
  min-width: 40px;
  max-width: 40px;
  height: 40px;
  min-height: 40px;
  max-height: 40px;
  border-radius: 50%;
  margin: 0;
  padding: 0;
}

.timeline-audio-player__description {
  width: calc(100% - 48px);
  max-width: 400px;
  margin-top: 4px;
}
</style>
