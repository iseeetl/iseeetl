<template>
  <span class="ui-icon" :class="fontClass" :style="iconStyle" v-bind="rootAttrs" translate="no">{{ name }}</span>
</template>

<script>
const FAMILIES = ['icons', 'symbols'];

export default {
  name: 'UiIcon',
  inheritAttrs: false,
  props: {
    name: {
      type: String,
      required: true,
    },
    family: {
      type: String,
      default: 'icons',
      validator: (value) => FAMILIES.includes(value),
    },
    size: {
      type: Number,
      default: 24,
    },
    decorative: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      warnedForMissingName: false,
    };
  },
  computed: {
    fontClass() {
      return this.family === 'symbols' ? 'material-symbols-outlined' : 'material-icons';
    },
    iconStyle() {
      const size = `${this.size}px`;
      return {
        width: size,
        height: size,
        fontSize: size,
      };
    },
    rootAttrs() {
      const attrs = { ...this.$attrs };
      delete attrs.role;
      delete attrs['aria-hidden'];

      if (this.decorative) {
        attrs['aria-hidden'] = 'true';
      } else {
        attrs.role = 'img';
      }
      return attrs;
    },
  },
  mounted() {
    this.validateAccessibleName();
  },
  updated() {
    this.validateAccessibleName();
  },
  methods: {
    hasAccessibleName() {
      const ariaLabel = this.$attrs['aria-label'];
      if (typeof ariaLabel === 'string' && ariaLabel.trim()) return true;

      const labelledBy = this.$attrs['aria-labelledby'];
      if (typeof labelledBy !== 'string' || !labelledBy.trim()) return false;

      const ids = labelledBy.trim().split(/\s+/);
      return ids.every((id) => document.getElementById(id));
    },
    validateAccessibleName() {
      if (this.decorative || this.hasAccessibleName()) {
        this.warnedForMissingName = false;
        return;
      }
      if (import.meta.env.PROD || this.warnedForMissingName) return;

      this.warnedForMissingName = true;
      console.warn('[UiIcon] non-decorative icons require aria-label or a valid aria-labelledby.');
    },
  },
};
</script>

<style>
.ui-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  overflow: hidden;
  line-height: 1;
  color: inherit;
}

.ui-icon.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

</style>
