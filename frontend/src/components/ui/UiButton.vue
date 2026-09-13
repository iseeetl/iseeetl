<template>
  <button v-bind="rootAttrs" ref="button" class="ui-button" :class="buttonClasses" :type="buttonType">
    <slot />
  </button>
</template>

<script>
const APPEARANCES = ['text', 'filled'];
const TONES = ['neutral', 'primary', 'danger', 'success'];
const DENSITIES = ['normal', 'dense'];

export default {
  name: 'UiButton',
  inheritAttrs: false,
  props: {
    appearance: {
      type: String,
      default: 'text',
      validator: (value) => APPEARANCES.includes(value),
    },
    tone: {
      type: String,
      default: 'neutral',
      validator: (value) => TONES.includes(value),
    },
    density: {
      type: String,
      default: 'normal',
      validator: (value) => DENSITIES.includes(value),
    },
    iconOnly: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      warnedForMissingName: false,
    };
  },
  computed: {
    rootAttrs() {
      const attrs = { ...this.$attrs };
      delete attrs.type;
      return attrs;
    },
    buttonType() {
      return this.$attrs.type === undefined ? 'button' : this.$attrs.type;
    },
    buttonClasses() {
      return [
        `ui-button--${this.appearance}`,
        `ui-button--${this.tone}`,
        `ui-button--${this.density}`,
        { 'ui-button--icon-only': this.iconOnly },
      ];
    },
  },
  mounted() {
    this.validateAccessibleName();
  },
  updated() {
    this.validateAccessibleName();
  },
  methods: {
    focus(options) {
      this.$refs.button.focus(options);
    },
    hasAccessibleName() {
      const ariaLabel = this.$attrs['aria-label'];
      if (typeof ariaLabel === 'string' && ariaLabel.trim()) return true;

      const labelledBy = this.$attrs['aria-labelledby'];
      if (typeof labelledBy !== 'string' || !labelledBy.trim()) return false;

      const ids = labelledBy.trim().split(/\s+/);
      return ids.every((id) => document.getElementById(id));
    },
    validateAccessibleName() {
      if (!this.iconOnly || this.hasAccessibleName()) {
        this.warnedForMissingName = false;
        return;
      }
      if (import.meta.env.PROD || this.warnedForMissingName) return;

      this.warnedForMissingName = true;
      console.warn('[UiButton] iconOnly requires aria-label or a valid aria-labelledby.');
    },
  },
};
</script>

<style>
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 3px;
  margin: 6px 8px;
  min-height: 36px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
}

.ui-button--dense {
  min-height: 32px;
  padding: 0 8px;
}

.ui-button--icon-only {
  width: 36px;
  min-width: 36px;
  margin: 0 6px;
  padding: 0;
}

.ui-button--dense.ui-button--icon-only {
  width: 32px;
  min-width: 32px;
}

.ui-button--text {
  background: transparent;
}

.ui-button--text.ui-button--neutral {
  color: #2c3e50;
}

.ui-button--text.ui-button--primary {
  color: var(--ui-color-primary);
}

.ui-button--text.ui-button--danger {
  color: var(--ui-color-danger);
}

.ui-button--text.ui-button--success {
  color: var(--ui-color-success);
}

.ui-button--filled.ui-button--neutral {
  color: #000;
  background: var(--ui-color-cancel);
}

.ui-button--filled.ui-button--primary {
  color: #fff;
  background: var(--ui-color-primary);
}

.ui-button--filled.ui-button--danger {
  color: #fff;
  background: var(--ui-color-danger);
}

.ui-button--filled.ui-button--success {
  color: #fff;
  background: var(--ui-color-success);
}

.ui-button:not(:disabled):hover {
  filter: brightness(0.92);
}

.ui-button:not(:disabled):active {
  filter: brightness(0.84);
}

.ui-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  filter: none;
}
</style>
