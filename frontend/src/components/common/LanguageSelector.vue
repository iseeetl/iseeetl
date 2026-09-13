<template>
  <div class="select-language">
    <label :for="controlId">{{ $t('言語') }}</label>
    <div>
      <select :id="controlId" class="input-select" v-model="selectedLang" @change="changeLang">
        <option v-for="lang in languages" :key="lang.value" :value="lang.value">
          {{ $t(lang.label, {}, { locale: browserLocale }) }}
        </option>
      </select>
    </div>
  </div>
</template>

<script>
import { LANGUAGES } from '@/constants/languages';
import { resolveBrowserLocale } from '@/utils/locale';

export default {
  name: 'LanguageSelector',
  emits: ['update:modelValue', 'change'],
  data() {
    return {
      selectedLang: this.modelValue,
      languages: LANGUAGES,
    };
  },
  props: {
    controlId: {
      type: String,
      default: 'lang',
    },
    modelValue: {
      type: String,
      default: null,
    },
  },
  methods: {
    changeLang() {
      this.$emit('update:modelValue', this.selectedLang);
      this.$emit('change', this.selectedLang);
    },
  },
  computed: {
    // ブラウザの言語を対応言語へ正規化し、未対応の場合は英語を使用する。
    browserLocale() {
      return resolveBrowserLocale(window.navigator);
    },
  },
  watch: {
    modelValue(newValue) {
      this.selectedLang = newValue;
    },
  },
};
</script>

<style scoped>
.select-language {
  display: flex;
  flex-direction: column;
}
</style>
