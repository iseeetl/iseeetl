<template>
  <div>
    <div class="view" :aria-busy="sending ? 'true' : 'false'">
      <div
        class="room-decoration"
        :style="
          floorImageUrl
            ? {
                backgroundImage:
                  'linear-gradient(to right, rgba(255, 255, 255, 1) 50%, rgba(255, 255, 255, 0) 70%), url(' +
                  floorImageUrl +
                  ')',
              }
            : {}
        "
      >
        <div class="view-header">
          <BackButton />

          <h1 v-if="floorTitle" class="view-title" dir="auto">{{ `${floorTitle} ${$t('ルーム一覧')}` }}</h1>
        </div>

        <p v-if="floorDescription" class="room-description" dir="auto">
          {{ floorDescription }}
        </p>
      </div>

      <div class="view-content">
        <div class="view-action" v-if="isAdmin || isFloorEditor || isFloorMember">
          <UiButton
            v-if="isAdmin || isFloorEditor || isFloorMember"
            appearance="filled"
            tone="success"
            data-testid="room-list-create-button"
            @click="showEditRoomDialog(null)"
          >
            {{ $t('ルーム作成') }}
          </UiButton>

          <UiButton
            v-if="isAdmin || isFloorEditor || isFloorMember"
            appearance="filled"
            tone="success"
            data-testid="room-list-hide-all-button"
            @click="showUpdateRoomDisplayConfirm(true)"
          >
            {{ $t('全ルーム非表示') }}
          </UiButton>

          <UiButton
            v-if="isAdmin || isFloorEditor || isFloorMember"
            appearance="filled"
            tone="success"
            @click="showUpdateRoomDisplayConfirm(false)"
          >
            {{ $t('全ルーム表示') }}
          </UiButton>

          <UiButton
            v-if="isAdmin || isFloorEditor"
            appearance="filled"
            tone="success"
            data-testid="room-floor-tag-button"
            @click="showFloorTagDialog"
          >
            {{ $t('フロアタグ') }}
          </UiButton>

          <UiButton
            v-if="isAdmin || isFloorEditor"
            appearance="filled"
            tone="success"
            data-testid="room-floor-ai-analysis-settings-button"
            @click="showFloorAIAnalysisSettingDialog"
          >
            {{ $t('aiAnalysisSettings.floorButton') }}
          </UiButton>

          <UiButton
            v-if="isAdmin || isFloorEditor"
            appearance="filled"
            tone="success"
            data-testid="room-floor-quicktext-button"
            @click="showFloorQuickTextDialog"
          >
            {{ $t('フロア単語') }}
          </UiButton>

          <UiButton
            v-if="isAdmin || isFloorEditor"
            appearance="filled"
            tone="success"
            data-testid="room-invite-floor-member-button"
            @click="showInviteFloorMemberDialog"
          >
            {{ $t('フロアメンバー招待') }}
          </UiButton>

          <UiButton
            v-if="isAdmin || isFloorEditor || isFloorMember"
            appearance="filled"
            tone="success"
            data-testid="room-floor-member-list-button"
            @click="showFloorMemberDialog"
          >
            {{ $t('フロアメンバー一覧') }}
          </UiButton>

          <UiButton
            v-if="isFloorMember"
            appearance="filled"
            tone="success"
            data-testid="room-leave-floor-member-button"
            @click="showLeaveFloorMemberDialog"
          >
            {{ $t('フロアメンバー脱退') }}
          </UiButton>

          <UiButton
            v-if="isAdmin || isFloorEditor"
            appearance="filled"
            tone="success"
            data-testid="room-kicked-user-list-button"
            @click="showKickedUserDialog"
          >
            {{ $t('キック済みユーザ一覧') }}
          </UiButton>
        </div>

        <draggable
          tag="ul"
          class="room-list"
          handle=".room-handle"
          :list="rooms"
          item-key="_id"
          :disabled="sending"
          @end="onDragEnd"
        >
          <template #item="{ element: room }">
          <li>
            <div class="room-wrapper">
              <UiTooltip
                v-if="isAdmin || isFloorEditor || isFloorMember"
                class="room-handle-tooltip"
                :text="$t('ドラッグアンドドロップ')"
              >
                <UiButton
                  v-if="isAdmin || isFloorEditor || isFloorMember"
                  :id="'drag_room_button_' + room._id"
                  class="small-button room-handle"
                  icon-only
                  density="dense"
                  :aria-label="$t('このボタンをドラッグ&ドロップすることでルーム一覧の表示位置を変えられます')"
                >
                  <UiIcon name="drag_indicator" />
                </UiButton>
              </UiTooltip>
              <router-link
                :id="room._id"
                class="room-link"
                :to="{ path: `/floor/${$route.params.floor_id}/room/${room._id}` }"
                @click.prevent="checkAndNavigateToTimeline(room)"
              >
                <div class="room-info">
                  <div v-if="typeof room.image_name !== 'undefined' && room.image_name !== null">
                    <div
                      class="room-image"
                      :style="{
                        backgroundImage: 'url(' + '/media/' + floorId + '/' + room._id + '/' + room.image_name + ')',
                      }"
                    ></div>
                  </div>
                  <div class="room-detail">
                    <div class="room-status-chip hide-room-display" v-if="room.room_display_hidden">
                      {{ $t('非表示中') }}
                    </div>

                    <div class="room-status-chip member-only" v-if="room.member_only">
                      {{ $t('メンバー限定') }}
                    </div>

                    <div class="room-status-chip guest-reaction-only" v-if="room.guest_reaction_only">
                      {{ $t('ゲストはリアクションのみ') }}
                    </div>

                    <div class="room-status-chip external-sns-button" v-if="room.external_sns_button">
                      {{ $t('外部SNS連携') }}
                    </div>

                    <h2 class="room-title" dir="auto">
                      {{ getRoomTitle(room) }}
                    </h2>

                    <div class="room-description" v-if="room.description !== null">
                      <p dir="auto">
                        {{ getRoomDescription(room) }}
                      </p>
                    </div>

                    <div class="room-created-info">
                      <div class="user-icon">
                        <UiAvatar>
                          <UiIcon
                            v-if="!hasUserDisplayImage(room.user)"
                            name="person"
                            :size="24"
                          />
                          <img v-else :src="getUserDisplayImagePath(room.user)" alt="" />
                        </UiAvatar>
                      </div>

                      <div>
                        <div class="room-creator">
                          <div class="room-creator-label">
                            {{ $t('ルーム作成者') + ' ' }}
                          </div>
                          <div dir="auto">
                            {{ resolveUserDisplayName(room.user) }}
                          </div>
                        </div>
                        <div class="room-created-date">
                          <div class="room-creator-label">
                            {{ $t('ルーム作成日') + ' ' }}
                          </div>
                          <div>
                            {{ getLocalDate(room.created_at) }}
                          </div>
                        </div>
                        <div
                          class="last-post-date"
                          v-if="typeof room.last_post_date !== 'undefined' && room.last_post_date !== null"
                        >
                          <div class="room-creator-label">
                            {{ $t('最終投稿日時') + ' ' }}
                          </div>
                          <div>
                            {{ getLocalDateTime(room.last_post_date) }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </router-link>
            </div>
            <div class="room-action" v-if="canManageRooms || canListRoomMembers(room)">
              <UiButton
                v-if="canManageRooms"
                appearance="filled"
                tone="danger"
                :class="'delete-room-button-' + room._id"
                @click="showDeleteRoomDialog(room)"
              >
                {{ $t('削除') }}
              </UiButton>

              <UiButton
                v-if="isAdmin || isFloorEditor || isFloorMember"
                appearance="filled"
                tone="success"
                :class="'roomtag-button-' + room._id"
                :data-testid="'room-tag-button-' + room._id"
                @click="showRoomTagDialog(room._id)"
              >
                {{ $t('ルームタグ') }}
              </UiButton>

              <UiButton
                v-if="isAdmin || isFloorEditor"
                appearance="filled"
                tone="success"
                :data-testid="'room-ai-analysis-settings-button-' + room._id"
                @click="showRoomAIAnalysisSettingDialog(room._id)"
              >
                {{ $t('aiAnalysisSettings.roomButton') }}
              </UiButton>

              <UiButton
                v-if="isAdmin || isFloorEditor || isFloorMember"
                appearance="filled"
                tone="success"
                :class="'roo-mt-button-' + room._id"
                :data-testid="'room-quicktext-button-' + room._id"
                @click="showRoomQuickTextDialog(room)"
              >
                {{ $t('ルーム単語') }}
              </UiButton>

              <UiButton
                v-if="canInviteRoomMembers(room)"
                appearance="filled"
                tone="success"
                :data-testid="'room-invite-member-button-' + room._id"
                @click="showInviteRoomMemberDialog(room)"
              >
                {{ $t('ルームメンバー招待') }}
              </UiButton>

              <UiButton
                v-if="canListRoomMembers(room)"
                appearance="filled"
                tone="success"
                :data-testid="'room-member-list-button-' + room._id"
                @click="showRoomMemberDialog(room)"
              >
                {{ $t('ルームメンバー一覧') }}
              </UiButton>

              <UiButton
                v-if="canManageRooms"
                appearance="filled"
                tone="primary"
                :class="'edit-room-button-' + room._id"
                @click="showEditRoomDialog(room)"
              >
                {{ $t('編集') }}
              </UiButton>
            </div>
          </li>
          </template>
        </draggable>
      </div>
    </div>

    <EditRoomDialog
      :dialogVisible="editRoomDialogVisible"
      :room="editRoomValue"
      :targetName="editRoomDialogTargetName"
      :managementMode="false"
      @success="successEditRoom"
      @close="closeEditRoom"
    />

    <DeleteRoomDialog
      :dialogVisible="deleteRoomDialogVisible"
      :room="deleteRoomValue"
      :targetName="deleteRoomDialogTargetName"
      @success="successDeleteRoom"
      @close="closeDeleteRoom"
    />

    <InviteRoomMemberDialog
      :dialogVisible="roomMemberDialogs.inviteVisible"
      :floorId="floorId || ''"
      :roomId="roomMemberDialogTargetId"
      :roomTitle="roomMemberDialogTargetTitle"
      @close="closeInviteRoomMemberDialog"
    />

    <RoomMemberDialog
      ref="roomMemberDialogRef"
      :dialogVisible="roomMemberDialogs.listVisible"
      :roomId="roomMemberDialogTargetId"
      :roomTitle="roomMemberDialogTargetTitle"
      :canDeleteMembers="canDeleteRoomMembers"
      @delete="showDeleteRoomMemberDialog"
      @request-close="closeRoomMemberDialog"
    />

    <DeleteRoomMemberDialog
      :dialogVisible="roomMemberDialogs.deleteVisible"
      :propsRoomMember="roomMemberDialogs.deleteValue"
      :roomTitle="roomMemberDialogTargetTitle"
      @success="successDeleteRoomMember"
      @close="closeDeleteRoomMemberDialog"
    />

    <FloorTagDialog
      :dialogVisible="tagDialogs.floor.listVisible"
      :floorId="floorId"
      :floorName="floorTitle || ''"
      @close="closeFloorTagDialog"
    />

    <InviteFloorMemberDialog
      :dialogVisible="inviteFloorMemberDialogVisible"
      :floorId="floorId || ''"
      :floorTitle="floorTitle || ''"
      @close="closeInviteFloorMember"
    />

    <FloorMemberDialog
      ref="floorMemberDialogRef"
      :dialogVisible="floorMemberDialogVisible"
      :floorId="floorId || ''"
      :floorTitle="floorTitle || ''"
      :propsRole="{ isAdmin: isAdmin, isFloorEditor: isFloorEditor }"
      @delete="showDeleteFloorMemberDialog"
      @request-close="closeFloorMember"
    />

    <DeleteFloorMemberDialog
      :dialogVisible="deleteFloorMemberDialogVisible"
      :propsFloorMember="deleteFloorMemberValue"
      :floorId="floorId || ''"
      :floorTitle="floorTitle || ''"
      @success="successDeleteFloorMember"
      @close="closeDeleteFloorMember"
    />

    <LeaveFloorMemberDialog
      :dialogVisible="leaveFloorMemberDialogVisible"
      :floorId="floorId || ''"
      :floorTitle="floorTitle || ''"
      @success="successLeaveFloorMember"
      @close="closeLeaveFloorMember"
    />

    <RoomTagDialog
      :dialogVisible="tagDialogs.room.listVisible"
      :roomId="tagDialogs.room.roomId"
      :roomName="roomTagDialogTargetName"
      @close="closeRoomTagDialog"
    />

    <ScopedAIAnalysisSettingDialog
      v-if="isAdmin || isFloorEditor"
      :dialog-visible="floorAIAnalysisSettingDialogVisible"
      scope="floor"
      :floor-id="floorId"
      :target-name="floorTitle || ''"
      @close="closeFloorAIAnalysisSettingDialog"
    />

    <ScopedAIAnalysisSettingDialog
      v-if="isAdmin || isFloorEditor"
      :dialog-visible="roomAIAnalysisSettingDialogVisible"
      scope="room"
      :floor-id="floorId"
      :room-id="aiAnalysisSettingRoomId"
      :target-name="aiAnalysisSettingRoomTargetName"
      @close="closeRoomAIAnalysisSettingDialog"
    />

    <ResourceQuickTextDialog
      v-if="floorQuickTextDialogVisible && floorId"
      :dialog-visible="floorQuickTextDialogVisible"
      resource="floor"
      :resource-id="floorId"
      :target-name="floorTitle || ''"
      :can-manage="isAdmin || isFloorEditor"
      @close="closeFloorQuickTextDialog"
    />

    <ResourceQuickTextDialog
      v-if="roomQuickTextDialogVisible && roomQuickTextDialogTarget"
      :dialog-visible="roomQuickTextDialogVisible"
      resource="room"
      :resource-id="roomQuickTextDialogTarget._id"
      :target-name="roomQuickTextDialogTargetTitle"
      :can-manage="canManageRooms"
      @close="closeRoomQuickTextDialog"
    />

    <UpdateRoomDisplayConfirm
      :confirmVisible="updateRoomDisplayVisible"
      :roomDisplayHidden="roomDisplayHidden"
      :sending="sending"
      @done="updateRoomDisplay"
      @close="closeUpdateRoomDisplayConfirm"
    />

    <KickedUserDialog
      ref="kickedUserDialogRef"
      :dialogVisible="kickedUserDialogVisible"
      :floorId="floorId || ''"
      :floorTitle="floorTitle || ''"
      @request-close="closeKickedUserDialog"
      @release="showDeleteKickedUserDialog"
    />
    <DeleteKickedUserDialog
      :dialogVisible="deleteKickedUserDialogVisible"
      :floorId="floorId || ''"
      :floorTitle="floorTitle || ''"
      :kickedUser="deleteKickedUserValue"
      @success="successDeleteKickedUser"
      @close="closeDeleteKickedUserDialog"
    />
  </div>
</template>

<script>
import chatApi from '@/api/chat';
import floorApi from '@/api/floor';
import kickedUserApi from '@/api/kickedUser';
import roomApi from '@/api/room';
import { appendApiErrorMessage } from '@/api/apiClient';
import { shouldIgnorePageLeaveError } from '@/utils/plannedPageLeave';
import DateUtil from '@/utils/dateUtil.js';
import TranslationUtil from '@/utils/translationUtil';

import BackButton from '@/components/common/BackButton.vue';
import EditRoomDialog from '@/components/room/EditRoomDialog.vue';
import DeleteRoomDialog from '@/components/room/DeleteRoomDialog.vue';

import FloorMemberDialog from '@/components/floor-member/FloorMemberDialog.vue';
import DeleteFloorMemberDialog from '@/components/floor-member/DeleteFloorMemberDialog.vue';
import InviteFloorMemberDialog from '@/components/floor-member/InviteFloorMemberDialog.vue';
import LeaveFloorMemberDialog from '@/components/floor-member/LeaveFloorMemberDialog.vue';

import InviteRoomMemberDialog from '@/components/room-member/InviteRoomMemberDialog.vue';
import RoomMemberDialog from '@/components/room-member/RoomMemberDialog.vue';
import DeleteRoomMemberDialog from '@/components/room-member/DeleteRoomMemberDialog.vue';

import RoomTagDialog from '@/components/room-tag/RoomTagDialog.vue';
import ScopedAIAnalysisSettingDialog from '@/components/analysis/ScopedAIAnalysisSettingDialog.vue';
import ResourceQuickTextDialog from '@/components/quicktext/ResourceQuickTextDialog.vue';

import FloorTagDialog from '@/components/floor-tag/FloorTagDialog.vue';

import draggable from 'vuedraggable';
import UpdateRoomDisplayConfirm from '@/components/room/UpdateRoomDisplayConfirm.vue';

import KickedUserDialog from '@/components/kicked-user/KickedUserDialog.vue';
import DeleteKickedUserDialog from '@/components/kicked-user/DeleteKickedUserDialog.vue';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { createRoomTagDialogState, tagDialogCoordinator } from '@/features/room/tagDialogCoordinator';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'Room',
  inject: {
    analyticsPageReporter: {
      from: 'analyticsPageReporter',
      default: null,
    },
  },
  components: {
    BackButton,
    EditRoomDialog,
    DeleteRoomDialog,

    FloorMemberDialog,
    DeleteFloorMemberDialog,
    InviteFloorMemberDialog,
    LeaveFloorMemberDialog,

    InviteRoomMemberDialog,
    RoomMemberDialog,
    DeleteRoomMemberDialog,

    RoomTagDialog,
    ScopedAIAnalysisSettingDialog,
    ResourceQuickTextDialog,

    FloorTagDialog,

    draggable,

    UpdateRoomDisplayConfirm,

    KickedUserDialog,
    DeleteKickedUserDialog,
    UiAvatar,
    UiButton,
    UiIcon,
    UiTooltip,
  },
  computed: {
    canManageRooms() {
      return this.isAdmin || this.isFloorEditor || this.isFloorMember;
    },
    canDeleteRoomMembers() {
      if (this.isAdmin || this.isFloorEditor) return true;
      if (!this.isFloorMember || !this.roomMemberDialogs.targetRoom) return false;

      const roomCreator = this.roomMemberDialogs.targetRoom.user;
      const roomCreatorId = typeof roomCreator === 'object' ? roomCreator?._id : roomCreator;
      return Boolean(roomCreatorId && roomCreatorId === this.$store.getters.userId);
    },
    roomMemberDialogTargetId() {
      return this.roomMemberDialogs.targetRoom?._id || '';
    },
    roomMemberDialogTargetTitle() {
      return this.roomMemberDialogs.targetRoom ? this.getRoomTitle(this.roomMemberDialogs.targetRoom) : '';
    },
    roomTagDialogTargetName() {
      const room = this.rooms.find((item) => item._id === this.tagDialogs.room.roomId);
      return room ? this.getRoomTitle(room) : '';
    },
    roomQuickTextDialogTargetTitle() {
      return this.roomQuickTextDialogTarget ? this.getRoomTitle(this.roomQuickTextDialogTarget) : '';
    },
    editRoomDialogTargetName() {
      return this.editRoomValue ? this.getRoomTitle(this.editRoomValue) : '';
    },
    deleteRoomDialogTargetName() {
      return this.deleteRoomValue ? this.getRoomTitle(this.deleteRoomValue) : '';
    },
  },
  data() {
    return {
      floorId: null,
      floorTitle: null,
      floorDescription: null,
      floorDetails: null,
      floorLang: null,
      floorTranslations: [],
      floorImageUrl: null,

      rooms: [],

      isAdmin: false,
      isFloorEditor: false,
      isFloorMember: false,
      isRoomMember: false,

      inviteFloorMemberDialogVisible: false,
      floorMemberDialogVisible: false,
      deleteFloorMemberDialogVisible: false,
      deleteFloorMemberValue: null,
      pendingDeletedFloorMember: null,
      leaveFloorMemberDialogVisible: false,

      roomMemberDialogs: {
        targetRoom: null,
        inviteVisible: false,
        listVisible: false,
        deleteVisible: false,
        deleteValue: null,
        pendingDeletedMember: null,
      },

      tagDialogs: createRoomTagDialogState(),

      editRoomDialogVisible: false,
      editRoomValue: null,
      deleteRoomDialogVisible: false,
      deleteRoomValue: null,
      deleteRoomFocusTargetId: null,

      floorAIAnalysisSettingDialogVisible: false,
      roomAIAnalysisSettingDialogVisible: false,
      aiAnalysisSettingRoomId: null,
      aiAnalysisSettingRoomTargetName: '',

      floorQuickTextDialogVisible: false,
      roomQuickTextDialogVisible: false,
      roomQuickTextDialogTarget: null,

      updateRoomDisplayVisible: false,
      roomDisplayHidden: null,

      kickedUserDialogVisible: false,
      deleteKickedUserDialogVisible: false,
      deleteKickedUserValue: null,
      pendingReleasedKickedUser: null,

      sending: false,
      analyticsPageToken: null,
      roomInitializationGeneration: 0,
      roomInitializationDisposed: false,
    };
  },
  created() {
    this.captureRoomListAnalytics();
    this.initRoom();
  },
  mounted() {
    if (this.$store.getters.errorMessage !== null) {
      this.setSnackbar(this.$store.getters.errorMessage, 'alert');
      this.$store.dispatch('doUpdateErrorMessage', {
        message: null,
      });
    }
  },
  beforeUnmount() {
    this.roomInitializationDisposed = true;
    this.roomInitializationGeneration += 1;
    this.cancelRoomListAnalytics();
  },
  watch: {
    '$i18n.locale'() {
      this.applyFloorPresentation();
    },
  },
  methods: {
    ...userDisplayMethods,
    beginRoomInitialization() {
      this.roomInitializationGeneration += 1;
      return Object.freeze({
        generation: this.roomInitializationGeneration,
        floorId: String(this.$route?.params?.floor_id || ''),
      });
    },
    isRoomInitializationCurrent(initialization) {
      return Boolean(
        initialization &&
        !this.roomInitializationDisposed &&
        initialization.generation === this.roomInitializationGeneration &&
        initialization.floorId &&
        initialization.floorId === String(this.$route?.params?.floor_id || '')
      );
    },
    captureRoomListAnalytics() {
      try {
        this.analyticsPageToken = this.analyticsPageReporter?.capture?.() || null;
      } catch (_error) {
        this.analyticsPageToken = null;
      }
      return this.analyticsPageToken;
    },
    activateRoomListAnalytics(floor) {
      if (!this.analyticsPageReporter) return true;
      if (!this.analyticsPageToken) return false;
      try {
        return this.analyticsPageReporter.activate?.(this.analyticsPageToken, floor) === true;
      } catch (_error) {
        return false;
      }
    },
    cancelRoomListAnalytics() {
      const token = this.analyticsPageToken;
      this.analyticsPageToken = null;
      if (!this.analyticsPageReporter) return true;
      if (!token) return false;
      try {
        return this.analyticsPageReporter.cancel?.(token) === true;
      } catch (_error) {
        return false;
      }
    },
    async initRoom() {
      const initialization = this.beginRoomInitialization();
      try {
        if (this.$store.getters.userIsLogin) {
          await this.checkUserRole(initialization);
          if (!this.isRoomInitializationCurrent(initialization)) return;
        }

        const isKicked = await this.checkKickedUser(initialization);
        if (!this.isRoomInitializationCurrent(initialization)) return;
        if (isKicked) {
          this.cancelRoomListAnalytics();
          return;
        }

        const floor = await this.fetchAndSetFloorDetails(initialization);
        if (!this.isRoomInitializationCurrent(initialization)) return;

        await this.fetchRoomList(initialization);
        if (!this.isRoomInitializationCurrent(initialization)) return;
        this.activateRoomListAnalytics(floor);
      } catch (err) {
        if (!this.isRoomInitializationCurrent(initialization)) return;
        this.cancelRoomListAnalytics();
        if (shouldIgnorePageLeaveError(err)) return;

        const message = appendApiErrorMessage(this.$t('ルーム詳細の取得に失敗しました'), err, {
          translate: this.$t,
        });
        this.$store.dispatch('doUpdateErrorMessage', { message });
        this.$router.push({ name: 'Floor' });

        return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
      }
    },

    async checkUserRole(initialization = null) {
      try {
        const floorId = initialization?.floorId || this.$route.params.floor_id;
        const roleRes = await floorApi.role({ floor_id: floorId });
        if (initialization && !this.isRoomInitializationCurrent(initialization)) return null;
        this.setUserRole(roleRes.data.role);
        return roleRes.data.role;
      } catch (err) {
        throw err;
      }
    },

    setUserRole(role) {
      this.isAdmin = role === 'Administrator';
      this.isFloorEditor = role === 'FloorEditor';
      this.isFloorMember = role === 'FloorMember';
      this.isRoomMember = role === 'RoomMember';
    },

    async fetchAndSetFloorDetails(initialization = null) {
      try {
        const floorId = initialization?.floorId || this.$route.params.floor_id;
        const floorDetailRes = await floorApi.detail({ _id: floorId });
        if (initialization && !this.isRoomInitializationCurrent(initialization)) return null;
        this.setFloorDetails(floorDetailRes.data);
        return floorDetailRes.data;
      } catch (err) {
        throw err;
      }
    },

    setFloorDetails(floorData) {
      this.floorId = floorData._id;
      this.floorDetails = floorData;
      this.floorLang = floorData.lang;
      this.floorTranslations = floorData.translations;
      this.floorImageUrl = floorData.image_name ? `/media/${floorData._id}/${floorData.image_name}` : null;

      this.applyFloorPresentation();
    },

    applyFloorPresentation() {
      if (!this.floorDetails) return;

      this.floorTitle = this.getTranslatedTitle(this.floorDetails, this.$i18n.locale);
      this.floorDescription = this.getTranslatedDescription(this.floorDetails, this.$i18n.locale);

      this.$store.dispatch('doUpdateFloor', {
        id: this.$route.params.floor_id,
        title: this.floorTitle,
      });
    },

    async checkKickedUser(initialization = null) {
      if (!this.$store.getters.userIsLogin) return false;

      try {
        const floorId = initialization?.floorId || this.$route.params.floor_id;
        const kickedUserRes = await kickedUserApi.check({ floor_id: floorId });
        if (initialization && !this.isRoomInitializationCurrent(initialization)) return false;
        if (kickedUserRes.data) {
          const message = this.$t('キックされているため、このフロア及びルームにはアクセスできません');
          this.$store.dispatch('doUpdateErrorMessage', { message });
          this.$router.push({ name: 'Floor' });
        }
        return kickedUserRes.data;
      } catch (err) {
        throw err;
      }
    },

    async fetchRoomList(initialization = null) {
      try {
        if (this.sending) return;
        this.sending = true;

        const res = await roomApi.list({ floor_id: this.floorId, isGuest: !this.$store.getters.userIsLogin });
        if (initialization && !this.isRoomInitializationCurrent(initialization)) return;
        this.rooms = res.data;

        // 入室ダイアログを閉じたルームへフォーカスを戻すため、保存しておいたIDを使用する。
        this.$nextTick(() => {
          if (initialization && !this.isRoomInitializationCurrent(initialization)) return;
          if (this.$store.getters.tempRoomId) {
            const link = document.getElementById(this.$store.getters.tempRoomId);
            if (link) {
              link.focus();
            }
            this.$store.dispatch('doSetTempRoomId', {
              tempRoomId: null,
            });
          }
        });
      } catch (err) {
        throw err;
      } finally {
        this.sending = false;
      }
    },

    getTranslatedTitle(floor) {
      return TranslationUtil.getTitle(floor, this.$i18n.locale);
    },

    getTranslatedDescription(floor) {
      return TranslationUtil.getDescription(floor, this.$i18n.locale);
    },

    getRoomTitle(room) {
      if (room.lang === this.$i18n.locale) return room.title;
      if (room.translations === undefined) return room.title;
      const translation = room.translations.find((t) => t.lang === this.$i18n.locale);
      if (translation === undefined) return room.title;
      return translation.title;
    },

    getRoomDescription(room) {
      if (room.lang === this.$i18n.locale) return room.description;
      if (room.translations === undefined) return room.description;
      const translation = room.translations.find((t) => t.lang === this.$i18n.locale);
      if (translation === undefined) return room.description;
      return translation.description;
    },

    getLocalDate(date) {
      return DateUtil.getLocalDate(date, this.$i18n.locale, 'date');
    },

    getLocalDateTime(date) {
      return DateUtil.getLocalDate(date, this.$i18n.locale, 'dateTime');
    },

    async checkAndNavigateToTimeline(room) {
      try {
        let hasRoomAccessRole = false;

        if (this.$store.getters.userIsLogin) {
          const roleRes = await chatApi.role({
            floor_id: room.floor,
            room_id: room._id,
          });

          // 入室可否は、毎回取得する最新のルーム権限で判定する。
          const roomRole = roleRes && roleRes.data ? roleRes.data.role : null;
          hasRoomAccessRole =
            roomRole === 'Administrator' ||
            roomRole === 'FloorEditor' ||
            roomRole === 'FloorMember' ||
            roomRole === 'RoomMember';
        }

        if (room.member_only) {
          if (!this.$store.getters.userIsLogin) throw new Error(this.$t('入室の許可がありません'));
          if (!hasRoomAccessRole) throw new Error();
        }

        this.$router.push({ path: `/floor/${room.floor}/room/${room._id}` });
      } catch (err) {
        const isAuthError = handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
        if (!isAuthError) {
          this.setSnackbar(this.$t('入室の許可がありません'), 'alert');
        }
      }
    },

    onDragEnd(event) {
      const newIndex =
        typeof event?.newDraggableIndex === 'number'
          ? event.newDraggableIndex
          : typeof event?.newIndex === 'number'
          ? event.newIndex
          : -1;
      const oldIndex =
        typeof event?.oldDraggableIndex === 'number'
          ? event.oldDraggableIndex
          : typeof event?.oldIndex === 'number'
          ? event.oldIndex
          : -1;

      if (newIndex === oldIndex) {
        return;
      }

      const previousRooms = [...this.rooms];
      if (newIndex >= 0 && oldIndex >= 0) {
        const [movedRoom] = previousRooms.splice(newIndex, 1);
        if (movedRoom) previousRooms.splice(oldIndex, 0, movedRoom);
      }

      const newDisplayOrders = [];
      for (let i = 0; i < this.rooms.length; i++) {
        newDisplayOrders.push({ _id: this.rooms[i]._id, display_order: i });
      }

      this.sending = true;
      const data = {
        floor_id: this.floorId,
        displayorders: newDisplayOrders,
      };
      roomApi
        .updateDisplayOrder(data)
        .then(() => {
          this.setSnackbar(this.$t('ルームの表示順序を更新しました'), 'status');
        })
        .catch((e) => {
          if (e.response && e.response.status === 401) {
            return handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
          } else {
            this.rooms = previousRooms;
            const message = appendApiErrorMessage(this.$t('ルームの表示順序の更新に失敗しました'), e, {
              translate: this.$t,
            });
            this.setSnackbar(message, 'alert');
          }
        })
        .finally(() => {
          this.sending = false;
        });
    },

    showEditRoomDialog(val = null) {
      this.editRoomDialogVisible = true;
      this.editRoomValue = val;
    },
    successEditRoom(room) {
      const index = this.rooms.findIndex((r) => r._id === room._id);
      if (index !== -1) {
        this.rooms[index] = room;
      } else {
        this.rooms.unshift(room);
      }

      this.editRoomDialogVisible = false;
    },
    closeEditRoom() {
      this.editRoomDialogVisible = false;
      this.editRoomValue = null;
    },

    showDeleteRoomDialog(val) {
      this.deleteRoomFocusTargetId = null;
      this.deleteRoomDialogVisible = true;
      this.deleteRoomValue = val;
    },
    successDeleteRoom(room) {
      const index = this.rooms.findIndex((r) => r._id === room._id);
      if (index !== -1) {
        this.deleteRoomFocusTargetId =
          this.rooms[index + 1]?._id || this.rooms[index - 1]?._id || '';
        this.rooms.splice(index, 1);
      } else {
        this.deleteRoomFocusTargetId = '';
      }
      this.deleteRoomDialogVisible = false;
    },
    closeDeleteRoom() {
      const focusTargetId = this.deleteRoomFocusTargetId;
      this.deleteRoomDialogVisible = false;
      this.deleteRoomValue = null;
      this.deleteRoomFocusTargetId = null;
      if (focusTargetId === null) return;
      this.$nextTick(() => {
        const roomLink = focusTargetId ? document.getElementById(focusTargetId) : null;
        const fallback = document.querySelector('[data-testid="room-list-create-button"]');
        const focusTarget = roomLink?.isConnected && !roomLink.disabled ? roomLink : fallback;
        if (!focusTarget?.isConnected || focusTarget.disabled || typeof focusTarget.focus !== 'function') return;
        focusTarget.focus({ preventScroll: true });
      });
    },

    canInviteRoomMembers(room) {
      return Boolean(room?.member_only && this.canManageRooms);
    },
    canListRoomMembers(room) {
      return Boolean(
        room?.member_only && (this.canManageRooms || room.current_user_is_room_member === true)
      );
    },
    showInviteRoomMemberDialog(room) {
      if (!this.canInviteRoomMembers(room)) return;
      Object.assign(this.roomMemberDialogs, { targetRoom: room, inviteVisible: true });
    },
    closeInviteRoomMemberDialog() {
      Object.assign(this.roomMemberDialogs, { targetRoom: null, inviteVisible: false });
    },
    showRoomMemberDialog(room) {
      if (!this.canListRoomMembers(room)) return;
      Object.assign(this.roomMemberDialogs, {
        targetRoom: room,
        listVisible: true,
        deleteVisible: false,
        deleteValue: null,
        pendingDeletedMember: null,
      });
    },
    closeRoomMemberDialog() {
      Object.assign(this.roomMemberDialogs, {
        targetRoom: null,
        listVisible: false,
        deleteVisible: false,
        deleteValue: null,
        pendingDeletedMember: null,
      });
    },
    showDeleteRoomMemberDialog(roomMember) {
      Object.assign(this.roomMemberDialogs, {
        listVisible: true,
        deleteVisible: true,
        deleteValue: roomMember,
        pendingDeletedMember: null,
      });
    },
    successDeleteRoomMember(roomMember) {
      this.roomMemberDialogs.pendingDeletedMember = roomMember;
      this.roomMemberDialogs.deleteVisible = false;
    },
    closeDeleteRoomMemberDialog() {
      const deletedMember = this.roomMemberDialogs.pendingDeletedMember;
      Object.assign(this.roomMemberDialogs, {
        listVisible: true,
        deleteVisible: false,
        deleteValue: null,
        pendingDeletedMember: null,
      });
      if (deletedMember) {
        this.$refs.roomMemberDialogRef?.applyDeletedMember(deletedMember);
      }
    },

    showInviteFloorMemberDialog() {
      this.inviteFloorMemberDialogVisible = true;
    },
    closeInviteFloorMember() {
      this.inviteFloorMemberDialogVisible = false;
    },

    showFloorMemberDialog() {
      this.floorMemberDialogVisible = true;
    },
    closeFloorMember() {
      this.floorMemberDialogVisible = false;
    },

    showDeleteFloorMemberDialog(val) {
      this.pendingDeletedFloorMember = null;
      this.floorMemberDialogVisible = true;
      this.deleteFloorMemberDialogVisible = true;
      this.deleteFloorMemberValue = val;
    },
    successDeleteFloorMember(floorMember) {
      this.pendingDeletedFloorMember = floorMember;
      this.deleteFloorMemberDialogVisible = false;
    },
    closeDeleteFloorMember() {
      const deletedMember = this.pendingDeletedFloorMember;
      this.floorMemberDialogVisible = true;
      this.deleteFloorMemberDialogVisible = false;
      this.deleteFloorMemberValue = null;
      this.pendingDeletedFloorMember = null;
      if (deletedMember) {
        this.$refs.floorMemberDialogRef?.applyDeletedMember(deletedMember);
      }
    },

    showLeaveFloorMemberDialog() {
      this.leaveFloorMemberDialogVisible = true;
    },
    successLeaveFloorMember() {
      this.$router.push({ name: 'Floor' });
      this.leaveFloorMemberDialogVisible = false;
    },
    closeLeaveFloorMember() {
      this.leaveFloorMemberDialogVisible = false;
    },

    showFloorTagDialog() {
      tagDialogCoordinator.toggleFloorList(this.tagDialogs, (closeList) => {
        this.$nextTick(() => closeList());
      });
    },
    closeFloorTagDialog() {
      tagDialogCoordinator.closeFloorList(this.tagDialogs);
    },

    showRoomTagDialog(roomId) {
      tagDialogCoordinator.openRoomList(this.tagDialogs, roomId);
    },
    closeRoomTagDialog() {
      tagDialogCoordinator.closeRoomList(this.tagDialogs);
    },

    showFloorAIAnalysisSettingDialog() {
      if (!this.isAdmin && !this.isFloorEditor) return;
      this.floorAIAnalysisSettingDialogVisible = true;
    },
    closeFloorAIAnalysisSettingDialog() {
      this.floorAIAnalysisSettingDialogVisible = false;
    },
    showRoomAIAnalysisSettingDialog(roomId) {
      if ((!this.isAdmin && !this.isFloorEditor) || !roomId) return;
      const targetRoom = this.rooms.find((room) => room._id === roomId);
      this.aiAnalysisSettingRoomId = roomId;
      this.aiAnalysisSettingRoomTargetName = targetRoom ? this.getRoomTitle(targetRoom) : '';
      this.roomAIAnalysisSettingDialogVisible = true;
    },
    closeRoomAIAnalysisSettingDialog() {
      this.roomAIAnalysisSettingDialogVisible = false;
      this.aiAnalysisSettingRoomId = null;
      this.aiAnalysisSettingRoomTargetName = '';
    },

    showUpdateRoomDisplayConfirm(roomDisplayHidden) {
      this.updateRoomDisplayVisible = true;
      this.roomDisplayHidden = roomDisplayHidden;
    },
    async updateRoomDisplay(roomDisplayHidden) {
      if (this.sending) return;
      this.sending = true;

      const data = {
        floor_id: this.floorId,
        room_display_hidden: roomDisplayHidden,
      };
      try {
        await roomApi.updateDisplayHidden(data);
        if (roomDisplayHidden) {
          this.setSnackbar(this.$t('全ルームを非表示に変更しました'), 'status');
        } else {
          this.setSnackbar(this.$t('全ルームを表示に変更しました'), 'status');
        }
        this.sending = false;
        await this.fetchRoomList();
        this.updateRoomDisplayVisible = false;
      } catch (e) {
        if (roomDisplayHidden) {
          const message = appendApiErrorMessage(this.$t('全ルームの非表示変更に失敗しました'), e, {
            translate: this.$t,
          });
          this.setSnackbar(message, 'alert');
        } else {
          const message = appendApiErrorMessage(this.$t('全ルームの表示変更に失敗しました'), e, {
            translate: this.$t,
          });
          this.setSnackbar(message, 'alert');
        }
        return handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
      } finally {
        this.sending = false;
      }
    },
    closeUpdateRoomDisplayConfirm() {
      this.updateRoomDisplayVisible = false;
      this.roomDisplayHidden = null;
    },

    showKickedUserDialog() {
      this.kickedUserDialogVisible = true;
    },
    closeKickedUserDialog() {
      this.kickedUserDialogVisible = false;
    },
    showDeleteKickedUserDialog(kickedUser) {
      this.pendingReleasedKickedUser = null;
      this.kickedUserDialogVisible = true;
      this.deleteKickedUserValue = kickedUser;
      this.deleteKickedUserDialogVisible = true;
    },
    successDeleteKickedUser(kickedUser) {
      this.pendingReleasedKickedUser = kickedUser;
      this.deleteKickedUserDialogVisible = false;
    },
    closeDeleteKickedUserDialog() {
      const releasedUser = this.pendingReleasedKickedUser;
      this.deleteKickedUserDialogVisible = false;
      this.deleteKickedUserValue = null;
      this.pendingReleasedKickedUser = null;
      this.kickedUserDialogVisible = true;
      if (releasedUser) {
        this.$refs.kickedUserDialogRef?.applyReleasedUser(releasedUser);
      }
    },

    showFloorQuickTextDialog() {
      if ((!this.isAdmin && !this.isFloorEditor) || !this.floorId) return;
      this.floorQuickTextDialogVisible = true;
    },
    closeFloorQuickTextDialog() {
      this.floorQuickTextDialogVisible = false;
    },
    showRoomQuickTextDialog(room) {
      if (!this.canManageRooms || !room?._id) return;
      this.roomQuickTextDialogTarget = room;
      this.roomQuickTextDialogVisible = true;
    },
    closeRoomQuickTextDialog() {
      this.roomQuickTextDialogVisible = false;
      this.roomQuickTextDialogTarget = null;
    },

    setSnackbar(message, role = 'status') {
      this.$store.dispatch('doShowSnackbar', { message, role });
    },
  },
};
</script>

<style scoped>
.user-icon {
  margin-inline-end: 8px;
}

.room-decoration {
  word-break: break-all;
  text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, -1px 1px 0 #fff, 1px -1px 0 #fff, 0px 1px 0 #fff, 0-1px 0 #fff,
    -1px 0 0 #fff, 1px 0 0 #fff;
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
  min-height: 80px;
  position: relative;
  padding: 0px;
}

.view-action .ui-button {
  margin-inline-start: 0;
}

.room-list {
  width: 100%;
  padding: 0px;
  list-style-type: none;
}

.room-list li {
  border: solid 1px #cccccc;
  border-radius: 2px;
  margin-bottom: 8px;
  padding: 8px;
}
.room-list li:last-child {
  margin-bottom: 0px;
}
.room-list li:hover {
  background: #eeeeee;
}
.room-list li a {
  text-decoration: none;
  color: #000000;
}
.room-list li a:hover {
  color: #000000;
}

.room-wrapper {
  display: flex;
}
.room-handle-tooltip {
  align-self: flex-start;
}
.room-link {
  flex: 1;
  min-width: 0;
}
.room-title {
  overflow: hidden;
  word-break: break-all;
  font-size: 18px !important;
  line-height: 20px;
  font-weight: normal !important;
  margin: 0px 0px 8px 0px !important;
  word-break: break-all;
  width: 100%;
}
.room-description {
  font-size: 14px;
  font-weight: normal;
  color: #000000;
  word-break: break-all;
  width: 100%;
}
.room-info {
  position: relative;
  width: 100%;
  display: flex;
}
.room-image {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
  margin-inline-end: 8px;
}
.room-handle {
  margin-inline-end: 8px;
  cursor: grab;
}

.member-only,
.guest-reaction-only,
.external-sns-button {
  color: black;
  background-color: rgba(0, 0, 0, 0.12);
}
.hide-room-display {
  color: white;
  background-color: #db0000;
}
.room-status-chip {
  height: 32px;
  padding: 0 12px;
  margin-bottom: 8px;
  margin-inline-end: 8px;
  display: inline-block;
  cursor: default;
  border-radius: 32px;
  line-height: 32px;
  font-size: 16px;
  font-weight: bold;
  vertical-align: middle;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .room-status-chip {
    height: auto;
    line-height: 20px;
    white-space: normal;
    max-width: 100%;
    word-break: break-word;
  }
}

.room-detail {
  flex: 1;
  min-width: 0;
}
.room-created-info {
  width: 100%;
  display: flex;
  align-items: top;
  justify-content: flex-end;
  margin-top: 8px;
}
.room-creator,
.room-created-date,
.last-post-date {
  display: flex;
}
.room-creator-label {
  margin-inline-end: 1em;
}

.room-action {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

@media screen and (max-width: 896px) {
  .room-action {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 8px;
  }

  .room-action .ui-button {
    min-height: 44px;
    margin: 0;
  }

  .room-title,
  .room-description {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
  }
  .room-creator,
  .room-created-date,
  .last-post-date {
    display: block;
    margin-bottom: 4px;
  }
}
</style>
