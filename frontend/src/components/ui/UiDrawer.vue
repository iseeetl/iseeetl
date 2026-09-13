<template>
  <UiDialog
    class="ui-drawer"
    v-bind="$attrs"
    :open="open"
    :title-id="titleId"
    :description-ids="descriptionIds"
    :close-on-escape="closeOnEscape"
    :close-on-backdrop="closeOnBackdrop"
    :initial-focus="initialFocus"
    :panel-id="panelId"
    :panel-test-id="panelTestId"
    :backdrop-test-id="backdropTestId"
    @request-close="$emit('request-close', $event)"
    @opened="$emit('opened')"
    @closed="$emit('closed', $event)"
  >
    <template #title>
      <slot name="title" />
    </template>

    <slot />

    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>

    <template v-if="$slots.status" #status>
      <slot name="status" />
    </template>
  </UiDialog>
</template>

<script>
import UiDialog from './UiDialog.vue';

export default {
  name: 'UiDrawer',
  inheritAttrs: false,
  emits: ['closed', 'opened', 'request-close'],
  components: {
    UiDialog,
  },
  props: {
    open: {
      type: Boolean,
      default: false,
    },
    titleId: {
      type: String,
      required: true,
    },
    descriptionIds: {
      type: String,
      default: '',
    },
    closeOnEscape: {
      type: Boolean,
      default: true,
    },
    closeOnBackdrop: {
      type: Boolean,
      default: true,
    },
    initialFocus: {
      type: String,
      default: undefined,
    },
    panelId: {
      type: String,
      default: '',
    },
    panelTestId: {
      type: String,
      default: '',
    },
    backdropTestId: {
      type: String,
      default: 'dialog-backdrop',
    },
  },
};
</script>

<style scoped>
:global(.ui-dialog.ui-drawer > .ui-dialog__panel) {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  width: 320px;
  max-width: calc(100vw - 32px);
  max-height: 100vh;
  max-height: 100dvh;
}

:global(.ui-dialog.ui-drawer > .ui-dialog__panel > .ui-dialog__header) {
  flex-shrink: 0;
  justify-content: flex-start;
  padding-inline: 16px;
}

:global(.ui-dialog.ui-drawer > .ui-dialog__panel > .ui-dialog__content) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

:global(.ui-dialog.ui-drawer > .ui-dialog__panel > .ui-dialog__actions) {
  flex-shrink: 0;
  display: block;
  width: 100%;
  padding: 0;
}
</style>
