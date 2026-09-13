<template>
  <ConfirmDialog
    :dialog-visible="visible"
    :title="$t('投稿読み上げの開始')"
    title-id="speech_dialog_title"
    :confirm-label="$t('開始')"
    :cancel-label="$t('キャンセル')"
    confirm-tone="primary"
    confirm-icon="play_arrow"
    :close-on-confirm="false"
    :close-on-escape="true"
    :close-on-backdrop="true"
    :actions-adjacent="true"
    cancel-test-id="dialog-speech-cancel-desktop"
    mobile-cancel-test-id="dialog-speech-cancel-mobile"
    confirm-test-id="dialog-speech-start"
    data-testid="dialog-speech"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @closed="closedDialog"
  >
    <div class="speech-dialog-message">
      <UiIcon class="warning-icon" name="warning" />
      <p>
        {{
          $t(
            '誰かが新しい投稿をすると、その内容を読み上げます。[開始]ボタンを押すと、読み上げの音声が聴こえますので音量を調整してください。'
          )
        }}
      </p>
    </div>
  </ConfirmDialog>
</template>

<script>
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  emits: ['close', 'success'],
  name: 'SpeechDialog',
  components: {
    ConfirmDialog,
    UiIcon,
  },
  props: {
    dialogVisible: Boolean,
  },
  data() {
    return {
      visible: this.dialogVisible,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  methods: {
    onPressCancelButton() {
      this.visible = false;
    },

    onPressDoneButton() {
      const uttr = new SpeechSynthesisUtterance();
      uttr.text = this.$t('投稿の読み上げを開始します');
      uttr.lang = this.$i18n.locale || this.$store.getters.lang;
      uttr.rate = this.$store.getters.speechSpeed;
      window.speechSynthesis.speak(uttr);

      this.$emit('success');
      this.visible = false;
    },

    closedDialog(payload) {
      this.$emit('close', payload);
    },
  },
};
</script>

<style scoped>
.speech-dialog-message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.speech-dialog-message p {
  margin: 0;
}

.warning-icon {
  color: orange;
}
</style>
