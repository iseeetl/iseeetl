<template>
  <UiDialog :open="open" title-id="post-confirmation-title" initial-focus="#post-confirmation-title"
    class="ui-dialog--standard post-confirmation" @request-close="$emit('close')">
    <template #title><h2 id="post-confirmation-title" tabindex="-1">{{ $t('postDefaults.viewPost') }}</h2></template>
    <p v-if="loading" role="status">{{ $t('postDefaults.loading') }}</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <div v-else-if="post" class="confirmed-content">
      <PostItem :post="post" :tags="tags" id-prefix="confirmation" :hide-info="false" />
      <ReplyItem v-for="reply in post.replies || []" :key="reply._id" :post="post" :reply="reply" :tags="tags" id-prefix="confirmation-reply" />
      <p class="confirmation-note">{{ $t('postDefaults.answerNote') }}</p>
    </div>
    <template #actions>
      <UiButton :disabled="loading" @click="fetchPost">{{ $t('postDefaults.refresh') }}</UiButton>
      <UiButton tone="primary" @click="$emit('close')">{{ $t('閉じる') }}</UiButton>
    </template>
  </UiDialog>
</template>
<script>
import chatApi from '@/api/chat';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiButton from '@/components/ui/UiButton.vue';
import PostItem from '@/components/timeline/items/PostItem.vue';
import ReplyItem from '@/components/timeline/items/ReplyItem.vue';
export default {
  components: { UiDialog, UiButton, PostItem, ReplyItem },
  provide: { timelineReadOnly: true },
  props: { open: Boolean, postId: String, roomId: String, tags: Array },
  emits: ['close'],
  data: () => ({ loading: false, post: null, error: '', request: 0 }),
  watch: {
    open(value) { if (value) this.fetchPost(); else this.request++; },
    postId() { if (this.open) this.fetchPost(); },
  },
  mounted() { if (this.open) this.fetchPost(); },
  beforeUnmount() { this.request++; },
  methods: {
    async fetchPost() {
      const request = ++this.request;
      this.loading = true; this.error = ''; this.post = null;
      try {
        const { data } = await chatApi.fetchDetail({ room_id: this.roomId, post_id: this.postId, isGuest: !this.$store.getters.userIsLogin });
        if (request !== this.request || !this.open) return;
        if (!data?._id) this.error = this.$t('postDefaults.unavailable');
        else this.post = data;
      } catch (error) {
        if (request !== this.request) return;
        this.error = this.$t([403,404].includes(error?.response?.status) ? 'postDefaults.unavailable' : 'postDefaults.loadFailed');
      } finally { if (request === this.request) this.loading = false; }
    },
  },
};
</script>
<style scoped>
.confirmed-content { background: #292929; color: white; padding: 12px; border-radius: 4px; overflow-wrap: anywhere; }
.confirmation-note { font-size: 14px; padding-top: 12px; }
</style>
