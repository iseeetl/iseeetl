<template>
  <ManagementListBase
    :title="$t('タイムラインデータ管理')"
    :table-label="$t('フロア一覧')"
    :fetcher="fetchFloors"
    :errorMessage="$t('フロアの取得に失敗しました')"
    :searchEnabled="true"
    :searchLabel="$t('検索')"
    :searchMinLength="2"
    :searchMaxLength="10"
    :searchMinErrorText="$t('2文字以上です')"
    :searchMaxErrorText="$t('10文字以内です')"
  >
    <template #table="{ items, fetching, tableAttrs }">
      <div class="management-table-scroll">
        <table
          v-bind="tableAttrs"
          class="management-table management-table--wide timeline-floor-table"
          data-testid="timeline-floor-list"
        >
          <thead>
            <tr>
              <th scope="col">{{ $t('フロア') }}</th>
              <th scope="col">{{ $t('ユーザ名') }}</th>
              <th scope="col">{{ $t('managementUi.status') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('更新日') }}</th>
              <th scope="col">{{ $t('削除日') }}</th>
              <th scope="col">{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="floor in items" :key="floor._id" :class="{ 'soft-delete': floor.delete_flg }">
              <td :data-label="$t('フロア')" dir="auto">{{ floor.title }}</td>
              <td :data-label="$t('ユーザ名')" dir="auto">
                {{ resolveUserDisplayName(floor.user) || $t('managementUi.referenceUnavailable') }}
              </td>
              <td :data-label="$t('managementUi.status')">
                <div class="management-status-list">
                  <ManagementStatusBadge
                    :tone="floor.delete_flg ? 'danger' : 'success'"
                    :label="$t(floor.delete_flg ? 'managementUi.statusDeleted' : 'managementUi.statusActive')"
                  />
                  <ManagementStatusBadge
                    :tone="floor.floor_display_hidden ? 'warning' : 'info'"
                    :label="$t(floor.floor_display_hidden ? 'managementUi.statusHidden' : 'managementUi.statusVisible')"
                  />
                </div>
              </td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(floor.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('更新日')">
                <span v-text="formatManagementDate(floor.updated_at) || '—'"></span>
              </td>
              <td :data-label="$t('削除日')">
                <span v-text="formatManagementDate(floor.deleted_at) || '—'"></span>
              </td>
              <td :data-label="$t('操作')">
                <div class="management-row-actions-group">
                  <div class="management-row-actions">
                    <UiButton
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      :disabled="fetching"
                      :data-testid="'timeline-floor-rooms-' + floor._id"
                      :aria-label="$t('managementUi.showRoomsAria', { name: floor.title })"
                      @click="showRooms(floor)"
                    >
                      {{ $t('ルーム一覧') }}
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
</template>

<script>
import floorApi from '@/api/floor';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import ManagementStatusBadge from '@/components/management/ManagementStatusBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'TimelineDataManagement',
  components: {
    ManagementListBase,
    ManagementStatusBadge,
    UiButton,
  },
  data() {
    return {
    };
  },
  methods: {
    ...userDisplayMethods,
    ...createManagementDateFormatterMethods(),
    fetchFloors(payload) {
      return floorApi.managementPaginate(payload);
    },
    showRooms(floor) {
      if (!floor || !floor._id) return;
      this.$router.push({
        name: 'TimelineRoomDataManagement',
        params: { floorId: floor._id },
      });
    },
  },
};
</script>
