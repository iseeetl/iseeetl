<template>
  <section
    ref="dialog"
    class="chunk-load-recovery"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="chunk-load-recovery-title"
    aria-describedby="chunk-load-recovery-message"
  >
    <div ref="panel" class="chunk-load-recovery__panel" tabindex="-1">
      <h1 id="chunk-load-recovery-title">{{ $t('画面を更新できませんでした') }}</h1>
      <p id="chunk-load-recovery-message">
        {{ message }}
      </p>
      <button ref="retryButton" type="button" @click="$emit('retry')">{{ $t('再試行') }}</button>
    </div>
  </section>
</template>

<script>
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default {
  name: 'ChunkLoadRecovery',
  props: {
    reason: {
      type: String,
      default: 'unavailable',
    },
  },
  emits: ['retry'],
  data() {
    return {
      backgroundStates: [],
      previousBodyOverflow: '',
      restoreTarget: null,
    };
  },
  computed: {
    message() {
      return this.reason === 'offline'
        ? this.$t('ネットワーク接続を確認してから、再試行してください。')
        : this.$t('新しい画面データを読み込めませんでした。再試行してください。');
    },
  },
  mounted() {
    this.restoreTarget = document.activeElement;
    this.isolateBackground();
    document.addEventListener('keydown', this.trapTabKey, true);
    document.addEventListener('focusin', this.keepFocusInside, true);
    this.$nextTick(() => {
      if (this.$refs.panel) this.focusInitialTarget();
    });
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.trapTabKey, true);
    document.removeEventListener('focusin', this.keepFocusInside, true);
    this.restoreBackground();
    this.restoreSavedFocus();
  },
  methods: {
    isolateBackground() {
      const recoveryHost = Array.from(document.body.children).find((element) => element.contains(this.$el));
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      this.backgroundStates = Array.from(document.body.children)
        .filter((element) => element !== recoveryHost)
        .map((element) => ({
          element,
          hadInertAttribute: element.hasAttribute('inert'),
          inertValue: element.inert,
          ariaHidden: element.getAttribute('aria-hidden'),
        }));

      this.backgroundStates.forEach(({ element }) => {
        element.inert = true;
        element.setAttribute('inert', '');
        element.setAttribute('aria-hidden', 'true');
      });
    },
    restoreBackground() {
      this.backgroundStates.forEach(({ element, hadInertAttribute, inertValue, ariaHidden }) => {
        element.inert = inertValue;
        if (!hadInertAttribute) element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      this.backgroundStates = [];
      document.body.style.overflow = this.previousBodyOverflow;
    },
    focusableElements() {
      if (!this.$refs.panel) return [];
      return Array.from(this.$refs.panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.disabled && element.getAttribute('aria-hidden') !== 'true'
      );
    },
    focusInitialTarget() {
      const target = this.focusableElements()[0] || this.$refs.panel;
      target?.focus();
    },
    trapTabKey(event) {
      if (event.key !== 'Tab') return;

      const focusable = this.focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        this.$refs.panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      const activeIndex = focusable.indexOf(activeElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeIndex === -1 || activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    },
    keepFocusInside(event) {
      if (this.$refs.panel.contains(event.target)) return;
      this.focusInitialTarget();
    },
    restoreSavedFocus() {
      const target = this.restoreTarget;
      this.restoreTarget = null;
      if (!target?.isConnected || target.disabled || typeof target.focus !== 'function') return;
      target.focus();
    },
  },
};
</script>

<style scoped>
.chunk-load-recovery {
  align-items: center;
  background: rgb(0 0 0 / 65%);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 2147483647;
}

.chunk-load-recovery__panel {
  background: #fff;
  border-radius: 8px;
  color: #1f2937;
  max-width: 32rem;
  padding: 24px;
  width: 100%;
}

.chunk-load-recovery__panel h1 {
  font-size: 1.25rem;
  margin: 0 0 16px;
}

.chunk-load-recovery__panel button {
  background: #075985;
  border: 0;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font: inherit;
  margin-top: 8px;
  min-height: 44px;
  padding: 10px 18px;
}

.chunk-load-recovery__panel button:focus-visible {
  box-shadow: 0 0 0 3px #f59e0b;
}
</style>
