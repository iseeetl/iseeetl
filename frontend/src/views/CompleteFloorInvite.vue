<template>
  <div class="view">
    <div class="view-header">
      <!-- 招待URLから直接開く画面のため、戻るボタンは設けない。 -->
      <h1 class="view-title">
        {{ $t('フロアメンバー参加完了') }}
      </h1>
    </div>

    <div class="view-content" :aria-busy="sending ? 'true' : 'false'">
      <p v-if="sending" role="status">
        {{ $t('読み込み中です') }}
      </p>
      <template v-else-if="isError">
        <p class="error-color" role="alert">
          {{ message }}
        </p>
        <router-link :to="{ path: '/' }" class="text-link">
          {{ $t('フロア一覧へ移動する') }}
        </router-link>
      </template>
      <template v-else-if="floor_id && message">
        <p>
          {{ message }}
        </p>
        <router-link :to="{ path: `/floor/${this.floor_id}` }" class="text-link">
          {{ $t('フロアへ移動する') }}
        </router-link>
      </template>
    </div>
  </div>
</template>

<script>
import floorMemberApi from '@/api/floorMember';
import { appendApiErrorMessage } from '@/api/apiClient';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';

export default {
  name: 'CompleteFloorInvite',
  data() {
    return {
      floor_id: null,
      title: null,
      message: null,
      isError: false,
      sending: false,
    };
  },
  created() {
    const floorId = this.$route.params.floor_id;
    const inviteToken = this.$route.params.invite_token;
    if (typeof floorId === 'string' && typeof inviteToken === 'string') {
      void this.joinFloorByInvite(floorId, inviteToken);
    } else {
      this.isError = true;
      this.message = this.$t('フロアメンバーへの参加に失敗しました');
    }
  },
  methods: {
    joinFloorByInvite(floorId, inviteToken) {
      if (this.sending) return Promise.resolve();
      this.isError = false;
      this.floor_id = null;
      this.title = null;
      this.message = null;
      this.sending = true;
      const payload = {
        floor_id: floorId,
        invite_token: inviteToken,
      };
      return floorMemberApi
        .createByInvite(payload)
        .then((res) => {
          this.sending = false;

          this.isError = false;
          this.floor_id = res.data.floor._id;
          this.title = res.data.floor.title;
          this.message = `${this.title} ${this.$t('フロアに参加しました。')} `;
          this.message += this.$t('参加したフロアでは、ルームの作成、更新、削除ができます。');
        })
        .catch((err) => {
          this.sending = false;

          this.isError = true;
          this.message = this.$t('フロアメンバーへの参加に失敗しました');
          this.message = appendApiErrorMessage(this.message, err, { translate: this.$t });

          handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
        });
    },
  },
};
</script>
