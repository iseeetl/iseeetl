<template>
  <UiField
    v-slot="{ controlAttrs }"
    class="search-field"
    control-id="management-search-input"
    :label="resolvedLabel"
    :invalid="invalid"
    :error="errorText"
    :class="fieldClass"
    :style="fieldStyle"
  >
    <form class="search-field__form" role="search" :aria-label="resolvedLabel" @submit.prevent="onSearch">
      <input
        v-bind="controlAttrs"
        ref="searchInput"
        class="search-field__input"
        type="search"
        :value="modelValue"
        :disabled="disabled"
        :aria-controls="resultRegionId"
        @input="$emit('update:modelValue', $event.target.value)"
        @blur="onBlur"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      />
      <div class="search-field__actions">
        <UiButton
          class="search-field__button"
          data-testid="management-search-submit"
          type="submit"
          appearance="filled"
          tone="primary"
          :disabled="disabled"
          :aria-label="$t('検索を実行')"
          :aria-controls="resultRegionId"
        >
          <UiIcon name="search" aria-hidden="true" />
          {{ $t('検索') }}
        </UiButton>
        <UiButton
          v-if="hasValue"
          class="search-field__button"
          data-testid="management-search-clear"
          type="button"
          appearance="filled"
          tone="neutral"
          :disabled="disabled"
          :aria-label="$t('検索条件をクリア')"
          :aria-controls="resultRegionId"
          @click="onClear"
        >
          {{ $t('クリア') }}
        </UiButton>
      </div>
    </form>
  </UiField>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  emits: ['blur', 'clear', 'search', 'update:modelValue'],
  name: 'SearchField',
  components: {
    UiButton,
    UiField,
    UiIcon,
  },
  props: {
    modelValue: {
      type: [String, Number],
      default: null,
    },
    label: {
      type: String,
      default: '',
    },
    fieldClass: {
      type: [String, Object, Array],
      default: null,
    },
    fieldStyle: {
      type: [String, Object],
      default: null,
    },
    showMinError: {
      type: Boolean,
      default: false,
    },
    showMaxError: {
      type: Boolean,
      default: false,
    },
    minErrorText: {
      type: String,
      default: '',
    },
    maxErrorText: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    resultRegionId: {
      type: String,
      default: 'management-list-results',
    },
  },
  data() {
    return {
      composing: false,
      touched: false,
    };
  },
  computed: {
    resolvedLabel() {
      return this.label || this.$t('検索');
    },
    hasValue() {
      return this.modelValue !== null && this.modelValue !== undefined && String(this.modelValue).length > 0;
    },
    invalid() {
      return this.touched && (this.showMinError || this.showMaxError);
    },
    errorText() {
      if (!this.invalid) return '';
      if (this.showMinError) return this.minErrorText;
      return this.showMaxError ? this.maxErrorText : '';
    },
  },
  methods: {
    focus() {
      if (this.$refs.searchInput) this.$refs.searchInput.focus();
    },
    onBlur() {
      this.touched = true;
      this.$emit('blur');
    },
    onSearch() {
      if (this.disabled || this.composing) return;
      this.touched = true;
      this.$emit('search');
    },
    onClear() {
      if (this.disabled) return;
      this.touched = false;
      this.$emit('update:modelValue', '');
      this.$emit('clear');
      this.$nextTick(() => this.focus());
    },
  },
};
</script>

<style scoped>
.search-field__form {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.search-field__input {
  flex: 1 1 12rem;
  min-width: 0;
}

.search-field__input::-webkit-search-cancel-button {
  appearance: none;
}

.search-field__input::-ms-clear {
  display: none;
}

.search-field__actions {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: 100%;
}

.search-field__actions .search-field__button {
  flex: 0 0 auto;
  margin: 0;
}
</style>
