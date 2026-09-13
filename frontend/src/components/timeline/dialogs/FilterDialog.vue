<template>
  <BaseEditDialog
    class="filter-dialog"
    :visible="visible"
    title-id="filtering_timeline_dialog_title"
    :title-text="$t('絞り込み')"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t('決定')"
    :actions-adjacent="true"
    initial-focus="#keyword"
    cancel-test-id="dialog-filter-cancel-desktop"
    mobile-cancel-test-id="dialog-filter-cancel-mobile"
    confirm-test-id="dialog-filter-submit"
    data-testid="dialog-filter"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <section class="filter-section" aria-labelledby="filter_search_title">
      <h3 id="filter_search_title" class="filter-section-title">{{ $t('filterDialog.searchConditions') }}</h3>

      <div class="filter-group">
        <UiField
          class="filter-field"
          control-id="keyword"
          :label="$t('キーワード')"
          :description="$t('200文字まで')"
          stacked
          :invalid="v$.keyword.$dirty && v$.keyword.$invalid"
          :error="v$.keyword.$dirty && v$.keyword.maxLength.$invalid ? $t('200文字まで') : ''"
        >
          <template #default="{ controlAttrs }">
            <input v-bind="controlAttrs" v-model="keyword" dir="auto" @blur="v$.keyword.$touch()" />
          </template>
        </UiField>
        <fieldset class="filter-search-method">
          <legend><span class="screen-reader-only">{{ $t('キーワード') + ' ' }}</span>{{ $t('filterDialog.searchMethod') }}</legend>
          <div class="filter-options">
            <label class="filter-choice" for="id_logical_operator_or">
              <input type="radio" id="id_logical_operator_or" name="name_logical_operator" value="or" v-model="logicalOperator" />
              <span>{{ $t('OR検索') }}</span>
            </label>
            <label class="filter-choice" for="id_logical_operator_and">
              <input type="radio" id="id_logical_operator_and" name="name_logical_operator" value="and" v-model="logicalOperator" />
              <span>{{ $t('AND検索') }}</span>
            </label>
          </div>
        </fieldset>
      </div>

      <div class="filter-group">
        <UiField
          class="filter-field"
          control-id="user_name"
          :label="$t('ユーザ名')"
          :description="$t('20文字まで')"
          stacked
          :invalid="v$.userName.$dirty && v$.userName.$invalid"
          :error="v$.userName.$dirty && v$.userName.maxLength.$invalid ? $t('20文字まで') : ''"
        >
          <template #default="{ controlAttrs }">
            <input v-bind="controlAttrs" v-model="userName" dir="auto" aria-required="false" @blur="v$.userName.$touch()" />
          </template>
        </UiField>
      </div>

      <fieldset class="filter-group filter-tags" aria-labelledby="filter_tag_title">
        <legend class="filter-tag-heading">
          <span class="filter-tag-heading-content">
            <span id="filter_tag_title" class="filter-group-title">{{ $t('タグ') }}</span>
            <span class="filter-tag-actions">
              <UiButton appearance="filled" tone="neutral" @click.stop="onPressAllButton">{{ $t('一括選択') }}</UiButton>
              <UiButton appearance="filled" tone="neutral" @click.stop="onPressClearButton">{{ $t('一括解除') }}</UiButton>
            </span>
          </span>
        </legend>
        <div class="filter-tag-options tag-options">
          <label
            v-for="tag in [...tags].sort((a, b) => a.order - b.order)"
            :key="tag._id"
            class="filter-choice tag-option"
            :for="tagCheckboxId(tag._id)"
          >
            <input
              type="checkbox"
              :id="tagCheckboxId(tag._id)"
              :value="tag._id"
              v-model="selectedTags"
              @change="changeCheckBox({ key: tag._id })"
            />
            <span dir="auto">{{ getTagName(tag) }}</span>
          </label>
        </div>
        <fieldset class="filter-search-method">
          <legend><span class="screen-reader-only">{{ $t('タグ') + ' ' }}</span>{{ $t('filterDialog.searchMethod') }}</legend>
          <div class="filter-options">
            <label class="filter-choice" for="tag_search_or">
              <input type="radio" id="tag_search_or" name="tag_search_operator" value="or" v-model="tagSearchOperator" />
              <span>{{ $t('OR検索') }}</span>
            </label>
            <label class="filter-choice" for="tag_search_and">
              <input type="radio" id="tag_search_and" name="tag_search_operator" value="and" v-model="tagSearchOperator" />
              <span>{{ $t('AND検索') }}</span>
            </label>
          </div>
        </fieldset>
      </fieldset>

      <fieldset class="filter-group filter-other-conditions">
        <legend class="filter-group-title">{{ $t('filterDialog.otherConditions') }}</legend>
        <div class="filter-checkbox-list">
          <label class="filter-choice" for="input_notags">
            <input type="checkbox" id="input_notags" v-model="noTags" @change="changeCheckBox({ key: 'notags' })" />
            <span>{{ $t('タグ無し') }}</span>
          </label>
          <label class="filter-choice" for="animation">
            <input type="checkbox" id="animation" v-model="animation" @change="changeCheckBox({ key: 'animation' })" />
            <span>{{ $t('流す') }}</span>
          </label>
        </div>
      </fieldset>
    </section>

    <section class="filter-section" aria-labelledby="filter_display_title">
      <h3 id="filter_display_title" class="filter-section-title">{{ $t('filterDialog.displaySettings') }}</h3>
      <fieldset class="filter-group">
        <legend>{{ $t('filterDialog.matchingContent') }}</legend>
        <div class="filter-options">
          <label class="filter-choice" for="filter_mode_include">
            <input type="radio" id="filter_mode_include" name="filter_mode" value="include" v-model="filterMode" />
            <span>{{ $t('表示する') }}</span>
          </label>
          <label class="filter-choice" for="filter_mode_exclude">
            <input type="radio" id="filter_mode_exclude" name="filter_mode" value="exclude" v-model="filterMode" />
            <span>{{ $t('表示しない') }}</span>
          </label>
        </div>
      </fieldset>
      <fieldset class="filter-group">
        <legend>{{ $t('関連する投稿を表示') }}</legend>
        <div class="filter-options">
          <label class="filter-choice" for="show_range_all">
            <input type="radio" id="show_range_all" value="all" name="show_range" v-model="showRange" />
            <span>{{ $t('する') }}</span>
          </label>
          <label class="filter-choice" for="show_range_target">
            <input type="radio" id="show_range_target" value="target" name="show_range" v-model="showRange" />
            <span>{{ $t('しない') }}</span>
          </label>
        </div>
      </fieldset>
      <div class="filter-group">
        <label class="filter-choice" for="show_user_icon">
          <input type="checkbox" id="show_user_icon" v-model="showUserIcon" />
          <span>{{ $t('ユーザアイコンを表示する') }}</span>
        </label>
      </div>
      <fieldset v-if="$store.getters.userIsLogin && oneSignalPushAvailable" class="filter-group filter-notifications">
        <legend class="filter-group-title">{{ $t('filterDialog.notifications') }}</legend>
        <label class="filter-choice" for="webpush_flag">
          <input type="checkbox" id="webpush_flag" v-model="webPush" :disabled="disableWebPush || !hasFilterConditions()" />
          <span>{{ $t('Webプッシュ通知を行う') }}</span>
        </label>
      </fieldset>
    </section>
  </BaseEditDialog>

  <ConfirmDialog
    :dialog-visible="discardConfirmVisible"
    :title="$t('確認')"
    :message="$t('編集中のコンテンツは失われます')"
    :confirm-label="$t('破棄')"
    :cancel-label="$t('キャンセル')"
    confirm-tone="danger"
    confirm-icon="delete"
    :actions-adjacent="true"
    :close-on-escape="true"
    :close-on-backdrop="true"
    @confirm="confirmDiscard"
    @cancel="cancelDiscard"
    @closed="closedDiscardConfirm"
  />
</template>

<script>
import { useId } from 'vue';
import { useOptionsVuelidate } from '@/utils/validation';
import { minLength, maxLength } from '@vuelidate/validators';
import TranslationUtil from '@/utils/translationUtil';
import { splitFilterKeyword } from '@/features/timeline/queryFilters';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';

export default {
  emits: ['close', 'create', 'update'],
  name: 'FilterDialog',
  components: {
    BaseEditDialog,
    ConfirmDialog,
    UiButton,
    UiField,
  },
  setup() {
    const tagCheckboxPrefix = useId();
    return {
      v$: useOptionsVuelidate(),
      tagCheckboxId: (tagId) => `${tagCheckboxPrefix}-tag-checkbox-${tagId}`,
    };
  },
  props: {
    dialogVisible: Boolean,
    filterIndex: Number,
    filter: Object,
    tags: Array,
    disableWebPush: Boolean,
  },
  computed: {
    oneSignalPushAvailable() {
      return this.$store.getters.oneSignalPushAvailable;
    },
    isCreating() {
      return this.filterIndex === null;
    },
  },
  data() {
    return {
      displayOrder: [],
      filterMode: 'include',
      showRange: 'all',
      keyword: null,
      logicalOperator: 'or',
      keywordArray: [],
      userName: null,
      selectedTags: [],
      tagSearchOperator: 'or',
      noTags: false,
      animation: false,
      webPush: false,
      showUserIcon: true,

      visible: this.dialogVisible,
      initialSnapshot: null,
      discardConfirmVisible: false,
      closeAfterDiscard: false,
    };
  },
  validations: {
    keyword: {
      minLength: minLength(1),
      maxLength: maxLength(200),
    },
    userName: {
      minLength: minLength(1),
      maxLength: maxLength(20),
    },
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  methods: {
    openedDialog() {
      if (this.filter !== null) {
        if (this.filter.conditions !== undefined && this.filter.conditions !== null) {
          const conditions = this.filter.conditions;
          this.keyword = conditions.keyword;
          this.selectedTags = [...conditions.tags];
          this.noTags = conditions.noTags;
          this.animation = conditions.animation;
          this.displayOrder = Array.isArray(conditions.displayOrder)
            ? conditions.displayOrder.filter((item) => item && item.key).map((item) => ({ key: item.key }))
            : [];

          // 保存済み条件にfilterModeがない場合はincludeを使用する。
          if (typeof conditions.filterMode !== 'undefined') {
            this.filterMode = conditions.filterMode;
          } else {
            this.filterMode = 'include';
          }

          if (typeof conditions.showRange !== 'undefined') {
            this.showRange = conditions.showRange;
          } else {
            this.showRange = 'all';
          }

          if (typeof conditions.keywordArray !== 'undefined') {
            this.keywordArray = [...conditions.keywordArray];
          }

          if (typeof conditions.logicalOperator !== 'undefined') {
            this.logicalOperator = conditions.logicalOperator;
          }

          if (typeof conditions.userName !== 'undefined') {
            this.userName = conditions.userName;
          }

          if (typeof conditions.tagSearchOperator !== 'undefined') {
            this.tagSearchOperator = conditions.tagSearchOperator;
          }
        }

        if (this.filter.webPush !== undefined && this.filter.webPush !== null) {
          this.webPush = this.filter.webPush;
        } else {
          this.webPush = false;
        }

        if (this.filter.showUserIcon !== undefined && this.filter.showUserIcon !== null) {
          this.showUserIcon = this.filter.showUserIcon;
        } else {
          this.showUserIcon = true;
        }
      }
      if (this.oneSignalPushAvailable && this.disableWebPush) {
        this.webPush = false;
      }
      this.initialSnapshot = this.getEditSnapshot();
    },

    getTagName(tag) {
      return TranslationUtil.getTagName(tag, this.$i18n.locale);
    },

    onPressAllButton() {
      const ids = [];
      for (let i = 0; i < this.tags.length; i++) {
        const tag = this.tags[i];
        const index = this.displayOrder.findIndex(({ key }) => key === tag._id);
        if (index === -1) {
          this.displayOrder.push({ key: tag._id });
        }
        ids.push(tag._id);
      }
      this.selectedTags = ids;
    },

    onPressClearButton() {
      const tmp = this.displayOrder.filter((item) => {
        return item.key === 'notags' || item.key === 'animation';
      });
      this.displayOrder = tmp;
      this.selectedTags = [];
    },

    changeCheckBox(item) {
      // タグはチェックした順に並べるため、選択時に末尾へ追加する。
      const index = this.displayOrder.findIndex(({ key }) => key === item.key);
      if (index === -1) {
        this.displayOrder.push(item);
      } else {
        this.displayOrder.splice(index, 1);
      }
    },

    editFilter() {
      this.keywordArray = this.splitKeyword(this.keyword);

      const conditions = {
        filterMode: this.filterMode,
        showRange: this.showRange,
        keyword: this.keyword,
        keywordArray: this.keywordArray,
        logicalOperator: this.logicalOperator,
        tags: this.selectedTags,
        tagSearchOperator: this.tagSearchOperator,
        noTags: this.noTags,
        animation: this.animation,
        displayOrder: this.displayOrder,
        userName: this.userName,
      };

      const payload = {
        conditions,
        webPush: this.webPushForSave(true),
        showUserIcon: this.showUserIcon,
      };
      if (this.filterIndex === null) {
        this.$emit('create', payload);
      } else {
        this.$emit('update', this.filterIndex, payload);
      }
    },

    splitKeyword(keyword) {
      return splitFilterKeyword(keyword);
    },

    hasFilterConditions() {
      if (this.keyword && this.keyword.trim().length > 0) return true;
      if (this.selectedTags.length !== 0) return true;
      if (this.noTags) return true;
      if (this.animation) return true;
      if (this.userName && this.userName.trim().length > 0) return true;
      return false;
    },

    webPushForSave(hasConditions) {
      if (!this.oneSignalPushAvailable) {
        return this.filter && typeof this.filter.webPush === 'boolean' ? this.filter.webPush : false;
      }
      if (!hasConditions) return false;
      return this.disableWebPush ? false : this.webPush;
    },

    onPressCancelButton() {
      if (this.hasUnsavedChanges()) {
        this.discardConfirmVisible = true;
        return;
      }
      this.visible = false;
    },

    getEditSnapshot() {
      return JSON.stringify({
        displayOrder: this.displayOrder,
        filterMode: this.filterMode,
        showRange: this.showRange,
        keyword: this.keyword,
        logicalOperator: this.logicalOperator,
        userName: this.userName,
        selectedTags: [...this.selectedTags].sort(),
        tagSearchOperator: this.tagSearchOperator,
        noTags: this.noTags,
        animation: this.animation,
        webPush: this.webPush,
        showUserIcon: this.showUserIcon,
      });
    },

    hasUnsavedChanges() {
      return this.initialSnapshot !== null && this.initialSnapshot !== this.getEditSnapshot();
    },

    confirmDiscard() {
      this.closeAfterDiscard = true;
      this.discardConfirmVisible = false;
    },

    cancelDiscard() {
      this.discardConfirmVisible = false;
    },

    closedDiscardConfirm() {
      if (!this.closeAfterDiscard) return;
      this.closeAfterDiscard = false;
      this.visible = false;
    },

    onPressDoneButton() {
      this.v$.$touch();
      if (this.v$.$invalid) return;

      if (this.hasFilterConditions()) {
        this.editFilter();
        return;
      }

      // 条件が空の場合はnullを保存し、OneSignalが有効ならWebプッシュ通知も無効にする。
      const payload = {
        conditions: null,
        webPush: this.webPushForSave(false),
        showUserIcon: this.showUserIcon,
      };

      if (this.isCreating) {
        this.$emit('create', payload);
      } else {
        this.$emit('update', this.filterIndex, payload);
      }
      this.visible = false;
    },

    clearValue() {
      this.v$.$reset();

      this.initialSnapshot = null;
      this.discardConfirmVisible = false;
      this.closeAfterDiscard = false;

      this.displayOrder = [];
      this.filterMode = 'include';
      this.showRange = 'all';
      this.keyword = null;
      this.logicalOperator = 'or';
      this.keywordArray = [];
      this.userName = null;
      this.tagSearchOperator = 'or';
      this.selectedTags = [];
      this.noTags = false;
      this.animation = false;
      this.webPush = false;
      this.showUserIcon = true;
    },

    closedDialog(payload) {
      this.clearValue();
      this.$emit('close', payload);
    },
  },
};
</script>

<style scoped>
@media screen and (max-width: 896px) {
  :global(.filter-dialog) {
    --ui-dialog-width: 600px;
  }
}
:global(.filter-dialog .ui-dialog__actions) {
  border-top: 1px solid #ddd;
}
.filter-section {
  min-width: 0;
  padding: 8px 0;
  overflow-wrap: anywhere;
}
.filter-section + .filter-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #ddd;
}
.filter-section-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 600;
}
.filter-group + .filter-group {
  margin-top: 24px;
}
.filter-group,
.filter-search-method {
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 0;
}
.filter-group > legend {
  margin-bottom: 12px;
  padding: 0;
}
.filter-group-title {
  font-size: 16px;
  font-weight: 600;
}
.filter-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  margin: 0;
  padding: 0;
}
.filter-field :deep(.ui-field__label) {
  position: static;
  grid-area: 1 / 1;
  max-width: none;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: inherit;
  white-space: normal;
  pointer-events: auto;
  transition: none;
}
.filter-field :deep(.ui-field__description) {
  grid-area: 1 / 2;
  align-self: center;
  color: #555;
  font-size: 13px;
}
.filter-field :deep(.ui-field__control) {
  grid-area: 2 / 1 / auto / -1;
  min-width: 0;
}
.filter-field :deep(.ui-field__error) {
  grid-column: 1 / -1;
}
.filter-search-method {
  margin-top: 12px;
}
.filter-search-method > legend {
  float: inline-start;
  margin-inline-end: 16px;
  padding: 0;
  line-height: 1.5;
}
.filter-options,
.filter-tag-heading-content,
.filter-tag-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.filter-tag-heading {
  width: 100%;
}
.filter-tag-heading-content {
  justify-content: space-between;
}
.filter-tag-actions {
  gap: 8px;
}
.filter-tag-actions :deep(.ui-button) {
  margin: 0;
  font-size: 14px;
}
.filter-checkbox-list {
  display: grid;
  gap: 12px;
}
.filter-choice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 0;
  font-size: 16px;
  line-height: 1.5;
  cursor: pointer;
}
.filter-choice input {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin: 4px 0 0;
}
.filter-choice span {
  min-width: 0;
}
@media (max-width: 480px) {
  .filter-field {
    grid-template-columns: minmax(0, 1fr);
  }
  .filter-field :deep(.ui-field__description) {
    grid-area: 2 / 1;
  }
  .filter-field :deep(.ui-field__control) {
    grid-area: 3 / 1;
  }
}
</style>

<style scoped src="@/styles/tag-options.css"></style>
