<template>
  <section
    class="ai-analysis-setting-fields"
    :aria-labelledby="formTitleId"
    :aria-busy="busy ? 'true' : 'false'"
  >
    <UiField
      v-slot="{ controlAttrs }"
      :control-id="tagId"
      :label="$t('aiAnalysisSettings.tag')"
      :invalid="Boolean(tagError)"
      :error="tagError"
      stacked
    >
      <select
        v-bind="controlAttrs"
        ref="tagSelect"
        :value="tagValue"
        :disabled="sending"
        required
        @change="$emit('update:tagValue', $event.target.value)"
      >
        <option disabled value="">{{ $t('aiAnalysisSettings.selectTag') }}</option>
        <option v-for="tag in tags" :key="tag._id" :value="tag._id" dir="auto">
          {{ tagLabel(tag) }}
        </option>
      </select>
    </UiField>

    <UiField
      v-slot="{ controlAttrs }"
      :control-id="kindId"
      :label="$t('aiAnalysisSettings.kind')"
      :invalid="Boolean(kindError)"
      :error="kindError"
      stacked
    >
      <select
        v-bind="controlAttrs"
        ref="kindSelect"
        :value="kindValue"
        :disabled="sending"
        required
        @change="$emit('update:kindValue', $event.target.value)"
      >
        <option disabled value="">{{ $t('aiAnalysisSettings.selectKind') }}</option>
        <option v-for="kind in analysisKinds" :key="kind" :value="kind">
          {{ kindLabel(kind) }}
        </option>
      </select>
    </UiField>

    <UiField
      v-slot="{ controlAttrs }"
      :control-id="promptId"
      :label="$t('aiAnalysisSettings.prompt')"
      :description="promptDescription"
      :invalid="Boolean(promptError)"
      :error="promptError"
    >
      <textarea
        v-bind="controlAttrs"
        ref="promptInput"
        :value="promptValue"
        rows="5"
        dir="auto"
        :disabled="sending"
        @input="$emit('update:promptValue', $event.target.value)"
      />
    </UiField>

    <UiField
      v-slot="{ controlAttrs }"
      class="ai-analysis-setting-fields__result-user-search"
      :control-id="resultUserSearchId"
      :label="$t('aiAnalysisSettings.managementResultUser')"
      :description="$t('aiAnalysisSettings.resultUserSearchHint')"
      :invalid="Boolean(resultUserError)"
      :error="resultUserError"
    >
      <div class="ai-analysis-setting-fields__search-control">
        <input
          v-bind="controlAttrs"
          ref="resultUserSearchInput"
          :value="searchValue"
          type="search"
          maxlength="100"
          dir="auto"
          :disabled="searchLocked"
          @input="$emit('update:searchValue', $event.target.value)"
          @keydown.enter.prevent="$emit('search')"
        />
        <UiButton
          type="button"
          appearance="filled"
          tone="primary"
          :disabled="searchLocked"
          @click="$emit('search')"
        >
          {{ $t('aiAnalysisSettings.search') }}
        </UiButton>
      </div>
    </UiField>

    <p v-if="searching && loadingText" role="status">{{ loadingText }}</p>
    <p v-else-if="searchError" role="alert">{{ searchError }}</p>
    <i18n-t
      v-if="selectedResultUser && !searchCompleted"
      keypath="aiAnalysisSettings.selectedResultUser"
      tag="p"
      scope="global"
      class="ai-analysis-setting-fields__selected-user"
      dir="auto"
    >
      <template #user>
        <span class="ai-analysis-setting-fields__user-summary">
          <UiAvatar :size="28" aria-hidden="true">
            <img
              v-if="resultUserImagePath(selectedResultUser)"
              :key="resultUserImagePath(selectedResultUser)"
              :src="resultUserImagePath(selectedResultUser)"
              alt=""
              @error="onResultUserImageError"
            />
            <UiIcon v-else name="person" :size="24" />
          </UiAvatar>
          <span class="ai-analysis-setting-fields__user-name" dir="auto">
            {{ resolveUserDisplayName(selectedResultUser) }}
          </span>
        </span>
      </template>
    </i18n-t>

    <fieldset
      v-if="searchCompleted"
      class="ai-analysis-setting-fields__result-user-list"
      :disabled="searchLocked"
    >
      <legend>{{ $t('aiAnalysisSettings.resultUserSearchResults') }}</legend>
      <p v-if="resultUsers.length === 0" role="status">
        {{ $t('aiAnalysisSettings.resultUserSearchEmpty') }}
      </p>
      <label
        v-for="user in resultUsers"
        :key="user._id"
        class="ai-analysis-setting-fields__result-user-option"
        dir="auto"
      >
        <input
          :checked="resultUserValue === user._id"
          type="radio"
          :value="user._id"
          :disabled="searchLocked"
          @change="$emit('update:resultUserValue', user._id)"
        />
        <UiAvatar :size="28" aria-hidden="true">
          <img
            v-if="resultUserImagePath(user)"
            :key="resultUserImagePath(user)"
            :src="resultUserImagePath(user)"
            alt=""
            @error="onResultUserImageError"
          />
          <UiIcon v-else name="person" :size="24" />
        </UiAvatar>
        <span class="ai-analysis-setting-fields__user-name" dir="auto">
          {{ resolveUserDisplayName(user) }}
        </span>
      </label>
    </fieldset>

    <p v-if="validationError" class="ai-analysis-setting-fields__form-error" role="alert">
      {{ validationError }}
    </p>
  </section>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'AIAnalysisSettingFormFields',
  components: {
    UiButton,
    UiField,
    UiAvatar,
    UiIcon,
  },
  emits: [
    'search',
    'update:kindValue',
    'update:promptValue',
    'update:resultUserValue',
    'update:searchValue',
    'update:tagValue',
  ],
  props: {
    idPrefix: { type: String, required: true },
    formTitleId: { type: String, required: true },
    tagValue: { type: String, default: '' },
    kindValue: { type: String, default: '' },
    promptValue: { type: String, default: '' },
    resultUserValue: { type: String, default: '' },
    searchValue: { type: String, default: '' },
    tags: { type: Array, default: () => [] },
    tagLabel: { type: Function, default: (tag) => tag?.name || '' },
    analysisKinds: { type: Array, default: () => [] },
    kindLabel: { type: Function, required: true },
    tagError: { type: String, default: '' },
    kindError: { type: String, default: '' },
    promptDescription: { type: String, default: '' },
    promptError: { type: String, default: '' },
    resultUserError: { type: String, default: '' },
    resultUsers: { type: Array, default: () => [] },
    selectedResultUser: { type: Object, default: null },
    searchCompleted: { type: Boolean, default: false },
    searching: { type: Boolean, default: false },
    sending: { type: Boolean, default: false },
    searchError: { type: String, default: '' },
    loadingText: { type: String, default: '' },
    validationError: { type: String, default: '' },
  },
  data() {
    return { failedUserImagePaths: new Set() };
  },
  computed: {
    busy() {
      return this.sending || this.searching;
    },
    searchLocked() {
      return this.sending || this.searching;
    },
    tagId() {
      return `${this.idPrefix}-tag`;
    },
    kindId() {
      return `${this.idPrefix}-kind`;
    },
    promptId() {
      return `${this.idPrefix}-prompt`;
    },
    resultUserSearchId() {
      return `${this.idPrefix}-result-user-search`;
    },
  },
  methods: {
    ...userDisplayMethods,
    resultUserImagePath(user) {
      const path = this.getUserDisplayImagePath(user);
      return this.failedUserImagePaths.has(path) ? null : path;
    },
    onResultUserImageError(event) {
      const path = event.target.getAttribute('src');
      if (path) this.failedUserImagePaths.add(path);
    },
    focusTag() {
      return this.focusControl(this.$refs.tagSelect);
    },
    focusKind() {
      return this.focusControl(this.$refs.kindSelect);
    },
    focusPrompt() {
      return this.focusControl(this.$refs.promptInput);
    },
    focusResultUserSearch() {
      return this.focusControl(this.$refs.resultUserSearchInput);
    },
    focusControl(target) {
      if (!target || typeof target.focus !== 'function') return false;
      target.focus({ preventScroll: true });
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      return true;
    },
  },
};
</script>

<style scoped>
.ai-analysis-setting-fields {
  display: grid;
  gap: 16px;
}

.ai-analysis-setting-fields textarea,
.ai-analysis-setting-fields select,
.ai-analysis-setting-fields input[type='search'] {
  box-sizing: border-box;
  width: 100%;
}

.ai-analysis-setting-fields__search-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.ai-analysis-setting-fields__search-control input {
  min-width: 0;
}

.ai-analysis-setting-fields__search-control :deep(.ui-button) {
  align-self: stretch;
  margin: 0;
}

.ai-analysis-setting-fields__result-user-list {
  min-width: 0;
  margin: 0;
}

.ai-analysis-setting-fields__selected-user {
  min-width: 0;
  margin: 0;
}

.ai-analysis-setting-fields__user-summary {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  vertical-align: middle;
}

.ai-analysis-setting-fields__user-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ai-analysis-setting-fields__result-user-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.ai-analysis-setting-fields__result-user-option input[type='radio'] {
  flex-shrink: 0;
}

.ai-analysis-setting-fields__form-error {
  margin: 0;
  color: var(--ui-color-danger);
}

@media screen and (max-width: 896px) {
  .ai-analysis-setting-fields__search-control {
    grid-template-columns: 1fr;
  }
}
</style>
