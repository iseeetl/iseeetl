<template>
  <div>
    <div class="view management-view" :aria-busy="sending ? 'true' : 'false'">
      <div class="view-header">
        <div class="management-page-header">
          <h1 ref="quickTextHeading" class="view-title" tabindex="-1">{{ $t('単語管理') }}</h1>
          <UiButton
            v-if="$store.getters.userRole === 'Administrator'"
            data-testid="quicktext-group-create"
            appearance="filled"
            tone="primary"
            :disabled="sending"
            @click="openGroupDialog(null, $event)"
          >
            {{ $t('単語グループ作成') }}
          </UiButton>
        </div>
      </div>

      <div class="view-content">
        <p v-if="groupsLoading" class="quicktext-state" role="status">
          {{ $t('読み込み中です') }}
        </p>
        <div v-if="groupsLoadError" class="quicktext-load-error">
          <p role="alert">{{ groupsLoadError }}</p>
          <UiButton
            data-testid="quicktext-groups-retry"
            appearance="filled"
            tone="primary"
            :disabled="sending"
            @click="fetchGroupsAll"
          >
            {{ $t('managementUi.retry') }}
          </UiButton>
        </div>
        <p v-if="groupsLoaded && !groupsLoading && !groupsLoadError && groups.length === 0" class="quicktext-state">
          {{ $t('managementUi.empty') }}
        </p>

        <draggable
          v-if="groups.length > 0"
          tag="ul"
          class="group-list"
          :list="groups"
          handle=".group-handle"
          :disabled="sending"
          :animation="150"
          :group="{ name: 'qt-groups', pull: false, put: false }"
          item-key="_id"
          @end="onGroupsDragEnd"
        >
          <template #item="{ element: g }">
          <li class="group-item">
            <div class="group-grid">
              <div class="group-handle-cell">
                <span
                  class="group-handle drag-handle"
                  aria-hidden="true"
                  :title="$t('ドラッグで並び替え')"
                >
                  <UiIcon name="drag_indicator" />
                </span>
              </div>

              <div class="group-top">
                <div class="group-top-left">
                  <div class="field-row">
                    <span class="field-label">{{ $t('単語グループ名') }}</span>
                    <span class="field-value" dir="auto">{{ g.title }}</span>
                  </div>
                  <div class="group-meta">
                    <span>{{ $t('表示順番') }}: {{ g.order }}</span>
                    <span> / </span>
                    <span>{{ $t('言語') }}: {{ computeLangLabel(g.lang) }}</span>
                  </div>
                  <div class="group-top-actions">
                    <div class="group-item-create-actions">
                      <UiButton
                        class="items-create-btn"
                        data-testid="quicktext-item-create"
                        appearance="filled"
                        tone="primary"
                        :disabled="sending || isItemsLoading(g._id)"
                        :aria-label="$t('managementUi.createQuickTextItemAria', { group: g.title })"
                        @click="openItemDialog(null, g, $event)"
                      >
                        {{ $t('単語作成') }}
                      </UiButton>
                    </div>
                    <div class="group-row-actions">
                      <UiButton
                        data-testid="quicktext-group-delete"
                        appearance="filled"
                        tone="danger"
                        :disabled="sending"
                        :aria-label="$t('managementUi.deleteQuickTextGroupAria', { group: g.title })"
                        @click="confirmDeleteGroup(g, $event)"
                      >
                        {{ $t('削除') }}
                      </UiButton>
                      <UiButton
                        data-testid="quicktext-group-edit"
                        appearance="filled"
                        tone="primary"
                        :disabled="sending"
                        :aria-label="$t('managementUi.editQuickTextGroupAria', { group: g.title })"
                        @click="openGroupDialog(g, $event)"
                      >
                        {{ $t('編集') }}
                      </UiButton>
                    </div>
                  </div>
                </div>
              </div>

              <div class="group-items">
                <div class="items-inline">
                  <p v-if="isItemsLoading(g._id)" class="item-load-state" role="status">
                    {{ $t('読み込み中です') }}
                  </p>
                  <div v-if="getItemsLoadError(g._id)" class="quicktext-load-error quicktext-load-error--item">
                    <p role="alert">{{ getItemsLoadError(g._id) }}</p>
                    <UiButton
                      data-testid="quicktext-items-retry"
                      appearance="filled"
                      tone="primary"
                      :disabled="sending || isItemsLoading(g._id)"
                      @click="fetchItemsForGroup(g._id)"
                    >
                      {{ $t('managementUi.retry') }}
                    </UiButton>
                  </div>
                  <div
                    v-if="
                      hasItemsResult(g._id) &&
                      !isItemsLoading(g._id) &&
                      !getItemsLoadError(g._id) &&
                      getItems(g._id).length === 0
                    "
                    class="empty-state-caption"
                  >
                    {{ $t('単語がありません') }}
                  </div>

                  <draggable
                    v-if="getItems(g._id).length > 0"
                    tag="ul"
                    class="items-list"
                    :list="itemsByGroupId[g._id]"
                    :disabled="sending || isItemsLoading(g._id)"
                    :animation="150"
                    :group="{ name: 'qt-' + g._id, pull: false, put: false }"
                    item-key="_id"
                    handle=".item-handle"
                    @end="onItemsDragEnd(g._id, $event)"
                  >
                    <template #item="{ element: it }">
                    <li class="qt-item-li">
                      <div class="item-row">
                        <span
                          class="item-handle drag-handle"
                          aria-hidden="true"
                          :title="$t('ドラッグで並び替え')"
                        >
                          <UiIcon name="drag_indicator" />
                        </span>

                        <div class="item-main">
                          <div class="item-title" dir="auto">{{ it.label }}</div>
                          <div class="item-meta">
                            <span>{{ $t('表示順番') }}: {{ it.order }}</span>
                            <span> / </span>
                            <span>{{ $t('言語') }}: {{ computeLangLabel(it.lang) }}</span>
                          </div>
                        </div>
                      </div>

                      <div class="item-actions-row">
                        <UiButton
                          data-testid="quicktext-item-delete"
                          appearance="filled"
                          tone="danger"
                          :disabled="sending || isItemsLoading(g._id)"
                          :aria-label="
                            $t('managementUi.deleteQuickTextItemAria', { group: g.title, item: it.label })
                          "
                          @click="confirmDeleteItem(it, g, $event)"
                        >
                          {{ $t('削除') }}
                        </UiButton>
                        <UiButton
                          data-testid="quicktext-item-edit"
                          appearance="filled"
                          tone="primary"
                          :disabled="sending || isItemsLoading(g._id)"
                          :aria-label="
                            $t('managementUi.editQuickTextItemAria', { group: g.title, item: it.label })
                          "
                          @click="openItemDialog(it, g, $event)"
                        >
                          {{ $t('編集') }}
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
      </div>
    </div>

    <EditQuickTextGroupDialog
      :dialogVisible="groupDialogVisible"
      :propsGroup="groupDialogValue"
      @success="onGroupSaved"
      @close="closeGroupDialog"
    />
    <EditQuickTextItemDialog
      :dialogVisible="itemDialogVisible"
      :group="itemDialogGroup"
      :propsItem="itemDialogValue"
      @success="onItemSaved"
      @close="closeItemDialog"
    />

    <ConfirmDialog
      :dialogVisible="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirmLabel="$t('削除')"
      :cancelLabel="$t('キャンセル')"
      :sending="confirmSending"
      :actions-adjacent="true"
      :close-on-confirm="false"
      :close-on-escape="true"
      :close-on-backdrop="true"
      confirm-icon="delete"
      @confirm="onConfirmDelete"
      @cancel="onCancelDelete"
      @closed="handleConfirmDialogClosed"
    >
      <div class="quicktext-delete-contexts">
        <DialogTargetContext
          v-if="confirmKind === 'item' && confirmGroup"
          context-id="quicktext-delete-group-context"
          :label="$t('単語グループ名')"
          :name="confirmGroup.title || ''"
        />
        <DialogTargetContext
          v-if="confirmTarget"
          context-id="quicktext-delete-target-context"
          :label="$t(confirmKind === 'group' ? '単語グループ名' : '名称')"
          :name="confirmKind === 'group' ? confirmTarget.title : confirmTarget.label"
        />
        <p>{{ confirmMessage }}</p>
      </div>
    </ConfirmDialog>
  </div>
</template>

<script>
import { LANGUAGES } from '@/constants/languages';
import { mapState } from 'vuex';
import draggable from 'vuedraggable';
import quickTextAPI from '@/api/quickText';
import { appendApiErrorMessage } from '@/api/apiClient';
import EditQuickTextGroupDialog from '@/components/quicktext/EditQuickTextGroupDialog.vue';
import EditQuickTextItemDialog from '@/components/quicktext/EditQuickTextItemDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';

export default {
  name: 'QuickTextManagement',
  components: {
    ConfirmDialog,
    DialogTargetContext,
    EditQuickTextGroupDialog,
    EditQuickTextItemDialog,
    UiButton,
    UiIcon,
    draggable,
  },
  data() {
    return {
      languages: LANGUAGES,

      groups: [],
      groupsLoading: false,
      groupsLoaded: false,
      groupsLoadError: '',
      sending: false,

      itemsByGroupId: Object.create(null),
      itemsLoadingByGroupId: Object.create(null),
      itemsLoadErrorsByGroupId: Object.create(null),
      itemsFetchRequestSeq: 0,
      activeItemsFetchRequestByGroupId: Object.create(null),

      groupDialogVisible: false,
      groupDialogValue: null,
      itemDialogVisible: false,
      itemDialogValue: null,
      itemDialogGroup: null,

      confirmVisible: false,
      confirmTitle: '',
      confirmMessage: '',
      confirmTarget: null,
      confirmKind: null, // groupは単語グループ、itemは単語を表す。
      confirmGroup: null, // 単語の削除後に一覧を更新できるよう、所属グループを保持する。
      confirmSending: false,

      lastFocusedElement: null,
      focusFallbackSelector: '',
      focusFallbackIndex: -1,
    };
  },
  computed: {
    ...mapState({
      userIsLogin: (state) => state.user.isLogin,
      userRole: (state) => state.user.role,
      userToken: (state) => state.user.token,
    }),
  },
  created() {
    if (this.userRole === 'Administrator') {
      this.fetchGroupsAll();
    }
  },
  methods: {
    computeLangLabel(langCode) {
      const found = this.languages.find((l) => l.value === langCode);
      if (found) return this.$t(found.label);
      return langCode;
    },

    async fetchGroupsAll({ duringDelete = false } = {}) {
      if (!this.userIsLogin || this.userRole !== 'Administrator') return;
      if (this.sending && !duringDelete) return;
      this.sending = true;
      this.groupsLoading = true;
      this.groupsLoadError = '';
      try {
        const { data } = await quickTextAPI.getGroupsAll(this.userToken, { resource: 'management' });
        // 全件APIの配列応答に加え、data.docsを持つ応答も受け入れる。
        this.groups = Array.isArray(data?.docs) ? data.docs : Array.isArray(data) ? data : [];
        this.groupsLoaded = true;
        this.itemsByGroupId = Object.create(null);
        this.itemsLoadingByGroupId = Object.create(null);
        this.itemsLoadErrorsByGroupId = Object.create(null);
        this.activeItemsFetchRequestByGroupId = Object.create(null);
        await this.fetchItemsForAllGroups();
      } catch (e) {
        const message = appendApiErrorMessage(this.$t('単語グループの取得に失敗しました'), e, {
          translate: this.$t,
          wrapper: 'paren',
        });
        this.groupsLoadError = message;
        this.setSnackbar(message, 'alert');
        return handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
      } finally {
        this.groupsLoading = false;
        if (!duringDelete) this.sending = false;
      }
    },

    getItems(groupId) {
      const list = this.itemsByGroupId[groupId];
      return Array.isArray(list) ? list : [];
    },
    hasItemsResult(groupId) {
      return Object.prototype.hasOwnProperty.call(this.itemsByGroupId, groupId);
    },
    isItemsLoading(groupId) {
      return this.itemsLoadingByGroupId[groupId] === true;
    },
    getItemsLoadError(groupId) {
      return this.itemsLoadErrorsByGroupId[groupId] || '';
    },
    async fetchItemsForAllGroups() {
      await Promise.all(this.groups.map((g) => this.fetchItemsForGroup(g._id)));
    },
    async fetchItemsForGroup(groupId, { force = false } = {}) {
      if (!groupId || (this.isItemsLoading(groupId) && !force)) return;
      const requestId = ++this.itemsFetchRequestSeq;
      this.activeItemsFetchRequestByGroupId[groupId] = requestId;
      this.itemsLoadingByGroupId[groupId] = true;
      this.itemsLoadErrorsByGroupId[groupId] = '';
      try {
        const { data } = await quickTextAPI.getItems(this.userToken, { resource: 'management', groupId });
        if (requestId !== this.activeItemsFetchRequestByGroupId[groupId]) return;
        const items = Array.isArray(data?.docs) ? data.docs : Array.isArray(data) ? data : [];
        this.itemsByGroupId[groupId] = items;
      } catch (e) {
        if (requestId !== this.activeItemsFetchRequestByGroupId[groupId]) return;
        const message = appendApiErrorMessage(this.$t('単語の取得に失敗しました'), e, {
          translate: this.$t,
          wrapper: 'paren',
        });
        this.itemsLoadErrorsByGroupId[groupId] = message;
        this.setSnackbar(message, 'alert');
        return handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
      } finally {
        if (requestId === this.activeItemsFetchRequestByGroupId[groupId]) {
          this.itemsLoadingByGroupId[groupId] = false;
        }
      }
    },

    async onGroupsDragEnd(e) {
      if (this.sending) return;
      if (e && e.newIndex === e.oldIndex) return;
      const previousGroups = this.groups.map((group) => ({ ...group }));
      if (e && e.newIndex >= 0 && e.oldIndex >= 0) {
        const [movedGroup] = previousGroups.splice(e.newIndex, 1);
        if (movedGroup) previousGroups.splice(e.oldIndex, 0, movedGroup);
      }
      await this.persistGroupOrder(previousGroups);
    },
    async persistGroupOrder(previousGroups) {
      if (this.sending) return;
      this.groups = this.groups.map((g, i) => ({ ...g, order: i + 1 }));
      this.sending = true;
      let refetchAfterAuthError = false;
      try {
        await Promise.all(
          this.groups.map((g) =>
            quickTextAPI.updateGroup(this.userToken, { resource: 'management', id: g._id, order: g.order })
          )
        );
        this.setSnackbar(this.$t('単語グループの表示順番を更新しました'), 'status');
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('単語グループの表示順番の更新に失敗しました'), err, {
          translate: this.$t,
          wrapper: 'paren',
        });
        this.setSnackbar(message, 'alert');
        refetchAfterAuthError = handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
        if (!refetchAfterAuthError) this.groups = previousGroups.map((group) => ({ ...group }));
      } finally {
        this.sending = false;
      }
      if (refetchAfterAuthError) await this.fetchGroupsAll();
    },

    async onItemsDragEnd(groupId, e = null) {
      if (this.sending || this.isItemsLoading(groupId)) return;
      const list = this.itemsByGroupId[groupId] || [];
      if (!list.length) return;
      const previousItems = list.map((item) => ({ ...item }));
      const newIndex = typeof e?.newIndex === 'number' ? e.newIndex : -1;
      const oldIndex = typeof e?.oldIndex === 'number' ? e.oldIndex : -1;
      if (newIndex >= 0 && oldIndex >= 0) {
        const [movedItem] = previousItems.splice(newIndex, 1);
        if (movedItem) previousItems.splice(oldIndex, 0, movedItem);
      }
      await this.persistItemOrder(groupId, previousItems);
    },
    async persistItemOrder(groupId, previousItems) {
      if (this.sending || this.isItemsLoading(groupId)) return;
      const list = this.getItems(groupId);
      this.itemsByGroupId[groupId] = list.map((item, index) => ({ ...item, order: index + 1 }));
      this.sending = true;
      let refetchAfterAuthError = false;
      try {
        await Promise.all(
          this.itemsByGroupId[groupId].map((it) =>
            quickTextAPI.updateItem(this.userToken, { resource: 'management', id: it._id, order: it.order })
          )
        );
        this.setSnackbar(this.$t('単語の表示順番を更新しました'), 'status');
      } catch (e) {
        const message = appendApiErrorMessage(this.$t('単語の表示順番の更新に失敗しました'), e, {
          translate: this.$t,
          wrapper: 'paren',
        });
        this.setSnackbar(message, 'alert');
        refetchAfterAuthError = handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
        if (!refetchAfterAuthError) {
          this.itemsByGroupId[groupId] = previousItems.map((item) => ({ ...item }));
        }
      } finally {
        this.sending = false;
      }
      if (refetchAfterAuthError) await this.fetchItemsForGroup(groupId, { force: true });
    },

    openGroupDialog(group = null, event) {
      if (this.sending) return;
      this.rememberFocus(event);
      this.groupDialogVisible = true;
      this.groupDialogValue = group;
    },
    closeGroupDialog() {
      this.groupDialogVisible = false;
      this.groupDialogValue = null;
      this.restoreFocus();
    },
    async onGroupSaved() {
      await this.fetchGroupsAll();
      this.groupDialogVisible = false;
    },

    confirmDeleteGroup(group, event) {
      if (this.sending) return;
      this.rememberFocus(event, '[data-testid="quicktext-group-delete"]');
      this.confirmKind = 'group';
      this.confirmTarget = group;
      this.confirmGroup = null;
      this.confirmTitle = this.$t('単語グループを削除');
      this.confirmMessage = this.$t('この単語グループを削除しますか？配下単語も削除されます。');
      this.confirmVisible = true;
    },

    openItemDialog(item = null, group, event) {
      if (this.sending || !group || this.isItemsLoading(group._id)) return;
      this.rememberFocus(event);
      this.itemDialogVisible = true;
      this.itemDialogValue = item;
      this.itemDialogGroup = group;
    },
    closeItemDialog() {
      this.itemDialogVisible = false;
      this.itemDialogValue = null;
      this.itemDialogGroup = null;
      this.restoreFocus();
    },
    async onItemSaved() {
      if (this.itemDialogGroup && this.itemDialogGroup._id) {
        await this.fetchItemsForGroup(this.itemDialogGroup._id, { force: true });
      }
      this.itemDialogVisible = false;
    },

    confirmDeleteItem(item, group, event) {
      if (this.sending || !group || this.isItemsLoading(group._id)) return;
      this.rememberFocus(event, '[data-testid="quicktext-item-delete"]');
      this.confirmKind = 'item';
      this.confirmTarget = item;
      this.confirmGroup = group;
      this.confirmTitle = this.$t('単語を削除');
      this.confirmMessage = this.$t('この単語を削除しますか？');
      this.confirmVisible = true;
    },

    async onConfirmDelete() {
      if (!this.confirmTarget || this.confirmSending || this.sending) return;
      this.confirmSending = true;
      let deleted = false;
      try {
        if (this.confirmKind === 'group') {
          deleted = await this.deleteGroup(this.confirmTarget);
        } else if (this.confirmKind === 'item') {
          deleted = await this.deleteItem(this.confirmTarget, this.confirmGroup);
        }
      } finally {
        this.confirmSending = false;
      }
      if (deleted) this.closeConfirmDialog();
    },
    onCancelDelete() {
      if (this.confirmSending) return;
      this.closeConfirmDialog();
    },
    closeConfirmDialog() {
      this.confirmVisible = false;
    },
    handleConfirmDialogClosed() {
      this.clearConfirmDialog();
    },
    clearConfirmDialog() {
      this.confirmVisible = false;
      this.confirmKind = null;
      this.confirmTarget = null;
      this.confirmGroup = null;
      this.confirmTitle = '';
      this.confirmMessage = '';
      this.restoreFocus();
    },

    async deleteGroup(group) {
      if (this.sending) return false;
      this.sending = true;
      try {
        await quickTextAPI.deleteGroup(this.userToken, { resource: 'management', id: group._id });
        const idx = this.groups.findIndex((x) => x._id === group._id);
        if (idx >= 0) this.groups.splice(idx, 1);
        delete this.activeItemsFetchRequestByGroupId[group._id];
        delete this.itemsByGroupId[group._id];
        delete this.itemsLoadingByGroupId[group._id];
        delete this.itemsLoadErrorsByGroupId[group._id];
        this.setSnackbar(this.$t('単語グループを削除しました'), 'status');
        return true;
      } catch (e) {
        const message = appendApiErrorMessage(this.$t('単語グループの削除に失敗しました'), e, {
          translate: this.$t,
          wrapper: 'paren',
        });
        this.setSnackbar(message, 'alert');
        if (!handleAuthErrorUtil(e, { store: this.$store, router: this.$router })) {
          await this.fetchGroupsAll({ duringDelete: true });
          // 応答だけ失われて削除済みなら、存在しない対象への再試行を閉じる。
          if (!this.groupsLoadError && !this.groups.some((entry) => entry._id === group._id)) return true;
        }
        return false;
      } finally {
        this.sending = false;
      }
    },

    async deleteItem(item, group) {
      if (this.sending || !group || this.isItemsLoading(group._id)) return false;
      this.sending = true;
      try {
        await quickTextAPI.deleteItem(this.userToken, { resource: 'management', id: item._id });
        this.setSnackbar(this.$t('単語を削除しました'), 'status');
        await this.fetchItemsForGroup(group._id, { force: true });
        return true;
      } catch (e) {
        const message = appendApiErrorMessage(this.$t('単語の削除に失敗しました'), e, {
          translate: this.$t,
          wrapper: 'paren',
        });
        this.setSnackbar(message, 'alert');
        handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
        return false;
      } finally {
        this.sending = false;
      }
    },

    setSnackbar(message, role = 'status') {
      this.$store.dispatch('doShowSnackbar', { message, role });
    },
    rememberFocus(event, fallbackSelector = '') {
      const element = event && event.currentTarget ? event.currentTarget : null;
      this.lastFocusedElement = element;
      this.focusFallbackSelector = fallbackSelector;
      this.focusFallbackIndex = -1;
      if (!element || !fallbackSelector || typeof document === 'undefined') return;
      this.focusFallbackIndex = Array.from(document.querySelectorAll(fallbackSelector)).indexOf(element);
    },
    restoreFocus() {
      const previousElement = this.lastFocusedElement;
      const fallbackSelector = this.focusFallbackSelector;
      const fallbackIndex = this.focusFallbackIndex;
      this.lastFocusedElement = null;
      this.focusFallbackSelector = '';
      this.focusFallbackIndex = -1;
      this.$nextTick(() => {
        const previousElementIsConnected =
          previousElement &&
          typeof previousElement.focus === 'function' &&
          (typeof document === 'undefined' || document.contains(previousElement));
        if (previousElementIsConnected) {
          previousElement.focus();
          return;
        }

        let fallbackElement = null;
        if (fallbackSelector && typeof document !== 'undefined') {
          const candidates = Array.from(document.querySelectorAll(fallbackSelector)).filter(
            (element) => !element.disabled && element.getAttribute('aria-disabled') !== 'true'
          );
          if (candidates.length > 0) {
            const nextIndex = Math.min(Math.max(fallbackIndex, 0), candidates.length - 1);
            fallbackElement = candidates[nextIndex];
          }
        }
        if (!fallbackElement) fallbackElement = this.$refs.quickTextHeading;
        if (fallbackElement && typeof fallbackElement.focus === 'function') fallbackElement.focus();
      });
    },
  },
};
</script>

<style scoped>
.quicktext-delete-contexts {
  display: grid;
  gap: 8px;
}

.quicktext-delete-contexts p {
  margin: 4px 0 0;
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

/* 1列目に並べ替えハンドル、2列目の上下段にグループ情報と単語一覧を配置する。 */
.group-grid {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 8px;
  padding: 12px;
}
.group-handle-cell {
  grid-row: 1 / span 2;
  grid-column: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 32px;
  block-size: 32px;
  cursor: grab;
  user-select: none;
}

.quicktext-state,
.item-load-state {
  margin: 12px 0;
  color: #555;
}
.quicktext-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  margin: 8px 0 16px;
  border: 1px solid #b3261e;
  border-radius: 4px;
}
.quicktext-load-error p {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.quicktext-load-error--item {
  margin-bottom: 8px;
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
  min-width: 0;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.group-meta {
  color: #666;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.group-top-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.group-item-create-actions,
.group-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.group-row-actions {
  flex-wrap: nowrap;
  margin-inline-start: auto;
}

.group-items {
  grid-column: 2;
  grid-row: 2;
  min-width: 0;
  padding-top: 8px;
  border-top: 1px solid #ddd;
}

.items-inline {
  min-width: 0;
  padding: 8px 0 12px;
}
.items-inline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.items-heading {
  font-weight: 600;
}
.items-create-btn {
  margin-inline-start: 0;
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
  overflow-wrap: anywhere;
}
.item-meta {
  color: #666;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.item-actions-row {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 0 2px;
}

.group-item-create-actions :deep(.ui-button),
.group-row-actions :deep(.ui-button),
.item-actions-row :deep(.ui-button) {
  margin: 0;
}

@media screen and (max-width: 896px) {
  .group-grid {
    grid-template-columns: 32px minmax(0, 1fr);
    padding: 8px;
  }

  .quicktext-load-error {
    align-items: stretch;
    flex-direction: column;
  }

  .quicktext-load-error :deep(.ui-button) {
    align-self: flex-end;
    margin-inline: 0;
  }

  .field-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
</style>
