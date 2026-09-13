<template>
  <div class="ui-progress" :class="`ui-progress--${mode}`" v-bind="rootAttrs">
    <div class="ui-progress__indicator" :style="indicatorStyle"></div>
  </div>
</template>

<script>
const MODES = ['determinate', 'indeterminate'];

export default {
  name: 'UiProgress',
  inheritAttrs: false,
  props: {
    mode: {
      type: String,
      required: true,
      validator: (value) => MODES.includes(value),
    },
    value: {
      type: Number,
      default: 0,
    },
  },
  computed: {
    clampedValue() {
      if (!Number.isFinite(this.value)) return 0;
      return Math.min(100, Math.max(0, this.value));
    },
    rootAttrs() {
      const attrs = { ...this.$attrs };
      delete attrs.role;
      delete attrs['aria-valuemin'];
      delete attrs['aria-valuemax'];
      delete attrs['aria-valuenow'];

      attrs.role = 'progressbar';
      if (this.mode === 'determinate') {
        attrs['aria-valuemin'] = '0';
        attrs['aria-valuemax'] = '100';
        attrs['aria-valuenow'] = String(this.clampedValue);
      }
      return attrs;
    },
    indicatorStyle() {
      if (this.mode !== 'determinate') return undefined;
      return { width: `${this.clampedValue}%` };
    },
  },
};
</script>
