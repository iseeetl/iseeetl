<template>
  <ConfirmDialog
    :dialog-visible="visible"
    :title="$t('音が鳴ります')"
    title-id="sound_caution_confirm_title"
    :confirm-label="$t('確認')"
    confirm-tone="primary"
    confirm-icon="done"
    :close-on-confirm="false"
    data-testid="dialog-sound-caution"
    :close-on-backdrop="false"
    :close-on-escape="false"
    :actions-adjacent="true"
    confirm-test-id="dialog-sound-caution-confirm"
    @confirm="onPressDoneButton"
    @closed="closedDialog"
  >
    <div class="sound-caution-message">
      <UiIcon class="warning-icon" name="warning" />
      <p>
        {{
          $t(
            '先ほど選んだ「音を鳴らすタグ」を使って誰かが投稿すると、ビープ音が鳴ります。[確認]ボタンを押すと、そのビープ音が鳴りますので音量を調整してください。'
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
  emits: ['close', 'confirm'],
  name: 'SoundCautionConfirm',
  components: {
    ConfirmDialog,
    UiIcon,
  },
  props: {
    confirmVisible: { type: Boolean, required: true },
  },
  data() {
    return {
      visible: this.confirmVisible,
    };
  },
  watch: {
    confirmVisible(val) {
      this.visible = val;
    },
  },
  methods: {
    closedDialog(payload) {
      this.$emit('close', payload);
    },
    onPressDoneButton() {
      this.$emit('confirm');
      this.visible = false;
    },
  },
};
</script>

<style scoped>
.sound-caution-message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.sound-caution-message p {
  margin: 0;
}

.warning-icon {
  color: orange;
}
</style>
