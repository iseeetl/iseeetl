<template>
  <UiField :control-id="controlId" :label="$t('sourceLanguage.label')" :description="$t('sourceLanguage.hint')" stacked>
    <template #default="{ controlAttrs }">
      <select v-bind="controlAttrs" :value="modelValue || ''" :disabled="disabled"
        @change="$emit('update:modelValue', $event.target.value)">
        <option v-if="!modelValue" value="" disabled>{{ $t('sourceLanguage.unknown') }}</option>
        <option v-for="language in languages" :key="language.value" :value="language.value">{{ $t(language.label) }}</option>
      </select>
    </template>
  </UiField>
</template>
<script>
import UiField from '@/components/ui/UiField.vue';
import { LANGUAGES } from '@/constants/languages';
export default {
  components: { UiField }, emits: ['update:modelValue'],
  props: { modelValue: { type: String, default: null }, controlId: { type: String, required: true }, disabled: Boolean },
  data: () => ({ languages: LANGUAGES }),
};
</script>
<style scoped>
select { box-sizing: border-box; max-width: 100%; min-height: 40px; padding: 6px 10px; font: inherit; color: inherit; background: #222b3b; border: 1px solid #8a96aa; border-radius: 4px; }
select:focus-visible { outline: 2px solid #c3d1ff; outline-offset: 2px; }
</style>
