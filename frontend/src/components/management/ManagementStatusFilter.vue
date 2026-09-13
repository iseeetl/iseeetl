<template>
  <UiField :control-id="controlId" :label="$t('managementUi.filterLabel')">
    <template #default="{ controlAttrs }">
      <select
        v-bind="controlAttrs"
        class="native-select management-status-filter"
        :value="modelValue"
        :disabled="disabled"
        @change="onChange"
      >
        <option value="all">{{ $t('managementUi.filterAll') }}</option>
        <option value="active">{{ $t('managementUi.filterActive') }}</option>
        <option value="deleted">{{ $t('managementUi.filterDeleted') }}</option>
      </select>
    </template>
  </UiField>
</template>

<script>
import { useId } from 'vue';
import UiField from '@/components/ui/UiField.vue';

const FILTER_VALUES = ['active', 'deleted', 'all'];

export default {
  name: 'ManagementStatusFilter',
  components: {
    UiField,
  },
  emits: ['update:modelValue', 'change'],
  props: {
    modelValue: {
      type: String,
      default: 'all',
      validator: (value) => FILTER_VALUES.includes(value),
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    return {
      controlId: `management-status-filter-${useId()}`,
    };
  },
  methods: {
    onChange(event) {
      const value = event.target.value;
      if (!FILTER_VALUES.includes(value)) return;
      this.$emit('update:modelValue', value);
      this.$emit('change', value);
    },
  },
};
</script>
