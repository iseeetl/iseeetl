<template>
  <div
    :class="[
      'ui-field',
      {
        'ui-field--focused': controlFocused,
        'ui-field--has-value': controlHasValue,
        'ui-field--stacked': stacked,
        'ui-field--label-raised': stacked || controlFocused || controlHasValue,
      },
    ]"
    @focusin="onControlFocusIn"
    @focusout="onControlFocusOut"
    @input="onControlInput"
    @change="onControlChange"
  >
    <label class="ui-field__label" :for="controlId">{{ label }}</label>
    <div class="ui-field__control">
      <slot :control-attrs="controlAttrs" />
      <span v-if="showCounter" class="ui-field__counter" role="status">
        {{ characterCount }} / {{ maximumLength }}
      </span>
    </div>
    <p v-if="description" :id="descriptionId" class="ui-field__description">
      {{ description }}
    </p>
    <p v-if="error" :id="errorId" class="ui-field__error" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<script>
export default {
  name: 'UiField',
  props: {
    controlId: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    invalid: {
      type: Boolean,
      default: false,
    },
    error: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    counter: {
      type: Boolean,
      default: false,
    },
    stacked: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      controlFocused: false,
      controlHasValue: false,
      characterCount: 0,
      maximumLength: null,
    };
  },
  computed: {
    descriptionId() {
      return `${this.controlId}-description`;
    },
    errorId() {
      return `${this.controlId}-error`;
    },
    controlAttrs() {
      const attrs = {
        id: this.controlId,
      };
      const describedBy = [];

      if (this.invalid) attrs['aria-invalid'] = 'true';
      if (this.description) describedBy.push(this.descriptionId);
      if (this.error && !describedBy.includes(this.errorId)) describedBy.push(this.errorId);
      if (describedBy.length) attrs['aria-describedby'] = describedBy.join(' ');

      return attrs;
    },
    showCounter() {
      return this.counter && this.maximumLength !== null;
    },
  },
  mounted() {
    this.$nextTick(this.syncControlState);
  },
  updated() {
    this.$nextTick(this.syncControlState);
  },
  methods: {
    getControl() {
      return Array.from(this.$el.querySelectorAll('[id]')).find((element) => element.id === this.controlId) || null;
    },
    getEventControl(event) {
      const control = this.getControl();
      return event?.target === control ? control : null;
    },
    syncControlState(control = this.getControl()) {
      if (!control) return;

      const value = control.value === null || control.value === undefined ? '' : String(control.value);
      const maximumLength = typeof control.maxLength === 'number' && control.maxLength >= 0 ? control.maxLength : null;
      const hasValue = value.length > 0;

      if (this.controlHasValue !== hasValue) {
        this.controlHasValue = hasValue;
      }
      if (this.characterCount !== value.length) {
        this.characterCount = value.length;
      }
      if (this.maximumLength !== maximumLength) {
        this.maximumLength = maximumLength;
      }
    },
    onControlInput(event) {
      const control = this.getEventControl(event);
      if (!control || control.localName === 'select') return;
      this.syncControlState(control);
    },
    onControlChange(event) {
      const control = this.getEventControl(event);
      if (!control) return;
      this.syncControlState(control);
    },
    onControlFocusIn(event) {
      if (event.target !== this.getControl()) return;
      this.controlFocused = true;
      this.syncControlState();
    },
    onControlFocusOut(event) {
      if (event.target !== this.getControl()) return;
      this.controlFocused = false;
      this.syncControlState();
    },
  },
};
</script>
