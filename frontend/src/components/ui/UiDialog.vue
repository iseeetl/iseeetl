<template>
  <Teleport to="body">
    <div v-bind="wrapperAttrs" v-show="open" ref="wrapper" class="ui-dialog">
      <div
        ref="backdrop"
        class="ui-dialog__backdrop"
        :data-testid="backdropTestId"
        aria-hidden="true"
        @click="onBackdropClick"
      />
      <div
        :id="panelId || null"
        ref="panel"
        class="ui-dialog__panel"
        :data-testid="panelTestId || null"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descriptionIds || null"
        tabindex="-1"
      >
        <header v-if="$slots.title" class="ui-dialog__header">
          <slot name="title" />
        </header>
        <div class="ui-dialog__content">
          <slot />
        </div>
        <footer v-if="$slots.actions" class="ui-dialog__actions">
          <slot name="actions" />
        </footer>
        <div v-if="$slots.status" class="ui-dialog__status">
          <slot name="status" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
import { getTopPanel, registerDialog, unregisterDialog, updateDialog } from './overlayStack.js';

const FORBIDDEN_ARIA_ATTRS = ['role', 'aria-modal', 'aria-labelledby', 'aria-describedby'];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const hasHiddenAncestor = (element) => {
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (current.hidden || current.inert === true || current.getAttribute('aria-hidden') === 'true') {
      return true;
    }

    const style = window.getComputedStyle(current);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
      return true;
    }
    current = current.parentElement;
  }

  return false;
};

const isVisible = (element) =>
  Boolean(element && element.isConnected && !hasHiddenAncestor(element) && element.getClientRects().length);

const isFocusable = (element) =>
  Boolean(element && !element.disabled && !element.matches(':disabled') && isVisible(element));

const focusElement = (element) => {
  if (!element || typeof element.focus !== 'function') return false;
  element.focus();
  return document.activeElement === element;
};

const restoreFocusElement = (element) => {
  const event = new CustomEvent('ui-dialog-restore-focus', {
    bubbles: true,
    cancelable: true,
  });

  if (!element.dispatchEvent(event)) {
    return document.activeElement === element;
  }
  return focusElement(element);
};

export default {
  name: 'UiDialog',
  inheritAttrs: false,
  emits: ['request-close', 'opened', 'closed'],
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
  data() {
    return {
      stackToken: null,
      restoreTarget: null,
      transitionVersion: 0,
      isBeingDestroyed: false,
      warnedForbiddenAttrs: Object.create(null),
    };
  },
  computed: {
    wrapperAttrs() {
      const attrs = { ...this.$attrs };
      FORBIDDEN_ARIA_ATTRS.forEach((attribute) => {
        delete attrs[attribute];
      });
      return attrs;
    },
  },
  watch: {
    open(value) {
      if (value) {
        this.restoreTarget = document.activeElement;
        this.scheduleOpen();
      } else {
        this.scheduleClose();
      }
    },
    closeOnEscape() {
      this.updateStackRegistration();
    },
  },
  created() {
    this.stackRequestClose = (payload) => this.$emit('request-close', payload);
  },
  mounted() {
    this.validateForbiddenAttrs();

    if (this.open) {
      this.restoreTarget = document.activeElement;
      this.scheduleOpen();
    }
  },
  updated() {
    this.validateForbiddenAttrs();
  },
  beforeUnmount() {
    const shouldRestoreFocus = this.restoreTarget !== null;
    this.cleanupDialog();
    if (shouldRestoreFocus) {
      const focusRestored = this.restoreSavedFocus();
      if (!focusRestored) this.focusRemainingTopPanel();
      this.restoreTarget = null;
    }
  },
  methods: {
    cleanupDialog() {
      if (this.isBeingDestroyed) return;

      this.isBeingDestroyed = true;
      this.transitionVersion += 1;

      if (this.stackToken) {
        unregisterDialog(this.stackToken);
        this.stackToken = null;
      }
    },
    warn(message) {
      if (!import.meta.env.PROD) {
        console.warn(`[UiDialog] ${message}`);
      }
    },
    validateForbiddenAttrs() {
      FORBIDDEN_ARIA_ATTRS.forEach((attribute) => {
        if (this.$attrs[attribute] === undefined || this.warnedForbiddenAttrs[attribute]) {
          return;
        }

        this.warnedForbiddenAttrs[attribute] = true;
        this.warn(`${attribute} is managed by UiDialog and must not be passed by the caller.`);
      });
    },
    countPanelId(id) {
      return Array.from(this.$refs.panel.querySelectorAll('[id]')).filter((element) => element.id === id).length;
    },
    countDocumentId(id) {
      return Array.from(document.querySelectorAll('[id]')).filter((element) => element.id === id).length;
    },
    validateAriaReferences() {
      if (import.meta.env.PROD) return;

      if (this.countPanelId(this.titleId) !== 1) {
        this.warn(`titleId "${this.titleId}" must identify exactly one element in the panel.`);
      }
      if (this.countDocumentId(this.titleId) !== 1) {
        this.warn(`titleId "${this.titleId}" must identify exactly one element in the document.`);
      }

      const descriptionIds = this.descriptionIds.trim() ? this.descriptionIds.trim().split(/\s+/) : [];
      descriptionIds.forEach((id) => {
        if (this.countPanelId(id) !== 1) {
          this.warn(`description ID "${id}" must identify exactly one element in the panel.`);
        }
        if (this.countDocumentId(id) !== 1) {
          this.warn(`description ID "${id}" must identify exactly one element in the document.`);
        }
      });
    },
    updateStackRegistration() {
      if (!this.stackToken) return;
      updateDialog(this.stackToken, {
        closeOnEscape: this.closeOnEscape,
        requestClose: this.stackRequestClose,
      });
    },
    scheduleOpen() {
      const version = ++this.transitionVersion;

      this.$nextTick(() => {
        if (this.isBeingDestroyed || !this.open || version !== this.transitionVersion) {
          return;
        }

        this.validateAriaReferences();
        if (!this.stackToken) {
          this.stackToken = registerDialog({
            wrapper: this.$refs.wrapper,
            panel: this.$refs.panel,
            closeOnEscape: this.closeOnEscape,
            requestClose: this.stackRequestClose,
          });
        } else {
          this.updateStackRegistration();
        }
        this.focusInitialTarget();
        this.$emit('opened');
      });
    },
    scheduleClose() {
      const version = ++this.transitionVersion;

      this.$nextTick(() => {
        if (this.isBeingDestroyed || this.open || version !== this.transitionVersion) {
          return;
        }

        if (this.stackToken) {
          unregisterDialog(this.stackToken);
          this.stackToken = null;
        }

        this.$nextTick(() => {
          if (this.isBeingDestroyed || this.open || version !== this.transitionVersion) {
            return;
          }

          const focusRestored = this.restoreSavedFocus();
          if (!focusRestored) this.focusRemainingTopPanel();
          this.restoreTarget = null;
          this.$emit('closed', { focusRestored });
        });
      });
    },
    focusInitialTarget() {
      const panel = this.$refs.panel;
      let initialTarget = null;

      if (this.initialFocus) {
        try {
          initialTarget = panel.querySelector(this.initialFocus);
        } catch {
          initialTarget = null;
        }
      }

      if (isFocusable(initialTarget) && focusElement(initialTarget)) return;

      const firstFocusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).find(isFocusable);
      if (firstFocusable && focusElement(firstFocusable)) return;

      focusElement(panel);
    },
    restoreSavedFocus() {
      const target = this.restoreTarget;
      if (!target || target.disabled || target.matches(':disabled') || !isVisible(target)) {
        return false;
      }
      return restoreFocusElement(target);
    },
    focusRemainingTopPanel() {
      const topPanel = getTopPanel();
      if (topPanel) focusElement(topPanel);
    },
    onBackdropClick(event) {
      if (event.target !== event.currentTarget || !this.closeOnBackdrop) {
        return;
      }
      this.$emit('request-close', { reason: 'backdrop' });
    },
  },
};
</script>
