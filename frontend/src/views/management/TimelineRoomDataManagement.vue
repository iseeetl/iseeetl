<template>
  <ManagementListBase
    ref="listBase"
    :title="pageTitle"
    :table-label="$t('ルーム一覧')"
    :fetcher="fetchRooms"
    :payloadBuilder="buildRoomPayload"
    :errorMessage="$t('managementUi.loadResourceFailed', { resource: $t('ルーム') })"
    :searchEnabled="true"
    :searchLabel="$t('検索')"
    :searchMinLength="2"
    :searchMaxLength="100"
    :searchMinErrorText="$t('2文字以上です')"
    :searchMaxErrorText="$t('100文字以内です')"
  >
    <template #actions>
      <div class="management-actions">
        <UiButton
          data-testid="timeline-room-back"
          appearance="filled"
          tone="neutral"
          @click="goBack"
        >
          {{ $t('タイムラインデータ管理へ戻る') }}
        </UiButton>
      </div>
    </template>

    <template #table="{ items, fetching, tableAttrs }">
      <div class="management-table-scroll">
        <table
          v-bind="tableAttrs"
          class="management-table management-table--wide timeline-room-table"
          data-testid="timeline-room-list"
        >
          <thead>
            <tr>
              <th scope="col">{{ $t('ルーム') }}</th>
              <th scope="col">{{ $t('managementUi.status') }}</th>
              <th scope="col">{{ $t('ユーザ名') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('更新日') }}</th>
              <th scope="col">{{ $t('削除日') }}</th>
              <th scope="col">{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="room in items" :key="room._id" :class="{ 'soft-delete': room.delete_flg }">
              <td :data-label="$t('ルーム')" dir="auto">{{ room.title }}</td>
              <td :data-label="$t('managementUi.status')">
                <div class="management-status-list">
                  <ManagementStatusBadge
                    :tone="room.delete_flg ? 'danger' : 'success'"
                    :label="$t(room.delete_flg ? 'managementUi.statusDeleted' : 'managementUi.statusActive')"
                  />
                  <ManagementStatusBadge
                    :tone="room.room_display_hidden ? 'warning' : 'info'"
                    :label="$t(room.room_display_hidden ? 'managementUi.statusHidden' : 'managementUi.statusVisible')"
                  />
                  <ManagementStatusBadge
                    :tone="room.member_only ? 'warning' : 'info'"
                    :label="$t(room.member_only ? 'managementUi.statusMembersOnly' : 'managementUi.statusPublic')"
                  />
                </div>
              </td>
              <td :data-label="$t('ユーザ名')" dir="auto">
                {{ resolveUserDisplayName(room.user) || $t('managementUi.referenceUnavailable') }}
              </td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(room.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('更新日')">
                <span v-text="formatManagementDate(room.updated_at) || '—'"></span>
              </td>
              <td :data-label="$t('削除日')">
                <span v-text="formatManagementDate(room.deleted_at) || '—'"></span>
              </td>
              <td :data-label="$t('操作')">
                <div class="management-row-actions-group">
                  <div class="management-row-actions">
                    <UiButton
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      :disabled="isDownloadDisabled(room, fetching)"
                      :data-testid="'timeline-json-' + room._id"
                      :aria-label="$t('managementUi.downloadJsonAria', { name: room.title })"
                      @click="prepareDownload(room, 'json')"
                    >
                      JSON
                    </UiButton>
                    <UiButton
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      :disabled="isDownloadDisabled(room, fetching)"
                      :data-testid="'timeline-media-' + room._id"
                      :aria-label="$t('managementUi.downloadMediaAria', { name: room.title })"
                      @click="prepareDownload(room, 'media')"
                    >
                      {{ $t('メディアZIP') }}
                    </UiButton>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </ManagementListBase>
  <p v-if="estimatingKey" role="status">{{ $t('exportDownload.estimating') }}</p>
  <ConfirmDialog
    :dialog-visible="downloadConfirmation !== null"
    :title="$t('exportDownload.title')"
    :confirm-label="$t('exportDownload.confirm')"
    :cancel-label="$t('キャンセル')"
    confirm-tone="primary"
    :close-on-escape="true"
    :close-on-confirm="false"
    @confirm="confirmDownload"
    @cancel="cancelDownload"
    @close="cancelDownload"
  >
    <template v-if="downloadConfirmation">
      <p>{{ downloadConfirmation.room.title }}</p>
      <p>{{ $t('exportDownload.size', { size: formatExportSize(downloadConfirmation.estimatedBytes) }) }}</p>
      <p>{{ $t('exportDownload.approximate') }}</p>
      <p v-if="downloadConfirmation.estimatedBytes >= largeExportBytes" role="alert">
        {{ $t('exportDownload.warning') }}
      </p>
    </template>
  </ConfirmDialog>
</template>

<script>
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import chatApi from '@/api/chat';
import floorApi from '@/api/floor';
import roomApi from '@/api/room';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import ManagementStatusBadge from '@/components/management/ManagementStatusBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'TimelineRoomDataManagement',
  components: {
    ConfirmDialog,
    ManagementListBase,
    ManagementStatusBadge,
    UiButton,
  },
  props: {
    floorId: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      floor: null,
      downloadingKey: null,
      estimatingKey: null,
      downloadConfirmation: null,
      estimateGeneration: 0,
      largeExportBytes: 100 * 1024 * 1024,
    };
  },
  computed: {
    pageTitle() {
      return this.floor
        ? `${this.$t('タイムラインデータ管理')} - ${this.floor.title}`
        : `${this.$t('タイムラインデータ管理')} - ${this.$t('ルーム一覧')}`;
    },
  },
  watch: {
    floorId() { this.cancelDownload(); },
  },
  beforeUnmount() { this.cancelDownload(); },
  mounted() {
    this.fetchFloor();
  },
  methods: {
    formatExportSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
    },
    async prepareDownload(room, type) {
      if (this.isDownloadDisabled(room)) return;
      const generation = ++this.estimateGeneration;
      this.estimatingKey = `${type}:${room._id}`;
      try {
        const { data } = await chatApi.managementTimelineEstimate({ floor_id: this.floorId, room_id: room._id, type });
        if (generation !== this.estimateGeneration) return;
        if (!Number.isSafeInteger(data.estimatedBytes) || data.estimatedBytes < 0) throw new Error('INVALID_ESTIMATE');
        this.downloadConfirmation = { room: { ...room }, type, estimatedBytes: data.estimatedBytes };
      } catch (error) {
        if (generation === this.estimateGeneration) this.showError(this.$t('exportDownload.estimateFailed'), error);
      } finally {
        if (generation === this.estimateGeneration) this.estimatingKey = null;
      }
    },
    cancelDownload() {
      this.estimateGeneration += 1;
      this.estimatingKey = null;
      this.downloadConfirmation = null;
    },
    confirmDownload() {
      const selection = this.downloadConfirmation;
      if (!selection) return;
      this.downloadConfirmation = null;
      return selection.type === 'json' ? this.downloadTimeline(selection.room) : this.downloadMedia(selection.room);
    },
    ...userDisplayMethods,
    ...createManagementDateFormatterMethods(),
    fetchRooms(payload) {
      return roomApi.managementPaginate(payload);
    },
    buildRoomPayload({ page, search }) {
      return {
        page,
        search,
        floor_id: this.floorId,
      };
    },
    fetchFloor() {
      return floorApi
        .managementDetail({ _id: this.floorId })
        .then((res) => {
          this.floor = res.data;
        })
        .catch((error) => {
          this.floor = null;
          this.showError(this.$t('フロアの取得に失敗しました'), error);
        });
    },
    goBack() {
      this.$router.push({ name: 'TimelineDataManagement' });
    },
    isDownloadDisabled(room, fetching = false) {
      return fetching || !this.floor || !room || this.downloadingKey !== null || this.estimatingKey !== null || this.downloadConfirmation !== null;
    },
    sanitizeFileNamePart(value) {
      const sanitized = String(value || 'unknown')
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();
      return sanitized || 'unknown';
    },
    buildFileName(room, type, extension) {
      const floorName = this.sanitizeFileNamePart(this.floor ? this.floor.title : this.floorId);
      const roomName = this.sanitizeFileNamePart(room && room.title);
      return floorName + '_' + roomName + '_' + type + '.' + extension;
    },
    triggerDownload(blob, fileName) {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    downloadTimeline(room) {
      if (this.isDownloadDisabled(room)) return Promise.resolve();
      const downloadKey = 'timeline:' + room._id;
      this.downloadingKey = downloadKey;

      return chatApi
        .managementTimeline({
          floor_id: this.floorId,
          room_id: room._id,
        })
        .then((res) => {
          const blob = new Blob([JSON.stringify(res.data, null, '  ')], { type: 'application/json' });
          this.triggerDownload(blob, this.buildFileName(room, 'timeline', 'json'));
        })
        .catch((error) => {
          this.showError(this.$t('タイムラインJSONの取得に失敗しました'), error);
        })
        .finally(() => {
          if (this.downloadingKey === downloadKey) this.downloadingKey = null;
        });
    },
    downloadMedia(room) {
      if (this.isDownloadDisabled(room)) return Promise.resolve();
      const downloadKey = 'media:' + room._id;
      this.downloadingKey = downloadKey;

      return chatApi
        .managementTimelineMedia(
          {
            floor_id: this.floorId,
            room_id: room._id,
          },
          { responseType: 'blob' }
        )
        .then((res) => {
          this.triggerDownload(new Blob([res.data]), this.buildFileName(room, 'media', 'zip'));
        })
        .catch((error) => {
          this.showError(this.$t('メディアZIPの取得に失敗しました'), error);
        })
        .finally(() => {
          if (this.downloadingKey === downloadKey) this.downloadingKey = null;
        });
    },
    showError(message, error) {
      if (this.$refs.listBase && this.$refs.listBase.showError) {
        this.$refs.listBase.showError(message, error);
      }
    },
  },
};
</script>
