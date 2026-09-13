<template>
  <UiDialog
    ref="dialogRootRef"
    :open="visible"
    :title-id="dialogTitleId"
    :description-ids="dialogDescriptionId"
    data-testid="dialog-login-required"
    :initial-focus="
      showCancel
        ? '[data-testid=\'dialog-login-required-cancel-mobile\']'
        : '[data-testid=\'dialog-login-required-confirm-mobile\']'
    "
    :close-on-escape="!sending"
    :close-on-backdrop="false"
    :aria-busy="sending ? 'true' : 'false'"
    @request-close="requestClose"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        v-if="showCancel"
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="resolvedCancelLabel"
        :disabled="sending"
        data-testid="dialog-login-required-cancel-mobile"
        @click.stop="onCancel"
      >
        <UiIcon name="close" />
      </UiButton>
      <span v-else class="ui-dialog__header-start mobile-item" aria-hidden="true"></span>

      <h2 :id="dialogTitleId" class="ui-dialog__heading">{{ resolvedTitle }}</h2>

      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        :tone="confirmTone"
        icon-only
        :aria-label="resolvedConfirmLabel"
        :disabled="sending"
        data-testid="dialog-login-required-confirm-mobile"
        @click.stop="onConfirm"
      >
        <UiIcon :name="confirmIcon" />
      </UiButton>
    </template>

    <div :id="dialogDescriptionId">
      <slot name="message">
        <p>
          {{ $t('画像データ、動画データ、音データ、字幕データのアップロードにはログインが必要です') }}
        </p>
        <p>
          <router-link class="text-link" :to="{ name: 'Login', query: roomContextQuery }">
            {{ $t('ログインページへ') }}
          </router-link>
        </p>
      </slot>
    </div>

    <template #actions>
      <div class="timeline-dialog-actions">
        <UiButton
          v-if="showCancel"
          class="desktop-item timeline-dialog-actions__start"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-login-required-cancel-desktop"
          :disabled="sending"
          @click.stop="onCancel"
        >
          {{ resolvedCancelLabel }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          :tone="confirmTone"
          data-testid="dialog-login-required-confirm-desktop"
          :disabled="sending"
          @click.stop="onConfirm"
        >
          {{ resolvedConfirmLabel }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress v-show="sending" mode="indeterminate" :aria-labelledby="dialogTitleId" />
    </template>
  </UiDialog>
</template>

<script>
import { useId } from 'vue';
import { buildRoomContextQuery } from '@/utils/routeRoomContext';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  emits: [
    'cancel',
    'close',
    'closed',
    'confirm',
    'opened',
  ],
  name: 'LoginRequiredDialog',
  components: {
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: { type: Boolean, required: true },
    title: { type: String, default: '' },
    confirmLabel: { type: String, default: '' },
    confirmTone: {
      type: String,
      default: 'neutral',
      validator: (value) => ['neutral', 'primary', 'danger', 'success'].includes(value),
    },
    confirmIcon: { type: String, default: 'close' },
    cancelLabel: { type: String, default: '' },
    showCancel: { type: Boolean, default: false },
    sending: { type: Boolean, default: false },
  },
  setup() {
    const instancePrefix = `login-required-dialog-${useId()}`;

    return {
      dialogTitleId: `${instancePrefix}-title`,
      dialogDescriptionId: `${instancePrefix}-description`,
    };
  },
  data() {
    return {
      visible: this.dialogVisible,
    };
  },
  watch: {
    dialogVisible(val) {
      this.visible = val;
    },
    visible(val) {
      if (!val) this.$emit('close');
    },
  },
  computed: {
    resolvedTitle() {
      return this.title || this.$t('ログインが必要です');
    },
    resolvedConfirmLabel() {
      return this.confirmLabel || this.$t('閉じる');
    },
    resolvedCancelLabel() {
      return this.cancelLabel || this.$t('キャンセル');
    },
    roomContextQuery() {
      return buildRoomContextQuery(this.$route, { source: 'params' });
    },
  },
  methods: {
    openedDialog() {
      this.$emit('opened');
    },
    closedDialog(payload) {
      this.$emit('closed', payload);
    },
    requestClose() {
      if (this.sending) return;
      this.visible = false;
    },
    onConfirm() {
      if (this.sending) return;
      this.$emit('confirm');
      this.visible = false;
    },
    onCancel() {
      if (this.sending) return;
      this.$emit('cancel');
      this.visible = false;
    },
  },
};
</script>

<style scoped>
.timeline-dialog-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 12px;
}
</style>
