<template>
  <div class="room-header">
    <UiTooltip :text="$t('ルーム一覧へ戻る')">
      <UiButton appearance="filled" tone="neutral" :aria-label="$t('ルーム一覧へ戻る')" @click="returnToRoomList()">
        <UiIcon name="chevron_left" />
      </UiButton>
    </UiTooltip>

    <div v-if="roomImageUrl !== null">
      <div class="room-image" :style="{ backgroundImage: `url(${roomImageUrl})` }"></div>
    </div>

    <TimelineParticipantCount :participantCount="roomStatus ? roomStatus.roomSize : null" />

    <h1 id="timeline-room-title">
      {{ roomTitle }}
    </h1>

    <UiTooltip :text="$t('ルーム情報')">
      <UiButton
        class="room-info-button"
        appearance="text"
        tone="primary"
        density="dense"
        iconOnly
        :aria-label="$t('ルーム情報')"
        data-testid="timeline-room-info-button"
        @click="$emit('showRoomInfoDialog', $event)"
      >
        <UiIcon name="info" />
      </UiButton>
    </UiTooltip>

    <div class="room-header-button-wrapper">
      <UiTooltip v-if="isMemberOnly && isRoomMember" :text="$t('ルームメンバー脱退')">
        <UiButton
          appearance="filled"
          tone="success"
          iconOnly
          :aria-label="$t('ルームメンバー脱退')"
          data-testid="timeline-leave-room-button"
          @click="$emit('showLeaveRoomMemberDialog', $event)"
        >
          <UiIcon name="group_off" />
        </UiButton>
      </UiTooltip>

      <UiTooltip ref="soundTagButtonTooltip" :text="$t('音を鳴らすタグを選択する')">
        <UiButton
          appearance="filled"
          tone="primary"
          iconOnly
          :aria-label="$t('音を鳴らすタグを選択する')"
          data-testid="timeline-sound-tag-button"
          @click="$emit('showSoundTagDialog', $event)"
        >
          <UiIcon name="notifications" />
        </UiButton>
      </UiTooltip>

      <UiTooltip :text="$t('投稿の絞り込みを行う')">
        <UiButton
          appearance="filled"
          tone="primary"
          iconOnly
          :aria-label="$t('投稿の絞り込みを行う')"
          data-testid="timeline-filter-button"
          @click="$emit('showFilterDialog', null, null, $event)"
        >
          <UiIcon name="filter_alt" />
        </UiButton>
      </UiTooltip>

      <UiTooltip :text="$t('タイムライン設定')">
        <UiButton
          appearance="filled"
          tone="primary"
          iconOnly
          :aria-label="$t('タイムライン設定')"
          data-testid="timeline-setting-button"
          @click="$emit('showTimelineSettingDialog', $event)"
        >
          <UiIcon name="settings" />
        </UiButton>
      </UiTooltip>
    </div>
  </div>
</template>

<script>
import TimelineParticipantCount from '@/components/timeline/core/TimelineParticipantCount.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  emits: [
    'showFilterDialog',
    'showLeaveRoomMemberDialog',
    'showRoomInfoDialog',
    'showSoundTagDialog',
    'showTimelineSettingDialog',
  ],
  name: 'TimelineHeader',
  components: {
    TimelineParticipantCount,
    UiButton,
    UiIcon,
    UiTooltip,
  },
  props: {
    roomTitle: {
      type: String,
      default: '',
    },
    roomImageUrl: {
      type: String,
      default: null,
    },
    roomStatus: {
      type: Object,
      default: () => ({}),
    },
    isMemberOnly: {
      type: Boolean,
      default: false,
    },
    isRoomMember: {
      type: Boolean,
      default: false,
    },
  },
  methods: {
    returnToRoomList() {
      const floorId = this.$route.params.floor_id;
      return this.$router.push(
        floorId ? { name: 'Room', params: { floor_id: floorId } } : { name: 'Floor' }
      );
    },
    focusSoundTagButton() {
      this.$refs.soundTagButtonTooltip?.focusTrigger({ showTooltip: false });
    },
  },
};
</script>

<style scoped>
.room-header {
  display: flex;
  flex-wrap: nowrap;
  width: 100%;
  align-items: center;
  justify-content: flex-start;
  border-bottom: solid 1px #e6e6e6;
}

.room-image {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
}
@media screen and (max-width: 481px) {
  .room-image {
    width: 32px;
    height: 32px;
  }
}

.room-header-button-wrapper {
  display: flex;
  flex-wrap: nowrap;
  margin-inline-start: auto;
}

.icon-color-white {
  color: white !important;
}

#timeline-room-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: normal;
  font-size: 1.1em;
}
@media screen and (max-width: 896px) {
  #timeline-room-title {
    max-width: 50%;
  }
}

@media screen and (max-width: 481px) {
  .room-header .ui-button {
    padding: 0px !important;
    margin: 8px 4px !important;
    height: 32px !important;
    width: 32px !important;
  }
}

.room-info-button {
  margin: 0px;
  padding: 0px;
}
</style>
