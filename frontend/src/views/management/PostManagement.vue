<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('投稿管理')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('投稿') })"
    :fetcher="fetchPost"
    :errorMessage="$t('managementUi.loadResourceFailed', { resource: $t('投稿') })"
    :searchEnabled="true"
    :payloadBuilder="buildSearchPayload"
  >
    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table
          v-bind="tableAttrs"
          class="management-table management-table--wide post-management"
        >
          <colgroup>
            <col class="post-management__context-column" />
            <col class="post-management__content-column" />
            <col class="post-management__status-column" />
            <col class="post-management__date-column" />
            <col class="post-management__action-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{{ $t('フロア') }} / {{ $t('ルーム') }} / {{ $t('ユーザ') }}</th>
              <th scope="col">{{ $t('タイプ') }} / {{ $t('コメント') }}</th>
              <th scope="col">{{ $t('managementUi.status') }}</th>
              <th scope="col">{{ $t('日時') }}</th>
              <th scope="col">{{ $t('managementUi.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in flattenPosts(items)"
              :key="row.key"
              :class="[
                `post-management__row--depth-${row.depth}`,
                { 'soft-delete': row.item.delete_flg },
              ]"
            >
              <td :data-label="$t('フロア') + ' / ' + $t('ルーム') + ' / ' + $t('ユーザ')">
                {{ $t('フロア') }}:
                <span dir="auto">{{ row.post.floor?.title || $t('managementUi.referenceUnavailable') }}</span><br />
                {{ $t('ルーム') }}:
                <span dir="auto">{{ row.post.room?.title || $t('managementUi.referenceUnavailable') }}</span><br />
                {{ $t('ユーザ') }}:
                <span dir="auto">{{ row.userName }}</span>
              </td>

              <td :data-label="$t('タイプ') + ' / ' + $t('コメント')">
                <div class="post-management__content" :class="`post-management__content--depth-${row.depth}`">
                  <strong>{{ row.typeLabel }}</strong><br />
                  <span dir="auto">{{ row.item.content || '—' }}</span>
                </div>
              </td>

              <td :data-label="$t('managementUi.status')">
                <div class="management-status-list">
                  <ManagementStatusBadge
                    :label="$t(row.item.delete_flg ? 'managementUi.statusDeleted' : 'managementUi.statusActive')"
                    :tone="row.item.delete_flg ? 'danger' : 'success'"
                  />
                  <ManagementStatusBadge
                    v-if="row.parentUnavailable"
                    :label="$t('managementUi.statusUnavailable')"
                    tone="warning"
                  />
                </div>
              </td>

              <td :data-label="$t('日時')">
                <span>{{ $t('作成') }}: {{ formatManagementDate(row.item.created_at) || '—' }}</span><br />
                <span>{{ $t('更新') }}: {{ formatManagementDate(row.item.updated_at) || '—' }}</span><br />
                <span>{{ $t('削除') }}: {{ formatManagementDate(row.item.deleted_at) || '—' }}</span>
              </td>

              <td :data-label="$t('managementUi.actions')">
                <div class="management-actions">
                  <div class="management-row-actions-group">
                    <UiButton
                      class="management-row-action-button"
                      :data-management-lifecycle-id="row.item._id"
                      appearance="filled"
                      :tone="row.item.delete_flg ? 'primary' : 'danger'"
                      :aria-label="lifecycleActionLabel(row)"
                      :aria-describedby="lifecycleActionUnavailable(row) ? unavailableReasonId(row) : undefined"
                      :disabled="lifecycleActionUnavailable(row)"
                      @click="showDeleteDialog(row)"
                    >
                      {{ $t(row.item.delete_flg ? 'managementUi.restore' : 'managementUi.delete') }}
                    </UiButton>
                  </div>
                  <span
                    v-if="lifecycleActionUnavailable(row)"
                    :id="unavailableReasonId(row)"
                    class="management-action-reason"
                  >
                    {{ $t('managementUi.postParentUnavailable') }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <ManagementLifecycleDialog
        v-if="selectedItem"
        :open="dialogVisible"
        :sending="sending"
        :action="lifecycleAction"
        :resource-label="selectedTypeLabel"
        :resource-name="selectedResourceName"
        :warning="lifecycleWarning"
        @confirm="deleteValue"
        @cancel="clearDeleteValue"
        @request-close="clearDeleteValue"
        @closed="handleLifecycleDialogClosed"
      >
        <dl class="management-detail-list">
          <div>
            <dt>{{ $t('managementUi.targetType') }}</dt>
            <dd>{{ selectedTypeLabel }}</dd>
          </div>
          <div>
            <dt>{{ $t('managementUi.targetContent') }}</dt>
            <dd dir="auto">{{ selectedItem.content || '—' }}</dd>
          </div>
          <div>
            <dt>{{ $t('managementUi.targetContext') }}</dt>
            <dd dir="auto">{{ selectedContext }}</dd>
          </div>
          <div>
            <dt>{{ $t('managementUi.targetUser') }}</dt>
            <dd dir="auto">{{ selectedUserName }}</dd>
          </div>
          <div>
            <dt>{{ $t('managementUi.currentStatus') }}</dt>
            <dd>
              <ManagementStatusBadge
                :label="$t(selectedItem.delete_flg ? 'managementUi.statusDeleted' : 'managementUi.statusActive')"
                :tone="selectedItem.delete_flg ? 'danger' : 'success'"
              />
            </dd>
          </div>
        </dl>
      </ManagementLifecycleDialog>
    </template>
  </ManagementListBase>
</template>

<script>
import chatApi from '@/api/chat';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import ManagementStatusBadge from '@/components/management/ManagementStatusBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

const MEDIA_FIELDS = ['image_name', 'video_name', 'audio_name'];

export default {
  name: 'PostManagement',
  components: {
    ManagementLifecycleDialog,
    ManagementListBase,
    ManagementStatusBadge,
    UiButton,
  },
  data() {
    return {
      dialogVisible: false,
      post: null,
      reply: null,
      supplement: null,
      isDelete: false,
      sending: false,
      lifecycleFocusRequest: null,
      lifecycleFocusAfterMutation: false,
    };
  },
  computed: {
    selectedItem() {
      return this.supplement || this.reply || this.post;
    },
    selectedTypeLabel() {
      if (this.supplement) return this.$t('付加情報');
      if (this.reply) return this.$t('返信');
      return this.$t('投稿');
    },
    selectedResourceName() {
      if (!this.selectedItem) return '';
      return this.selectedItem.content || String(this.selectedItem._id || this.selectedTypeLabel);
    },
    selectedContext() {
      if (!this.post) return '—';
      const referenceUnavailable = this.$t('managementUi.referenceUnavailable');
      return `${this.post.floor?.title || referenceUnavailable} / ${this.post.room?.title || referenceUnavailable}`;
    },
    selectedUserName() {
      return this.resolveUserName(this.selectedItem);
    },
    lifecycleAction() {
      return this.isDelete ? 'delete' : 'restore';
    },
    lifecycleWarning() {
      if (!this.isDelete || !this.hasAttachedMedia(this.selectedItem)) return '';
      return this.$t('managementUi.postMediaWarning');
    },
  },
  methods: {
    ...userDisplayMethods,
    ...createManagementDateFormatterMethods(),
    fetchPost(payload) {
      return chatApi.managementPaginate(payload);
    },
    buildSearchPayload({ page, search }) {
      const normalizedSearch = typeof search === 'undefined' ? null : search;
      return { page, search: normalizedSearch };
    },
    resolveUserName(item) {
      if (!item) return '—';
      return this.resolveActorDisplayName(item) || '—';
    },
    flattenPosts(posts) {
      const rows = [];
      (posts || []).forEach((post) => {
        rows.push({
          key: `post-${post._id}`,
          depth: 0,
          typeLabel: this.$t('投稿'),
          item: post,
          post,
          reply: null,
          supplement: null,
          parentUnavailable: false,
          userName: this.resolveUserName(post),
        });

        (post.replies || []).forEach((reply) => {
          rows.push({
            key: `reply-${reply._id}`,
            depth: 1,
            typeLabel: this.$t('返信'),
            item: reply,
            post,
            reply,
            supplement: null,
            parentUnavailable: Boolean(post.delete_flg),
            userName: this.resolveUserName(reply),
          });

          (reply.supplementaries || []).forEach((supplement) => {
            rows.push({
              key: `reply-supplement-${supplement._id}`,
              depth: 2,
              typeLabel: this.$t('付加情報'),
              item: supplement,
              post,
              reply,
              supplement,
              parentUnavailable: Boolean(post.delete_flg || reply.delete_flg),
              userName: this.resolveUserName(supplement),
            });
          });
        });

        (post.supplementaries || []).forEach((supplement) => {
          rows.push({
            key: `post-supplement-${supplement._id}`,
            depth: 1,
            typeLabel: this.$t('付加情報'),
            item: supplement,
            post,
            reply: null,
            supplement,
            parentUnavailable: Boolean(post.delete_flg),
            userName: this.resolveUserName(supplement),
          });
        });
      });
      return rows;
    },
    lifecycleActionUnavailable(row) {
      return Boolean(row.parentUnavailable && row.item.delete_flg);
    },
    unavailableReasonId(row) {
      return `post-management-unavailable-${row.item._id}`;
    },
    lifecycleActionLabel(row) {
      const action = this.$t(row.item.delete_flg ? 'managementUi.restore' : 'managementUi.delete');
      return `${action}: ${row.typeLabel}「${row.item.content || row.item._id}」`;
    },
    hasAttachedMedia(item) {
      return Boolean(item && MEDIA_FIELDS.some((field) => item[field]));
    },
    showDeleteDialog(value) {
      if (this.sending || !value || this.lifecycleActionUnavailable(value)) return;
      const target = value.supplement || value.reply || value.post;
      if (!target) return;
      const orderedIds = this.flattenPosts(this.$refs.listBase?.items || []).map((row) => row.item?._id);
      this.lifecycleFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(target._id, orderedIds) || {
          candidateIds: [],
        };
      this.lifecycleFocusAfterMutation = false;
      this.post = value.post;
      this.reply = value.reply || null;
      this.supplement = value.supplement || null;
      this.isDelete = !Boolean(target.delete_flg);
      this.dialogVisible = true;
    },
    async deleteValue(action = this.lifecycleAction) {
      if (this.sending || !this.selectedItem) return;
      this.isDelete = action === 'delete';
      this.sending = true;

      const data = { delete_flg: this.isDelete };
      if (this.post) data.post_id = this.post._id;
      if (this.reply) data.reply_id = this.reply._id;
      if (this.supplement) data.supplement_id = this.supplement._id;
      try {
        await chatApi.manageDelete(data);
      } catch (error) {
        this.$refs.listBase.showError(
          this.$t(this.isDelete ? '削除に失敗しました' : '復元に失敗しました'),
          error,
        );
        this.sending = false;
        return;
      }

      try {
        await this.$refs.listBase.reload();
      } catch {
        // 一覧取得エラーの表示と再試行は、ManagementListBaseに任せる。
      }
      this.sending = false;
      this.lifecycleFocusAfterMutation = true;
      this.clearDeleteValue();
    },
    clearDeleteValue() {
      if (this.sending) return;
      this.dialogVisible = false;
    },
    handleLifecycleDialogClosed() {
      const focusRequest = this.lifecycleFocusAfterMutation ? this.lifecycleFocusRequest : null;
      this.post = null;
      this.reply = null;
      this.supplement = null;
      this.isDelete = false;
      this.lifecycleFocusRequest = null;
      this.lifecycleFocusAfterMutation = false;
      if (focusRequest) this.$refs.listBase?.restoreLifecycleFocus?.(focusRequest);
    },
  },
};
</script>

<style scoped>
.post-management__content {
  border-inline-start: 3px solid transparent;
  padding-inline-start: 0.5rem;
}

.post-management__content--depth-1 {
  border-inline-start-color: var(--ui-color-primary);
  margin-inline-start: 1rem;
}

.post-management__content--depth-2 {
  border-inline-start-color: #d5b75a;
  margin-inline-start: 2rem;
}
</style>
