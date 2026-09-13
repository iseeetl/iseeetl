<template>
  <BaseEditDialog
    class="timeline-setting-dialog"
    :visible="visible"
    :sending="sending"
    title-id="timeline_setting_dialog_title"
    :title-text="$t('タイムライン設定')"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t('決定')"
    :actions-adjacent="true"
    progress-mode="indeterminate"
    cancel-test-id="dialog-timeline-setting-cancel-desktop"
    mobile-cancel-test-id="dialog-timeline-setting-cancel-mobile"
    confirm-test-id="dialog-timeline-setting-confirm"
    data-testid="dialog-timeline-setting"
    initial-focus="#speech_speed"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <section class="setting-section" aria-labelledby="timeline_setting_speech_title">
      <h3 id="timeline_setting_speech_title" class="setting-section-title">{{ $t('timelineSettingDialog.speech') }}</h3>
      <label for="speech_speed">{{ $t('読み上げ速度') }}</label>
      <div class="speech-speed-group">
        <input
          type="range"
          id="speech_speed"
          name="speech_name"
          ref="speechSpeedRef"
          min="0"
          max="3"
          step="0.1"
          v-model.number="speechSpeed"
          aria-valuemin="0"
          aria-valuemax="3"
          :aria-valuenow="speechSpeed"
          :aria-valuetext="speechSpeed"
        />
        <span class="speech-speed-value">{{ speechSpeed }}</span>
      </div>
    </section>

    <section class="setting-section" aria-labelledby="timeline_setting_display_title">
      <h3 id="timeline_setting_display_title" class="setting-section-title">{{ $t('timelineSettingDialog.displayItems') }}</h3>
      <div class="setting-checkbox-list">
        <label class="setting-choice" for="display_name">
          <input type="checkbox" id="display_name" v-model="displayName" />
          <span>{{ $t('「◯◯の投稿」、「◯◯の返信」、「◯◯の付加情報」を表示する') }}</span>
        </label>
        <label class="setting-choice" for="display_date">
          <input type="checkbox" id="display_date" v-model="displayDate" />
          <span>{{ $t('「日付」を表示する') }}</span>
        </label>
        <label class="setting-choice" for="display_tag">
          <input type="checkbox" id="display_tag" v-model="displayTag" />
          <span>{{ $t('「タグ」を表示する') }}</span>
        </label>
        <label class="setting-choice" for="display_supplement">
          <input type="checkbox" id="display_supplement" v-model="displaySupplement" />
          <span>{{ $t('「付加情報」を表示する') }}</span>
        </label>
        <label class="setting-choice" for="display_actionbutton">
          <input type="checkbox" id="display_actionbutton" v-model="displayActionButton" />
          <span>{{ $t('「アクションボタン」を表示する') }}</span>
        </label>
        <label
          v-if="$store.getters.userRole === 'Administrator' || $store.getters.roomRole === 'FloorEditor'"
          class="setting-choice"
          for="display_user_kick_button"
        >
          <input type="checkbox" id="display_user_kick_button" v-model="displayUserKickButton" />
          <span>{{ $t('「ユーザキックボタン」を表示する') }}</span>
        </label>
      </div>
    </section>

    <section class="setting-section" aria-labelledby="timeline_setting_animation_title">
      <h3 id="timeline_setting_animation_title" class="setting-section-title">{{ $t('流す') }}</h3>
      <label class="setting-choice" for="enable_text_animation">
        <input type="checkbox" id="enable_text_animation" v-model="enableTextAnimation" />
        <span>{{ $t('「流す」のアニメーションを行う') }}</span>
      </label>
      <div class="animation-speed-group">
        <label for="animation_speed">{{ $t('流すスピード') }}</label>
        <select id="animation_speed" name="animation_speed" class="input-select" v-model="animationSpeed">
          <option value="slow">{{ $t('遅い') }}</option>
          <option value="normal">{{ $t('普通') }}</option>
          <option value="fast">{{ $t('速い') }}</option>
          <option value="very_fast">{{ $t('とても速い') }}</option>
        </select>
      </div>
    </section>
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
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';

export default {
  emits: ['close', 'success'],
  name: 'TimelineSettingDialog',
  components: {
    BaseEditDialog,
    ConfirmDialog,
  },
  props: {
    dialogVisible: Boolean,
  },
  data() {
    return {
      visible: this.dialogVisible,
      sending: false,
      initialSnapshot: null,
      discardConfirmVisible: false,
      closeAfterDiscard: false,

      speechSpeed: null,
      displayName: null,
      displayDate: null,
      displayTag: null,
      displaySupplement: null,
      displayActionButton: null,
      enableTextAnimation: null,
      animationSpeed: 'normal',
      displayUserKickButton: true,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  methods: {
    openedDialog() {
      this.speechSpeed = this.$store.getters.speechSpeed;
      this.displayName = this.$store.getters.displayName;
      this.displayDate = this.$store.getters.displayDate;
      this.displayTag = this.$store.getters.displayTag;
      this.displaySupplement = this.$store.getters.displaySupplement;
      this.displayActionButton = this.$store.getters.displayActionButton;
      this.enableTextAnimation = this.$store.getters.enableTextAnimation;
      this.animationSpeed = this.$store.getters.animationSpeed;
      this.displayUserKickButton = this.$store.getters.displayUserKickButton;
      this.initialSnapshot = this.getEditSnapshot();
    },

    onPressCancelButton() {
      if (this.sending) return;
      if (this.hasUnsavedChanges()) {
        this.discardConfirmVisible = true;
        return;
      }
      this.visible = false;
    },

    getEditSnapshot() {
      return JSON.stringify({
        speechSpeed: this.speechSpeed,
        displayName: this.displayName,
        displayDate: this.displayDate,
        displayTag: this.displayTag,
        displaySupplement: this.displaySupplement,
        displayActionButton: this.displayActionButton,
        enableTextAnimation: this.enableTextAnimation,
        animationSpeed: this.animationSpeed,
        displayUserKickButton: this.displayUserKickButton,
      });
    },

    hasUnsavedChanges() {
      return this.initialSnapshot !== null && this.initialSnapshot !== this.getEditSnapshot();
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

    getCommittedSettingSnapshot() {
      return {
        speechSpeed: this.$store.getters.speechSpeed,
        displayName: this.$store.getters.displayName,
        displayDate: this.$store.getters.displayDate,
        displayTag: this.$store.getters.displayTag,
        displaySupplement: this.$store.getters.displaySupplement,
        displayActionButton: this.$store.getters.displayActionButton,
        enableTextAnimation: this.$store.getters.enableTextAnimation,
        animationSpeed: this.$store.getters.animationSpeed,
        displayUserKickButton: this.$store.getters.displayUserKickButton,
      };
    },

    async onPressDoneButton() {
      if (this.sending) return;
      this.sending = true;
      try {
        await this.$store.dispatch('doUpdateTimeLineSetting', {
          speechSpeed: this.speechSpeed,
          displayName: this.displayName,
          displayDate: this.displayDate,
          displayTag: this.displayTag,
          displaySupplement: this.displaySupplement,
          displayActionButton: this.displayActionButton,
          enableTextAnimation: this.enableTextAnimation,
          animationSpeed: this.animationSpeed,
          displayUserKickButton: this.displayUserKickButton,
        });
        this.$emit('success', this.getCommittedSettingSnapshot());
        this.visible = false;
      } finally {
        this.sending = false;
      }
    },

    clearValue() {
      this.initialSnapshot = null;
      this.discardConfirmVisible = false;
      this.closeAfterDiscard = false;
      this.speechSpeed = null;
      this.displayName = null;
      this.displayDate = null;
      this.displayTag = null;
      this.displaySupplement = null;
      this.displayActionButton = null;
      this.enableTextAnimation = null;
      this.animationSpeed = 'normal';
      this.displayUserKickButton = true;
    },

    closedDialog(payload) {
      this.clearValue();
      this.$emit('close', payload);
    },
  },
};
</script>

<style scoped>
@media screen and (max-width: 896px) {
  :global(.timeline-setting-dialog) {
    --ui-dialog-width: 600px;
  }
}
:global(.timeline-setting-dialog .ui-dialog__actions) {
  border-top: 1px solid #ddd;
}
.setting-section {
  min-width: 0;
  padding: 8px 0;
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.setting-section + .setting-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #ddd;
}
.setting-section-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 600;
}
.setting-section label {
  padding: 0;
  font-size: inherit;
  line-height: inherit;
}
.speech-speed-group {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
}
.speech-speed-group input {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}
.speech-speed-value {
  flex: 0 0 3ch;
  font-variant-numeric: tabular-nums;
}
.setting-checkbox-list {
  display: grid;
  gap: 12px;
}
.setting-choice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}
.setting-choice input {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin: 4px 0 0;
}
.setting-choice span {
  min-width: 0;
}
.animation-speed-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-top: 20px;
}
.animation-speed-group select {
  width: 180px;
  max-width: 100%;
  min-width: 0;
  margin: 0;
}
</style>
