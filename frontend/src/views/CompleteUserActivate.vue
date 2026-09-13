<template>
  <div class="view">
    <div class="view-header">
      <h1 class="view-title">
        {{ $t('ユーザアクティベーション結果') }}
      </h1>
    </div>

    <div class="view-content" :aria-busy="sending ? 'true' : 'false'">
      <p v-if="sending" role="status">
        {{ $t('読み込み中です') }}
      </p>
    </div>

    <confirm-dialog
      :dialog-visible="confirmDialogVisible"
      :title="$t('ユーザアクティベーション結果')"
      :confirm-label="confirmLabel"
      :cancel-label="null"
      confirm-tone="primary"
      :confirm-icon="confirmIcon"
      confirm-test-id="activation-result-next"
      initial-focus="[data-testid='activation-result-next']"
      actions-adjacent
      :sending="sending"
      @confirm="onConfirmFromDialog"
      @close="onConfirmDialogClose"
    >
      <template #default>
        <p>{{ message }}</p>
        <p v-if="!isError && floorId && floorTitle && roomId && roomTitle">
          <router-link class="text-link" :to="{ name: 'TimeLine', params: { floor_id: floorId, room_id: roomId } }">
            {{ floorTitle + ' / ' + roomTitle + ' ' + $t('ルームへ入室する') }}
          </router-link>
        </p>
      </template>
    </confirm-dialog>
  </div>
</template>

<script>
import authApi from '@/api/auth';
import { appendApiErrorMessage } from '@/api/apiClient';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';

export default {
  name: 'CompleteUserActivate',
  components: { ConfirmDialog },
  data() {
    return {
      message: null,
      floorId: null,
      floorTitle: null,
      roomId: null,
      roomTitle: null,
      confirmDialogVisible: false,
      sending: false,
      isError: false,
    };
  },
  computed: {
    confirmLabel() {
      return this.isError ? this.$t('トップページへ') : this.$t('ログインページへ');
    },
    confirmIcon() {
      return this.isError ? 'home' : 'login';
    },
  },
  created() {
    this.initCompleteUserInvite();
  },
  methods: {
    onConfirmDialogClose() {
      this.confirmDialogVisible = false;
    },
    onConfirmFromDialog() {
      if (this.isError) {
        this.navigateToTop();
      } else {
        this.navigateToLogin();
      }
    },

    navigateToLogin() {
      if (this.floorId && this.roomId) {
        this.$router.push({ name: 'Login', query: { floor_id: this.floorId, room_id: this.roomId } });
      } else {
        this.$router.push({ name: 'Login' });
      }
    },
    navigateToTop() {
      this.$router.push({ name: 'Floor' }).catch(() => this.$router.push({ path: '/floor' }));
    },

    initCompleteUserInvite() {
      if (this.sending) return Promise.resolve();
      const inviteToken = this.$route.params.invite_token;
      if (typeof inviteToken !== 'string') {
        this.isError = true;
        this.message = this.$t('入力内容が正しくありません。');
        this.confirmDialogVisible = true;
        return;
      }

      const roomId = typeof this.$route.query.room_id === 'string' ? this.$route.query.room_id.trim() : '';

      const data = roomId ? { invite_token: inviteToken, room_id: roomId } : { invite_token: inviteToken };
      this.confirmDialogVisible = false;
      this.message = null;
      this.floorId = null;
      this.floorTitle = null;
      this.roomId = null;
      this.roomTitle = null;
      this.isError = false;
      this.sending = true;
      return authApi
        .activate(data)
        .then((res) => {
          if (res && res.data) {
            this.floorId = res.data.floorId || null;
            this.floorTitle = res.data.floorTitle || null;
            this.roomId = res.data.roomId || null;
            this.roomTitle = res.data.roomTitle || null;
          }
          this.isError = false;
          this.message = this.$t('アカウントを有効化しました。ログインページからログインしてください。');
          this.sending = false;
          this.confirmDialogVisible = true;
        })
        .catch((err) => {
          const add = appendApiErrorMessage('', err, { translate: this.$t, wrapper: 'space' });
          this.isError = true;
          this.message = this.$t('アカウントのアクティベーションに失敗しました') + add;
          this.sending = false;
          this.confirmDialogVisible = true;
        });
    },
  },
};
</script>
