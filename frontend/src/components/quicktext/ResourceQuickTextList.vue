<template>
  <div v-if="showActions && showCreateGroupAction" class="qt-action">
    <UiButton
      data-testid="quicktext-group-create"
      appearance="filled"
      tone="primary"
      :disabled="actionsDisabled"
      @click="$emit('create-group', $event)"
    >
      {{ $t('単語グループ作成') }}
    </UiButton>
  </div>

  <draggable
    tag="ul"
    class="group-list"
    :list="groups"
    handle=".group-handle"
    :disabled="sending || !managementEnabled"
    :animation="150"
    :group="{ name: `${resource}-qt-groups`, pull: false, put: false }"
    item-key="_id"
    @end="$emit('groups-drag-end', $event)"
  >
    <template #item="{ element: group }">
      <li class="group-item">
        <div class="group-grid">
          <div class="group-handle-cell">
            <UiButton
              class="group-handle handle-btn"
              appearance="text"
              density="dense"
              icon-only
              :aria-label="$t('ドラッグで単語グループの順を変更')"
              :title="$t('ドラッグで並び替え')"
              :disabled="!managementEnabled"
            >
              <UiIcon name="drag_indicator" />
            </UiButton>
          </div>

          <div class="group-top">
            <div class="group-top-left">
              <div class="field-row">
                <span class="field-label">{{ $t('単語グループ名') }}</span>
                <span class="field-value" dir="auto">{{ group.title }}</span>
              </div>
              <div class="group-meta">
                <span>{{ $t('表示順番') }}: {{ group.order }}</span>
                <span> / </span>
                <span>{{ $t('言語') }}: {{ computeLangLabel(group.lang) }}</span>
              </div>
              <div
                v-if="Array.isArray(group.translations) && group.translations.length"
                class="trans-meta"
                :class="{ 'translation-labels-emphasized': emphasizeTranslationLabels }"
              >
                <span class="trans-label">{{ $t('翻訳') }}:</span>
                <ul class="trans-list">
                  <li
                    v-for="translation in group.translations"
                    :key="`${group._id}-${translation.lang}`"
                    class="trans-chip"
                    :title="translation.content"
                  >
                    <span class="trans-lang">{{ computeLangLabel(translation.lang) }}</span>
                    <span class="trans-content" dir="auto">{{ translation.content }}</span>
                  </li>
                </ul>
              </div>

              <div v-if="showActions" class="group-top-actions">
                <UiButton
                  class="items-create-btn"
                  data-testid="quicktext-item-create"
                  appearance="filled"
                  tone="primary"
                  :disabled="actionsDisabled"
                  @click="$emit('create-item', group, $event)"
                >
                  {{ $t('単語作成') }}
                </UiButton>
                <UiButton
                  :id="`${resource}-quicktext-group-edit-${group._id}`"
                  data-testid="quicktext-group-edit"
                  appearance="filled"
                  tone="primary"
                  :disabled="actionsDisabled"
                  @click="$emit('edit-group', group, $event)"
                >
                  {{ $t('編集') }}
                </UiButton>
                <UiButton
                  data-testid="quicktext-group-delete"
                  appearance="filled"
                  tone="danger"
                  :disabled="actionsDisabled"
                  @click="$emit('delete-group', group, $event)"
                >
                  {{ $t('削除') }}
                </UiButton>
              </div>
            </div>
          </div>

          <div class="group-items">
            <div class="items-inline">
              <div v-if="getItems(group._id).length === 0" class="empty-state-caption">
                {{ $t('単語がありません') }}
              </div>

              <draggable
                v-else
                tag="ul"
                class="items-list"
                :list="itemsByGroupId[group._id]"
                :disabled="sending || !managementEnabled"
                :animation="150"
                :group="{ name: `${resource}-qt-${group._id}`, pull: false, put: false }"
                item-key="_id"
                handle=".item-handle"
                @end="$emit('items-drag-end', group._id, $event)"
              >
                <template #item="{ element: item }">
                  <li class="qt-item-li">
                    <div class="item-row">
                      <UiButton
                        class="item-handle handle-btn"
                        appearance="text"
                        density="dense"
                        icon-only
                        :aria-label="$t('ドラッグで単語の順を変更')"
                        :title="$t('ドラッグで並び替え')"
                        :disabled="!managementEnabled"
                      >
                        <UiIcon name="drag_indicator" />
                      </UiButton>

                      <div class="item-main">
                        <div class="item-title" dir="auto">{{ item.label }}</div>
                        <div class="item-meta">
                          <span>{{ $t('表示順番') }}: {{ item.order }}</span>
                          <span> / </span>
                          <span>{{ $t('言語') }}: {{ computeLangLabel(item.lang) }}</span>
                        </div>
                        <div
                          v-if="Array.isArray(item.translations) && item.translations.length"
                          class="trans-meta"
                          :class="{ 'translation-labels-emphasized': emphasizeTranslationLabels }"
                        >
                          <span class="trans-label">{{ $t('翻訳') }}:</span>
                          <ul class="trans-list">
                            <li
                              v-for="translation in item.translations"
                              :key="`${item._id}-${translation.lang}`"
                              class="trans-chip"
                              :title="translation.content"
                            >
                              <span class="trans-lang">{{ computeLangLabel(translation.lang) }}</span>
                              <span class="trans-content" dir="auto">{{ translation.content }}</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div v-if="showActions" class="item-actions-row">
                      <UiButton
                        :id="`${resource}-quicktext-item-edit-${item._id}`"
                        data-testid="quicktext-item-edit"
                        appearance="filled"
                        tone="primary"
                        :disabled="actionsDisabled"
                        @click="$emit('edit-item', item, group, $event)"
                      >
                        {{ $t('編集') }}
                      </UiButton>
                      <UiButton
                        data-testid="quicktext-item-delete"
                        appearance="filled"
                        tone="danger"
                        :disabled="actionsDisabled"
                        @click="$emit('delete-item', item, group, $event)"
                      >
                        {{ $t('削除') }}
                      </UiButton>
                    </div>
                  </li>
                </template>
              </draggable>
            </div>
          </div>
        </div>
      </li>
    </template>
  </draggable>
</template>

<script>
import draggable from 'vuedraggable';
import { LANGUAGES } from '@/constants/languages';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  name: 'ResourceQuickTextList',
  components: {
    draggable,
    UiButton,
    UiIcon,
  },
  props: {
    resource: {
      type: String,
      required: true,
      validator: (value) => value === 'floor' || value === 'room',
    },
    groups: {
      type: Array,
      default: () => [],
    },
    itemsByGroupId: {
      type: Object,
      default: () => Object.create(null),
    },
    sending: {
      type: Boolean,
      default: false,
    },
    userIsLogin: {
      type: Boolean,
      default: false,
    },
    canManage: {
      type: Boolean,
      default: null,
    },
    showActionsWhenLoggedOut: {
      type: Boolean,
      default: false,
    },
    showCreateGroupAction: {
      type: Boolean,
      default: true,
    },
    emphasizeTranslationLabels: {
      type: Boolean,
      default: false,
    },
  },
  emits: [
    'create-group',
    'create-item',
    'edit-group',
    'delete-group',
    'edit-item',
    'delete-item',
    'groups-drag-end',
    'items-drag-end',
  ],
  computed: {
    managementEnabled() {
      return this.canManage === null ? this.userIsLogin : this.canManage;
    },
    showActions() {
      return this.managementEnabled || (this.canManage === null && this.showActionsWhenLoggedOut);
    },
    actionsDisabled() {
      return this.sending || !this.managementEnabled;
    },
  },
  methods: {
    computeLangLabel(code) {
      const language = LANGUAGES.find((entry) => entry.value === code);
      return language ? this.$t(language.label) : code;
    },
    getItems(groupId) {
      const items = this.itemsByGroupId[groupId];
      return Array.isArray(items) ? items : [];
    },
  },
};
</script>

<style scoped>
.qt-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
}

.group-list {
  padding: 0;
  margin: 0;
  list-style: none;
}
.group-item {
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 12px;
  background: #fff;
}

.group-grid {
  display: grid;
  grid-template-columns: 40px 1fr;
  grid-template-rows: auto auto;
  gap: 8px 12px;
  padding: 12px;
}
.group-handle-cell {
  grid-row: 1 / span 2;
  grid-column: 1;
  display: flex;
  align-items: flex-start;
}
.handle-btn {
  cursor: grab;
}

.group-top {
  grid-column: 2;
  grid-row: 1;
  display: block;
}
.group-top-left {
  min-width: 0;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.field-label {
  font-weight: 600;
  font-size: 14px;
  color: #444;
}
.field-value {
  line-height: 18px;
  word-break: break-all;
}
.group-meta {
  color: #666;
  font-size: 12px;
}
.group-top-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  justify-content: flex-end;
}

.group-items {
  grid-column: 2;
  grid-row: 2;
  padding-top: 8px;
  border-top: 1px solid #ddd;
}

.items-inline {
  padding: 8px 0 12px;
}
.items-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.qt-item-li {
  border-bottom: 1px solid #eee;
  padding: 2px 0 8px;
}
.qt-item-li:first-child {
  border-top: 1px solid #eee;
}

.item-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0 4px;
}
.item-main {
  flex: 1 1 auto;
  min-width: 0;
}
.item-title {
  line-height: 18px;
}
.item-meta {
  color: #666;
  font-size: 12px;
}

.item-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 0 2px;
}

.trans-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #444;
}
.trans-label {
  margin-inline-end: 6px;
  font-weight: normal;
}
.trans-list {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
  vertical-align: middle;
}
.trans-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 8px;
  border: 1px solid #e6e6e6;
  border-radius: 12px;
  background: #fafafa;
}
.trans-lang {
  font-weight: normal;
}
.translation-labels-emphasized .trans-label,
.translation-labels-emphasized .trans-lang {
  font-weight: 600;
}
.trans-content {
  max-width: 32ch;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
