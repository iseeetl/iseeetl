<template>
  <div class="view">
    <div class="view-header">
      <BackButton></BackButton>
      <h1 class="view-title">
        {{ $t('設定') }}
      </h1>
    </div>

    <div class="view-content">
      <div class="input-field">
        <label for="timeline_font_family" class="input-label">{{ $t('タイムライン フォント') }}</label>
        <div>
          <select id="timeline_font_family" class="input-select" v-model="timelineFontFamily">
            <option value="" selected>{{ $t('デフォルト') }}</option>
            <option value="メイリオ, Meiryo">{{ $t('メイリオ') }}</option>
            <option value="ＭＳ Ｐゴシック, MS PGothic">{{ $t('ＭＳ Ｐゴシック') }}</option>
            <option value="ヒラギノ角ゴPro W3, Hiragino Kaku Gothic Pro">{{ $t('ヒラギノ角ゴPro W3') }}</option>
            <option value="Helvetica">Helvetica</option>
          </select>
        </div>
      </div>

      <div class="input-field">
        <label for="timeline_font_size" class="input-label">{{ $t('タイムライン フォントサイズ') }}</label>
        <div>
          <select id="timeline_font_size" class="input-select" v-model="timelineFontSize">
            <option value="" selected>{{ $t('デフォルト') }}</option>
            <option value="16px">{{ $t('16px') }}</option>
            <option value="18px">{{ $t('18px') }}</option>
            <option value="20px">{{ $t('20px') }}</option>
          </select>
        </div>
      </div>

    </div>

    <div class="right-button-wrapper">
      <UiButton
        class="right-button"
        data-testid="settings-submit"
        appearance="filled"
        tone="primary"
        @click.stop="saveTimelineSettings"
      >
        {{ $t('決定') }}
      </UiButton>
    </div>
  </div>
</template>

<script>
import BackButton from '@/components/common/BackButton.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { readTimelineSettings } from '@/features/timeline/settings';

export default {
  name: 'Setting',
  components: {
    BackButton,
    UiButton,
  },
  data() {
    return {
      timelineFontFamily: null,
      timelineFontSize: null,
    };
  },
  created() {
    this.loadTimelineSettings();
  },
  methods: {
    loadTimelineSettings() {
      const localStorage = typeof window !== 'undefined' ? window.localStorage : null;
      if (!localStorage) return;
      const settings = readTimelineSettings({ localStorageRef: localStorage });
      if (typeof settings.timelineFontFamily === 'string' && settings.timelineFontFamily !== '') {
        this.timelineFontFamily = settings.timelineFontFamily;
      }
      if (typeof settings.timelineFontSize === 'string' && settings.timelineFontSize !== '') {
        this.timelineFontSize = settings.timelineFontSize;
      }
    },
    saveTimelineSettings() {
      const localStorage = typeof window !== 'undefined' ? window.localStorage : null;
      if (!localStorage) return;
      localStorage.setItem(
        'iseeetl_setting',
        JSON.stringify({
          timelineFontFamily: this.timelineFontFamily,
          timelineFontSize: this.timelineFontSize,
        })
      );
      this.$router.push({ name: 'Floor' });
    },
  },
};
</script>

<style scoped>
.input-field {
  margin-top: 16px;
}
.input-select {
  font-size: 16px;
  height: 32px;
  min-width: 100px;
}
</style>
