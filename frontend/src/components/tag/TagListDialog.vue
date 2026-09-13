<template>
  <UiDialog
    class="tag-list-dialog"
    ref="dialogRootRef"
    :open="visible"
    :title-id="config.titleId"
    :description-ids="scopeName ? contextId : undefined"
    :initial-focus="`#${config.titleId}`"
    :close-on-escape="!closeBlocked"
    :close-on-backdrop="!closeBlocked"
    @request-close="onRequestClose"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="headerStartLabel"
        :disabled="closeBlocked"
        @click.stop="onPressHeaderStartButton"
      >
        <UiIcon :name="headerStartIcon" />
      </UiButton>
      <h2 :id="config.titleId" class="ui-dialog__heading" tabindex="-1">
        {{ currentTitle }}
      </h2>
      <UiButton
        :id="listVisible ? `${config.titleId}_create_mobile` : `${config.titleId}_submit_mobile`"
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="primary"
        icon-only
        :aria-label="headerEndLabel"
        :disabled="busy"
        @click.stop="onPressHeaderEndButton($event)"
      >
        <UiIcon :name="headerEndIcon" />
      </UiButton>
    </template>

    <DialogTargetContext
      v-if="scopeName"
      class="tag-list-target-context"
      :context-id="contextId"
      :label="$t(config.targetLabelKey)"
      :name="scopeName"
    />

    <div v-show="listVisible" class="tag-list-screen" data-testid="tag-list-screen">
      <div v-if="!loading && !loadFailed" class="tag-list-summary">
        <span>{{ $t('全{total}件', { total: formattedTagCount }, tags.length) }}</span>
        <UiButton
          :id="`${config.titleId}_create_desktop`"
          class="tag-list-create-button desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="busy"
          @click.stop="onPressCreateButton($event)"
        >
          {{ $t('作成') }}
        </UiButton>
      </div>

      <div v-if="loading" class="tag-list-state" role="status">
        {{ $t('読み込み中です') }}
      </div>

      <div v-else-if="loadFailed" class="tag-list-state tag-list-state--error" role="alert">
        <p>{{ $t(config.fetchFailureKey) }}</p>
        <UiButton appearance="filled" tone="primary" :disabled="busy" @click="fetchTags">
          {{ $t('再試行') }}
        </UiButton>
      </div>

      <template v-else>
        <div v-if="tags.length" class="tag-table-scroll desktop-item" data-testid="tag-list-desktop">
          <table class="tag-table" :aria-label="$t(config.titleKey)">
            <colgroup>
              <col class="tag-table__order-column" />
              <col />
              <col class="tag-table__actions-column" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{{ $t('表示順') }}</th>
                <th scope="col">{{ $t('タグ名・翻訳') }}</th>
                <th scope="col">{{ $t('操作') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tag in tags" :key="tag._id">
                <td>{{ tag.order }}</td>
                <td class="tag-name-cell">
                  <div class="main-content">
                    <strong>{{ computeLangLabel(tag.lang) }}:</strong>
                    <span dir="auto">{{ tag.name }}</span>
                  </div>

                  <div v-if="tag.translations && tag.translations.length" class="translations-wrap">
                    <div
                      v-for="trans in tag.translations"
                      :key="`${tag._id}-${trans.lang}`"
                      class="translation-item"
                    >
                      <strong>{{ computeLangLabel(trans.lang) }}:</strong>
                      <span dir="auto">{{ trans.name }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="tag-row-actions">
                    <UiButton
                      :id="editButtonId(tag, 'desktop')"
                      appearance="filled"
                      tone="primary"
                      :aria-label="editActionLabel(tag)"
                      :disabled="busy"
                      @click="onPressUpdateButton($event, tag)"
                    >
                      {{ $t('編集') }}
                    </UiButton>
                    <UiButton
                      :id="deleteButtonId(tag, 'desktop')"
                      appearance="filled"
                      tone="danger"
                      :aria-label="deleteActionLabel(tag)"
                      :disabled="busy"
                      @click="onPressDeleteButton($event, tag)"
                    >
                      {{ $t('削除') }}
                    </UiButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul v-if="tags.length" class="tag-card-list mobile-item" data-testid="tag-list-mobile">
          <li v-for="tag in tags" :key="`mobile-${tag._id}`" class="tag-card">
            <div class="tag-card__order">
              <span>{{ $t('表示順') }}</span>
              <strong>{{ tag.order }}</strong>
            </div>
            <div class="tag-card__names">
              <div class="main-content">
                <strong>{{ computeLangLabel(tag.lang) }}:</strong>
                <span dir="auto">{{ tag.name }}</span>
              </div>
              <div v-if="tag.translations && tag.translations.length" class="translations-wrap">
                <div
                  v-for="trans in tag.translations"
                  :key="`mobile-${tag._id}-${trans.lang}`"
                  class="translation-item"
                >
                  <strong>{{ computeLangLabel(trans.lang) }}:</strong>
                  <span dir="auto">{{ trans.name }}</span>
                </div>
              </div>
            </div>
            <div class="tag-card__actions">
              <UiButton
                :id="editButtonId(tag, 'mobile')"
                appearance="filled"
                tone="primary"
                :aria-label="editActionLabel(tag)"
                :disabled="busy"
                @click="onPressUpdateButton($event, tag)"
              >
                {{ $t('編集') }}
              </UiButton>
              <UiButton
                :id="deleteButtonId(tag, 'mobile')"
                appearance="filled"
                tone="danger"
                :aria-label="deleteActionLabel(tag)"
                :disabled="busy"
                @click="onPressDeleteButton($event, tag)"
              >
                {{ $t('削除') }}
              </UiButton>
            </div>
          </li>
        </ul>

        <p v-if="!tags.length" class="tag-list-empty">{{ $t('データがありません') }}</p>
      </template>

      <section v-if="!loading && !loadFailed" class="tag-tool-section tag-tool-section--csv">
        <h3 class="tag-tool-section__heading desktop-item">{{ $t('CSV入出力') }}</h3>
        <button
          class="tag-tool-toggle mobile-item"
          type="button"
          :aria-expanded="csvToolsExpanded"
          :aria-controls="csvPanelId"
          :disabled="busy"
          @click="csvToolsExpanded = !csvToolsExpanded"
        >
          <span>{{ $t('CSV入出力') }}</span>
          <UiIcon :name="csvToolsExpanded ? 'expand_less' : 'expand_more'" />
        </button>
        <div :id="csvPanelId" class="tag-tool-body" :class="{ 'is-expanded': csvToolsExpanded }">
          <p :id="config.csvExportDescriptionId" class="tag-tool-description">
            {{ $t('CSVインポート') }} / {{ $t('CSVエクスポート') }}
            <span v-if="config.scope === 'floor'">
              {{ $t('CSVインポート') }}: {{ $t('この操作は元に戻せません') }}
            </span>
          </p>
          <div class="tag-tool-actions">
            <input
              :id="config.csvInputId"
              ref="csvupload"
              class="display-none-input"
              type="file"
              accept=".csv"
              :disabled="busy"
              @change="onFileChange"
            />
            <UiButton
              data-testid="tag-csv-import-button"
              appearance="filled"
              tone="neutral"
              :aria-describedby="config.csvExportDescriptionId"
              :disabled="busy"
              @click.stop="onPressCsvSelectButton"
            >
              {{ $t('CSVインポート') }}
            </UiButton>
            <UiButton
              data-testid="tag-csv-export-button"
              appearance="filled"
              tone="neutral"
              :aria-describedby="config.csvExportDescriptionId"
              :disabled="busy"
              @click.stop="onPressOutputButton"
            >
              {{ $t('CSVエクスポート') }}
            </UiButton>
          </div>
        </div>
      </section>

      <section v-if="!loading && !loadFailed" class="tag-tool-section tag-tool-section--reset">
        <h3 class="tag-tool-section__heading desktop-item">{{ $t('親タグから再同期') }}</h3>
        <button
          class="tag-tool-toggle mobile-item"
          type="button"
          :aria-expanded="resetToolsExpanded"
          :aria-controls="resetPanelId"
          :disabled="busy"
          @click="resetToolsExpanded = !resetToolsExpanded"
        >
          <span>{{ $t('親タグから再同期') }}</span>
          <UiIcon :name="resetToolsExpanded ? 'expand_less' : 'expand_more'" />
        </button>
        <div :id="resetPanelId" class="tag-tool-body" :class="{ 'is-expanded': resetToolsExpanded }">
          <p :id="config.resetDescriptionId" class="tag-tool-description">
            {{ $t(config.resetLabelKey) }}
          </p>
          <UiButton
            appearance="filled"
            tone="danger"
            :aria-describedby="config.resetDescriptionId"
            :disabled="busy"
            @click.stop="onPressInitialButton"
          >
            {{ $t(config.resetLabelKey) }}
          </UiButton>
        </div>
      </section>
    </div>

    <div v-if="!listVisible" class="tag-editor-screen" data-testid="tag-editor-screen">
      <slot name="editor" />
    </div>

    <template #actions>
      <div
        v-if="listVisible"
        class="common-dialog-actions"
        :class="{ 'common-dialog-actions__start': !listCloseEndAligned }"
      >
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="closeBlocked"
          @click="onPressCancelButton"
        >
          {{ $t('閉じる') }}
        </UiButton>
      </div>
      <div v-else class="common-dialog-actions">
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="closeBlocked"
          @click="onPressBackButton"
        >
          {{ $t('戻る') }}
        </UiButton>
        <UiButton
          :id="`${config.titleId}_submit_desktop`"
          class="desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="busy"
          @click="onPressSubmitButton"
        >
          {{ editorSubmitLabel }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="operationLocked"
        :mode="sending ? 'determinate' : 'indeterminate'"
        :value="progressAmount"
        :aria-labelledby="config.titleId"
      />
    </template>
  </UiDialog>
</template>

<script>
import { appendApiErrorMessage } from '@/api/apiClient';
import { LANGUAGES } from '@/constants/languages';
import {
  buildTagCsvText,
  buildTagListPayload,
  downloadCsvFile,
  parseAndValidateTagCsv,
  resolveLangLabel,
  sortTagsByOrder,
} from '@/features/tag/shared/tagCore';
import { runWithSendingAndProgress } from '@/features/tag/shared/tagAsync';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  name: 'TagListDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  emits: [
    'back',
    'close',
    'create',
    'delete',
    'reset-request',
    'submit',
    'update',
  ],
  props: {
    config: {
      type: Object,
      required: true,
    },
    dialogVisible: Boolean,
    scopeId: String,
    scopeName: {
      type: String,
      default: '',
    },
    screen: {
      type: String,
      default: 'list',
      validator: (value) => value === 'list' || value === 'editor',
    },
    editorTitle: {
      type: String,
      default: '',
    },
    editorSubmitLabel: {
      type: String,
      default: '',
    },
    externalSending: {
      type: Boolean,
      default: false,
    },
    listCloseEndAligned: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      tags: [],
      languages: LANGUAGES,
      visible: this.dialogVisible,
      loading: false,
      loadFailed: false,
      loadRequestVersion: 0,
      sending: false,
      progressAmount: 0,
      csvToolsExpanded: false,
      resetToolsExpanded: false,
    };
  },
  computed: {
    contextId() {
      return `${this.config.titleId}_context`;
    },
    listVisible() {
      return this.screen === 'list';
    },
    operationLocked() {
      return this.sending || this.externalSending;
    },
    closeBlocked() {
      return this.operationLocked;
    },
    busy() {
      return this.loading || this.operationLocked;
    },
    currentTitle() {
      return this.listVisible || !this.editorTitle ? this.$t(this.config.titleKey) : this.editorTitle;
    },
    headerStartLabel() {
      return this.listVisible ? this.$t('閉じる') : this.$t('戻る');
    },
    headerStartIcon() {
      return this.listVisible ? 'close' : 'chevron_left';
    },
    headerEndLabel() {
      return this.listVisible ? this.$t('作成') : this.editorSubmitLabel;
    },
    headerEndIcon() {
      return this.listVisible ? 'add' : 'done';
    },
    csvPanelId() {
      return `${this.config.csvInputId}_panel`;
    },
    resetPanelId() {
      return `${this.config.resetDescriptionId}_panel`;
    },
    formattedTagCount() {
      if (typeof this.$n === 'function') {
        return this.$n(this.tags.length);
      }
      return String(this.tags.length);
    },
  },
  watch: {
    dialogVisible(value) {
      this.visible = value;
      if (!value) this.invalidateLoadRequests();
    },
    scopeId(nextId, previousId) {
      if (!this.visible || !nextId || nextId === previousId) return;
      this.resetListState();
      this.fetchTags();
    },
  },
  beforeUnmount() {
    this.invalidateLoadRequests();
  },
  methods: {
    openedDialog() {
      this.csvToolsExpanded = false;
      this.resetToolsExpanded = false;
      this.fetchTags();
    },

    buildScopePayload() {
      return buildTagListPayload({ scope: this.config.scope, scopeId: this.scopeId });
    },

    invalidateLoadRequests() {
      this.loadRequestVersion += 1;
    },

    resetListState() {
      this.invalidateLoadRequests();
      this.tags = [];
      this.loading = false;
      this.loadFailed = false;
    },

    async runApiTask(task) {
      return runWithSendingAndProgress({
        setSending: (value) => {
          this.sending = value;
        },
        setProgress: (value) => {
          this.progressAmount = value;
        },
        task,
      });
    },

    async fetchTags({ ignoreExternalSending = false } = {}) {
      if (
        !this.scopeId ||
        this.loading ||
        this.sending ||
        (!ignoreExternalSending && this.externalSending)
      ) {
        return;
      }

      const requestVersion = ++this.loadRequestVersion;
      this.loading = true;
      this.loadFailed = false;

      try {
        const payload = this.buildScopePayload();
        const res = await this.config.api.list(payload);
        if (requestVersion !== this.loadRequestVersion || !this.visible) return;
        this.tags = sortTagsByOrder(res.data);
      } catch (err) {
        if (requestVersion !== this.loadRequestVersion || !this.visible) return;
        this.loadFailed = true;
        this.showApiError(this.config.fetchFailureKey, err);
      } finally {
        if (requestVersion === this.loadRequestVersion) this.loading = false;
      }
    },

    computeLangLabel(langCode) {
      return resolveLangLabel(this.languages, (key) => this.$t(key), langCode);
    },

    editActionLabel(tag) {
      return this.$t('{resource}「{name}」を編集', {
        resource: this.$t(this.config.resourceLabelKey),
        name: tag.name,
      });
    },

    deleteActionLabel(tag) {
      return this.$t('「{name}」を削除します', { name: tag.name });
    },

    editButtonId(tag, presentation) {
      return `${this.config.titleId}_edit_${presentation}_${tag._id}`;
    },

    deleteButtonId(tag, presentation) {
      return `${this.config.titleId}_delete_${presentation}_${tag._id}`;
    },

    focusTag(tagId, presentation = 'desktop') {
      this.$nextTick(() => {
        const presentations = [
          presentation,
          presentation === 'desktop' ? 'mobile' : 'desktop',
        ];
        const target = tagId
          ? presentations
              .map((value) => document.getElementById(this.editButtonId({ _id: tagId }, value)))
              .find((element) => element?.isConnected && !element.disabled)
          : null;
        const focusTarget = target || document.getElementById(this.config.titleId);
        if (!focusTarget?.isConnected || typeof focusTarget.focus !== 'function') return;
        focusTarget.focus({ preventScroll: true });
        if (typeof focusTarget.scrollIntoView === 'function') {
          focusTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
    },

    onPressCancelButton() {
      if (this.closeBlocked) return;
      this.invalidateLoadRequests();
      this.visible = false;
    },
    onRequestClose() {
      if (this.listVisible) {
        this.onPressCancelButton();
        return;
      }
      this.onPressBackButton();
    },
    onPressHeaderStartButton() {
      this.onRequestClose();
    },
    onPressHeaderEndButton(event) {
      if (this.listVisible) {
        this.onPressCreateButton(event);
        return;
      }
      this.onPressSubmitButton();
    },
    onPressBackButton() {
      if (this.closeBlocked) return;
      this.$emit('back');
    },
    onPressSubmitButton() {
      if (this.busy) return;
      this.$emit('submit');
    },
    onPressCreateButton(event) {
      if (this.busy) return;
      this.$emit('create', event);
    },
    onPressUpdateButton(event, tag) {
      if (this.busy) return;
      this.$emit('update', event, tag);
    },
    onPressDeleteButton(event, tag) {
      if (this.busy) return;
      this.$emit('delete', tag, event);
    },

    onFileChange(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = this.handleCsvFileLoaded;
      reader.onerror = () => {
        if (this.$refs.csvupload) this.$refs.csvupload.value = '';
        this.setSnackbar(this.$t('CSVファイルの読み込みに失敗しました'), 'alert');
      };
    },

    onPressCsvSelectButton() {
      if (this.busy || !this.$refs.csvupload) return;
      this.$refs.csvupload.click();
    },

    async handleCsvFileLoaded(loadEvent) {
      const result = loadEvent && loadEvent.target ? loadEvent.target.result : '';
      const parsed = parseAndValidateTagCsv(result, {
        minOrder: 1,
        maxOrder: 100,
        maxNameLength: 50,
      });
      if (!parsed.isValid) {
        if (this.$refs.csvupload) this.$refs.csvupload.value = '';
        this.setSnackbar(this.$t('CSVファイルのインポートに失敗しました'), 'alert');
        return;
      }
      if (this.busy) return;

      try {
        const payload = {
          ...this.buildScopePayload(),
          csv: parsed.rows,
        };
        const res = await this.runApiTask(({ onProgress }) =>
          this.config.api.importCsv(payload, {
            onUploadProgress: onProgress,
          }),
        );
        this.tags = sortTagsByOrder(res.data);
        this.setSnackbar(this.$t('CSVファイルをインポートしました'), 'status');
      } catch (err) {
        this.showApiError('CSVファイルのインポートに失敗しました', err);
      } finally {
        if (this.$refs.csvupload) this.$refs.csvupload.value = '';
      }
    },

    async onPressOutputButton() {
      if (this.busy) return;

      try {
        const payload = this.buildScopePayload();
        const res = await this.runApiTask(({ onProgress }) =>
          this.config.api.exportCsv(payload, {
            onUploadProgress: onProgress,
          }),
        );
        if (!Array.isArray(res.data) || res.data.length === 0) {
          throw new Error('data not found');
        }
        const csvContent = buildTagCsvText(res.data);
        downloadCsvFile({ filename: this.config.csvFilename, content: csvContent });
      } catch (err) {
        this.showApiError('CSVファイルのエクスポートに失敗しました', err);
      }
    },

    async onPressInitialButton() {
      if (this.busy) return;
      if (this.config.confirmReset) {
        this.$emit('reset-request');
        return;
      }

      await this.performReset();
    },

    async performReset({ ignoreExternalSending = false } = {}) {
      if (this.loading || this.sending || (!ignoreExternalSending && this.externalSending)) return;

      try {
        const payload = this.buildScopePayload();
        const res = await this.runApiTask(({ onProgress }) =>
          this.config.api.reset(payload, {
            onUploadProgress: onProgress,
          }),
        );
        this.tags = sortTagsByOrder(res.data);
        this.setSnackbar(this.$t(this.config.resetSuccessKey), 'status');
        return true;
      } catch (err) {
        this.showApiError(this.config.resetFailureKey, err);
        return false;
      }
    },

    showApiError(baseMessageKey, err) {
      const message = appendApiErrorMessage(this.$t(baseMessageKey), err, {
        translate: this.$t,
      });
      this.setSnackbar(message, 'alert');
      this.handleAuthError(err);
    },

    clearValue() {
      this.resetListState();
    },
    closedDialog() {
      this.clearValue();
      this.csvToolsExpanded = false;
      this.resetToolsExpanded = false;
      if (!this.operationLocked) {
        this.$emit('close');
      }
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },

    handleAuthError(err) {
      return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
    },
  },
};
</script>

<style scoped>
:global(.tag-list-dialog) {
  --ui-dialog-width: 820px;
}

:global(.tag-list-dialog .ui-dialog__content) {
  padding: 0 32px 12px;
}

:global(.tag-list-dialog .ui-dialog__actions) {
  padding-inline: 32px;
}

.common-dialog-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
}

.common-dialog-actions__start {
  margin-inline-end: auto;
}

.tag-list-target-context {
  margin-bottom: 8px;
}

.tag-list-summary {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
}

.tag-list-create-button {
  margin-inline-end: 0;
}

.tag-list-state {
  padding: 24px 16px;
  color: #555;
  text-align: center;
}

.tag-list-state p {
  margin: 0 0 16px;
}

.tag-list-state--error {
  color: var(--ui-color-danger);
}

.tag-editor-screen {
  padding-top: 12px;
}

.tag-table-scroll {
  width: 100%;
  overflow-x: auto;
}

.tag-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.tag-table__order-column {
  width: 96px;
}

.tag-table__actions-column {
  width: 208px;
}

.tag-table th,
.tag-table td {
  padding: 14px 12px;
  border-bottom: 1px solid #d7d7d7;
  text-align: start;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.tag-table th {
  border-top: 1px solid #d7d7d7;
  background: #f7f7f7;
  font-weight: 600;
}

.tag-row-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-start;
}

.tag-row-actions .ui-button {
  min-width: 68px;
  margin: 0;
}

.main-content {
  margin-bottom: 4px;
}

.translations-wrap {
  margin-block-start: 6px;
  margin-inline-start: 12px;
  font-size: 0.9em;
  color: #666;
}

.translation-item {
  margin-bottom: 2px;
}

.tag-card-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tag-card {
  margin-bottom: 12px;
  padding: 16px;
  border: 1px solid #d7d7d7;
  border-radius: 4px;
  background: var(--ui-color-surface);
}

.tag-card__order {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid #e1e1e1;
}

.tag-card__order span {
  color: #555;
  font-size: 13px;
  font-weight: 600;
}

.tag-card__names {
  padding-block: 14px;
}

.tag-card__actions {
  display: flex;
  gap: 8px;
}

.tag-card__actions .ui-button {
  flex: 1 1 0;
  min-height: 44px;
  margin: 0;
}

.tag-list-empty {
  margin: 0 0 20px;
  padding: 24px 16px;
  border-block: 1px solid #d7d7d7;
  color: #555;
  text-align: center;
}

.tag-tool-section {
  margin-top: 24px;
  padding-inline: 16px;
}

.tag-tool-section--reset {
  margin-top: 32px;
}

.tag-tool-section__heading {
  margin-top: 0 !important;
  font-size: 16px;
}

.tag-tool-description {
  margin: 0 0 8px;
  color: #555;
}

.tag-tool-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-tool-actions .ui-button,
.tag-tool-section--reset .ui-button {
  margin: 0;
}

.tag-tool-toggle {
  width: 100%;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}

.tag-tool-toggle:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media screen and (max-width: 896px) {
  :global(.tag-list-dialog .ui-dialog__content) {
    padding: 0 16px 16px;
  }

  :global(.tag-list-dialog .ui-dialog__actions) {
    display: none;
  }

  .tag-list-summary {
    min-height: 48px;
  }

  .tag-tool-section {
    margin-top: 0;
    padding: 0;
  }

  .tag-tool-toggle.mobile-item {
    display: flex !important;
  }

  .tag-tool-body {
    display: none;
    padding: 0 4px 16px;
  }

  .tag-tool-body.is-expanded {
    display: block;
  }

  .tag-tool-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .tag-tool-actions .ui-button,
  .tag-tool-section--reset .ui-button {
    width: 100%;
    min-height: 44px;
    margin: 0;
  }
}
</style>
