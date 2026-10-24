<template>
  <UiDialog
    class="timeline-editor-dialog ui-dialog--standard"
    :style="viewportStyle"
    :open="visible"
    :title-id="titleId"
    :initial-focus="initialFocus"
    :close-on-escape="!interactionBlocked"
    :close-on-backdrop="!interactionBlocked"
    :aria-busy="sending ? 'true' : 'false'"
    @request-close="onCancel"
    @opened="$emit('opened')"
    @closed="$emit('closed', $event)"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="cancelLabel"
        :disabled="interactionBlocked"
        @click.stop="onCancel"
      >
        <UiIcon name="close" />
      </UiButton>

      <h2 :id="titleId" class="ui-dialog__heading">
        {{ titleText }}
      </h2>

      <div class="timeline-editor-dialog__mobile-actions ui-dialog__header-end mobile-item"
        role="group" :aria-label="$t('editorActions.top')">
        <slot name="mobile-actions" />
      </div>
    </template>

    <slot />

    <template #actions>
      <div class="timeline-editor-dialog__actions">
        <UiButton
          class="desktop-item timeline-editor-dialog__cancel"
          appearance="filled"
          tone="neutral"
          :disabled="interactionBlocked"
          @click.stop="onCancel"
        >
          <UiIcon name="close" />
          {{ cancelLabel }}
        </UiButton>
        <div class="timeline-editor-dialog__primary-actions" role="group" :aria-label="$t('editorActions.bottom')">
          <slot name="actions" :position="mobileLayout ? 'bottom' : 'desktop'" />
        </div>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending"
        mode="determinate"
        :value="progressAmount"
        :aria-labelledby="titleId"
      />
    </template>
  </UiDialog>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  name: 'TimelineEditorDialog',
  emits: ['cancel', 'closed', 'opened'],
  components: {
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    visible: {
      type: Boolean,
      required: true,
    },
    titleId: {
      type: String,
      required: true,
    },
    titleText: {
      type: String,
      required: true,
    },
    cancelLabel: {
      type: String,
      required: true,
    },
    initialFocus: {
      type: String,
      default: undefined,
    },
    blocked: {
      type: Boolean,
      default: false,
    },
    sending: {
      type: Boolean,
      default: false,
    },
    progressAmount: {
      type: Number,
      default: 0,
    },
  },
  data() { return { mobileLayout: false, viewportStyle: {} }; },
  mounted() {
    this.updateViewport();
    window.addEventListener('resize', this.updateViewport);
    window.visualViewport?.addEventListener('resize', this.updateViewport);
    window.visualViewport?.addEventListener('scroll', this.updateViewport);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updateViewport);
    window.visualViewport?.removeEventListener('resize', this.updateViewport);
    window.visualViewport?.removeEventListener('scroll', this.updateViewport);
  },
  computed: {
    interactionBlocked() {
      return this.blocked || this.sending;
    },
  },
  methods: {
    updateViewport() {
      this.mobileLayout = Boolean(window.matchMedia?.('(max-width: 896px)').matches);
      const viewport = window.visualViewport;
      // Do not counteract pinch zoom; visual viewport fitting targets the keyboard at normal zoom.
      this.viewportStyle = this.mobileLayout && viewport && viewport.scale === 1
        ? { '--editor-visible-height': `${viewport.height}px`, '--editor-visible-top': `${viewport.offsetTop}px` }
        : {};
    },
    onCancel() {
      if (this.interactionBlocked) return;
      this.$emit('cancel');
    },
  },
};
</script>

<style scoped>
.timeline-editor-dialog__mobile-actions,
.timeline-editor-dialog__actions,
.timeline-editor-dialog__primary-actions {
  align-items: center;
  gap: 12px;
}

.timeline-editor-dialog__mobile-actions,
.timeline-editor-dialog__primary-actions {
  justify-content: flex-end;
}

.timeline-editor-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  width: 100%;
}

.timeline-editor-dialog__cancel {
  flex-shrink: 0;
}

.timeline-editor-dialog__primary-actions {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  margin-inline-start: auto;
}

.timeline-editor-dialog__primary-actions > :deep(*) {
  min-width: 0;
  max-width: 100%;
}

.timeline-editor-dialog__actions :deep(.ui-button) {
  max-width: 100%;
  margin: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

@media screen and (max-width: 896px) {
  .timeline-editor-dialog__mobile-actions {
    display: flex !important;
    gap: 8px;
  }

  .timeline-editor-dialog__mobile-actions :deep(.ui-button) {
    margin: 0;
  }

  :global(.timeline-editor-dialog) {
    --ui-dialog-width: 100vw;
    top: var(--editor-visible-top, 0px);
    bottom: auto;
    height: var(--editor-visible-height, 100dvh);
  }

  :global(.timeline-editor-dialog .ui-dialog__panel) {
    height: calc(100vh - var(--ui-dialog-viewport-gutter));
    height: calc(var(--editor-visible-height, 100dvh) - var(--ui-dialog-viewport-gutter));
    max-height: calc(var(--editor-visible-height, 100dvh) - var(--ui-dialog-viewport-gutter));
    overflow: hidden;
  }

  :global(.timeline-editor-dialog .ui-dialog__header),
  :global(.timeline-editor-dialog .ui-dialog__status) {
    flex: 0 0 auto;
  }

  :global(.timeline-editor-dialog .ui-dialog__content) {
    min-height: 0;
    flex: 1 1 auto;
    overscroll-behavior: contain;
    padding-right: max(16px, env(safe-area-inset-right));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    padding-left: max(16px, env(safe-area-inset-left));
  }

  :global(.timeline-editor-dialog .ui-dialog__heading) {
    max-width: calc(100% - 176px);
  }

  :global(.timeline-editor-dialog .ui-dialog__actions) {
    display: flex;
    flex: 0 0 auto;
    padding: 8px 16px max(8px, env(safe-area-inset-bottom));
    background: #fff;
    border-top: 1px solid #ccc;
  }
  .timeline-editor-dialog__primary-actions {
    width: 100%;
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
  }
  .timeline-editor-dialog__primary-actions > :deep(*) { flex: 1 1 0; }
  .timeline-editor-dialog__primary-actions :deep(.ui-tooltip__anchor) { width: 100%; }
  .timeline-editor-dialog__primary-actions :deep(.ui-button) {
    width: 100%;
    min-height: 48px;
  }
}
</style>
