<template>
  <BaseEditDialog
    :visible="visible"
    title-id="guest_rules_dialog_title"
    :title-text="$t('ゲストでの利用ルール')"
    description-ids="guest_rules_dialog_description"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t('同意する')"
    :actions-adjacent="true"
    cancel-test-id="dialog-guest-rules-cancel-desktop"
    mobile-cancel-test-id="dialog-guest-rules-cancel-mobile"
    confirm-test-id="dialog-guest-rules-confirm"
    data-testid="dialog-guest-rules"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @closed="closedDialog"
  >
    <div class="edit-input-field">
      <i18n-t
        keypath="ゲストとして投稿、返信またはリアクションを行うことで、{terms}、{privacy}及び{cookie}に同意したものとみなされます。"
        tag="p"
        scope="global"
        id="guest_rules_dialog_description"
      >
        <template #terms>
          <router-link
            class="text-link"
            data-testid="guest-rules-terms-link"
            :to="{ name: 'Terms', query: roomContextQuery }"
          >
            {{ $t('利用許諾・著作権・禁止事項・免責事項') }}
          </router-link>
        </template>
        <template #privacy>
          <router-link
            class="text-link"
            data-testid="guest-rules-privacy-link"
            :to="{ name: 'Privacy', query: roomContextQuery }"
          >
            {{ $t('プライバシーポリシー') }}
          </router-link>
        </template>
        <template #cookie>
          <router-link
            class="text-link"
            data-testid="guest-rules-cookie-policy-link"
            :to="{ name: 'CookiePolicy', query: roomContextQuery }"
          >
            {{ $t('Cookieポリシー') }}
          </router-link>
        </template>
      </i18n-t>
    </div>

    <div class="edit-input-field">
      <p>{{ $t('画像データ、動画データ、音データ、字幕データのアップロードにはログインが必要です') }}</p>
      <p>
        <router-link class="text-link" :to="{ name: 'Login', query: roomContextQuery }">
          {{ $t('ログインページへ') }}
        </router-link>
      </p>
    </div>

  </BaseEditDialog>
</template>

<script>
import { buildRoomContextQuery } from '@/utils/routeRoomContext';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';

export default {
  emits: ['close', 'success'],
  name: 'GuestRulesDialog',
  components: {
    BaseEditDialog,
  },
  props: {
    dialogVisible: Boolean,
  },
  data() {
    return {
      visible: this.dialogVisible,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  computed: {
    roomContextQuery() {
      return buildRoomContextQuery(this.$route, { source: 'params' });
    },
  },
  methods: {
    onPressCancelButton() {
      this.visible = false;
    },

    onPressDoneButton() {
      this.$emit('success');
    },

    closedDialog(payload) {
      this.$emit('close', payload);
    },
  },
};
</script>
