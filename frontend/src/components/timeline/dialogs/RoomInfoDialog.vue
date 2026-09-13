<template>
  <UiDialog
    ref="dialogRootRef"
    class="room-info-dialog ui-dialog--standard"
    :open="visible"
    title-id="room_info_dialog_title"
    data-testid="dialog-room-info"
    initial-focus="[data-testid='dialog-room-info-close-mobile']"
    @request-close="onPressDoneButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('閉じる')"
        data-testid="dialog-room-info-close-mobile"
        @click.stop="onPressDoneButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="room_info_dialog_title" class="ui-dialog__heading">
        {{ $t('ルーム情報') }}
      </h2>
      <span class="ui-dialog__header-end mobile-item" aria-hidden="true"></span>
    </template>

    <dl class="room-info-details">
      <div class="room-info-floor">
        <dt>{{ $t('フロアタイトル') }}</dt>
        <dd dir="auto">{{ $store.getters.floorTitle }}</dd>
      </div>
      <div>
        <dt>{{ $t('ルームタイトル') }}</dt>
        <dd class="room-info-title" dir="auto">{{ roomTitle }}</dd>
      </div>
      <div v-if="roomDescription" class="room-info-description">
        <dt>{{ $t('ルーム説明') }}</dt>
        <dd dir="auto">{{ roomDescription }}</dd>
      </div>
      <div>
        <dt>{{ $t('ルーム作成者') }}</dt>
        <dd dir="auto">{{ roomCreator }}</dd>
      </div>
      <div>
        <dt>{{ $t('ルーム作成日') }}</dt>
        <dd>{{ roomCreatedAt ? getLocalDateTime(roomCreatedAt) : '' }}</dd>
      </div>
    </dl>

    <template #actions>
      <div class="timeline-dialog-actions">
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-room-info-close"
          @click.stop="onPressDoneButton"
        >
          {{ $t('閉じる') }}
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<script>
import DateUtil from '@/utils/dateUtil.js';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  emits: ['close'],
  name: 'RoomInfoDialog',
  components: {
    UiButton,
    UiDialog,
    UiIcon,
  },
  props: {
    dialogVisible: Boolean,
    roomTitle: String,
    roomDescription: {
      type: String,
      default: '',
    },
    roomCreator: String,
    roomCreatedAt: String,
  },
  data() {
    return {
      visible: false,
    };
  },
  watch: {
    dialogVisible: {
      immediate: true,
      handler(next) {
        this.visible = next;
      },
    },
  },
  methods: {
    getLocalDateTime(date) {
      const locale = this.$i18n.locale;
      return DateUtil.getLocalDate(date, locale, 'dateTime');
    },

    onPressDoneButton() {
      this.visible = false;
    },

    closedDialog(payload) {
      this.$emit('close', payload);
    },
  },
};
</script>

<style scoped>
@media screen and (max-width: 896px) {
  :global(.room-info-dialog) {
    --ui-dialog-width: 560px;
  }
}

.room-info-details {
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.room-info-details > div {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  gap: 8px 24px;
  padding: 16px 0;
}
.room-info-details > div + div {
  border-top: 1px solid #ddd;
}
.room-info-details dt {
  font-size: 14px;
  font-weight: 600;
  color: #555;
}
.room-info-title {
  font-weight: 600;
}
.room-info-description dd {
  white-space: pre-wrap;
}
.room-info-details dd {
  margin: 0;
  min-width: 0;
  font-size: 16px;
}
@media (max-width: 480px) {
  .room-info-details > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}

.timeline-dialog-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
}
</style>
