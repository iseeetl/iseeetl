<template>
  <div
    v-show="modelValue"
    class="ui-snackbar"
    :class="positionClass"
    :role="role"
    :aria-live="ariaLive"
    :aria-atomic="ariaAtomic"
  >
    <span>{{ message }}</span>
  </div>
</template>

<script>
export default {
  name: 'UiSnackbar',
  emits: ['update:modelValue'],
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      default: null,
    },
    position: {
      type: String,
      default: 'center',
    },
    duration: {
      type: Number,
      default: 4000,
    },
    isInfinity: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      default: null,
    },
    ariaLive: {
      type: String,
      default: null,
    },
    ariaAtomic: {
      type: [String, Boolean],
      default: null,
    },
  },
  data() {
    return {
      timerId: null,
    };
  },
  computed: {
    positionClass() {
      const position = this.position === 'center' ? this.position : 'center';
      return `ui-snackbar--${position}`;
    },
  },
  watch: {
    modelValue(visible) {
      if (visible) {
        this.restartTimer();
      } else {
        this.clearTimer();
      }
    },
    duration() {
      this.restartVisibleTimer();
    },
    message() {
      this.restartVisibleTimer();
    },
    isInfinity() {
      this.restartVisibleTimer();
    },
  },
  mounted() {
    if (this.modelValue) this.restartTimer();
  },
  beforeUnmount() {
    this.clearTimer();
  },
  methods: {
    restartVisibleTimer() {
      if (this.modelValue) this.restartTimer();
    },
    restartTimer() {
      this.clearTimer();
      if (this.isInfinity) return;

      this.timerId = window.setTimeout(() => {
        this.timerId = null;
        this.$emit('update:modelValue', false);
      }, this.duration);
    },
    clearTimer() {
      if (this.timerId === null) return;
      window.clearTimeout(this.timerId);
      this.timerId = null;
    },
  },
};
</script>

<style>
.ui-snackbar {
  position: fixed;
  bottom: 16px;
  z-index: 3000;
  max-width: calc(100vw - 32px);
  padding: 12px 16px;
  color: #fff;
  background: #323232;
}

.ui-snackbar--center {
  left: 50%;
  transform: translateX(-50%);
}
</style>
