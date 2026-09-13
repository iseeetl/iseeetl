<template>
  <div class="view">
    <div class="view-header">
      <!-- 招待URLから直接開く画面のため、戻るボタンは設けない。 -->
      <h1 class="view-title">
        {{ $t('ルームメンバー参加完了') }}
      </h1>
    </div>

    <div class="view-content" :aria-busy="sending ? 'true' : 'false'">
      <p v-if="sending" role="status">
        {{ $t('読み込み中です') }}
      </p>

      <div v-else-if="isError">
        <p class="error-color" role="alert">
          {{ message }}
        </p>
        <router-link :to="{ path: '/' }" class="text-link">
          {{ $t('フロア一覧へ移動する') }}
        </router-link>
      </div>

      <div v-else-if="floorId && roomId && roomTitle && message">
        <p>
          {{ message }}
        </p>
        <router-link :to="{ path: `/floor/${this.floorId}/room/${this.roomId}` }" class="text-link">
          {{ $t('ルームへ移動する') }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import roomMemberApi from '@/api/roomMember';
import { appendApiErrorMessage } from '@/api/apiClient';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';

export default {
  name: 'CompleteRoomInvite',
  data() {
    return {
      floorId: null,
      roomId: null,
      roomTitle: null,
      inviteToken: null,
      message: null,
      isError: false,
      sending: false,
    };
  },
  created() {
    this.floorId = this.$route.params.floor_id;
    this.roomId = this.$route.params.room_id;
    this.inviteToken = this.$route.params.invite_token;
    if (typeof this.floorId === 'string' && typeof this.roomId === 'string' && typeof this.inviteToken === 'string') {
      void this.joinRoomByInvite();
    } else {
      this.isError = true;
      this.message = this.$t('ルームメンバーの参加に失敗しました');
    }
  },
  methods: {
    joinRoomByInvite() {
      if (this.sending) return Promise.resolve();
      this.isError = false;
      this.roomTitle = null;
      this.message = null;
      this.sending = true;
      const payload = {
        room_id: this.roomId,
        invite_token: this.inviteToken,
      };
      return roomMemberApi
        .createByInvite(payload)
        .then((res) => {
          this.sending = false;

          this.isError = false;
          this.roomTitle = res.data.room.title;
          this.message = this.roomTitle + ' ' + this.$t('ルームのメンバーに参加しました');
          this.message += this.$t('「メンバー限定」のルームに入室出来ます');
        })
        .catch((err) => {
          this.sending = false;

          this.isError = true;
          this.message = this.$t('ルームメンバーの参加に失敗しました');
          this.message = appendApiErrorMessage(this.message, err, { translate: this.$t });

          handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
        });
    },
  },
};
</script>
