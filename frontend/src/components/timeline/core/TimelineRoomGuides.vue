<template>
  <aside v-if="groups.length" class="room-guides" :aria-label="$t('roomGuides.title')" data-testid="timeline-room-guides">
    <span class="room-guides__title">{{ $t('roomGuides.title') }}</span>
    <UiButton v-for="group in groups" :key="group.lang" appearance="filled" tone="neutral"
      :lang="group.lang" :data-testid="'room-guide-' + group.lang" @click="openGuide(group)">
      {{ group.label }}
    </UiButton>
    <UiDialog :open="Boolean(activeGroup)" title-id="room-guide-title" class="ui-dialog--standard room-guide-dialog"
      data-testid="dialog-room-guide" initial-focus="[data-testid='room-guide-close']" @request-close="closeGuide">
      <template #title>
        <h2 id="room-guide-title" class="ui-dialog__heading" :lang="activeGroup?.lang">{{ activeGroup?.label }}</h2>
        <UiButton appearance="filled" tone="neutral" data-testid="room-guide-close" @click="closeGuide">
          {{ $t('閉じる') }}
        </UiButton>
      </template>
      <div :aria-busy="loading" :lang="activeGroup?.lang">
        <p v-if="loading" role="status">{{ $t('読み込み中です') }}</p>
        <div v-else-if="failed" role="alert">
          <p>{{ $t('roomGuides.unavailable') }}</p>
          <UiButton appearance="filled" tone="neutral" @click="loadGuide">{{ $t('再試行') }}</UiButton>
        </div>
        <template v-else>
          <p class="room-guide-language-note">{{ $t('roomGuides.languageNote', {}, { locale: activeGroup?.lang }) }}</p>
          <section v-for="post in posts" :key="post._id" class="room-guide-part" dir="auto">
            <h3>{{ firstLine(post.content) }}</h3>
            <p>{{ remainingLines(post.content) }}</p>
          </section>
        </template>
      </div>
    </UiDialog>
  </aside>
</template>

<script>
import chatApi from '@/api/chat';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';

const configuredGuides = JSON.parse(import.meta.env.VITE_ROOM_GUIDES || '{}');

export default {
  name: 'TimelineRoomGuides',
  components: { UiButton, UiDialog },
  props: {
    roomId: { type: String, default: '' },
    isGuest: { type: Boolean, default: true },
    guideConfig: { type: Object, default: () => configuredGuides },
  },
  data: () => ({ activeGroup: null, posts: [], loading: false, failed: false, requestGeneration: 0 }),
  computed: {
    groups() { return this.guideConfig[this.roomId] || []; },
  },
  watch: {
    roomId() { this.closeGuide(); },
    isGuest() { this.closeGuide(); },
  },
  beforeUnmount() { this.closeGuide(); },
  methods: {
    firstLine(content) { return content.split('\n')[0]; },
    remainingLines(content) { return content.split('\n').slice(1).join('\n'); },
    openGuide(group) {
      this.activeGroup = group;
      return this.loadGuide();
    },
    closeGuide() {
      this.requestGeneration += 1;
      this.activeGroup = null;
      this.posts = [];
      this.loading = false;
      this.failed = false;
    },
    async loadGuide() {
      const group = this.activeGroup;
      if (!group) return;
      const generation = ++this.requestGeneration;
      const roomId = this.roomId;
      this.posts = [];
      this.failed = false;
      this.loading = true;
      try {
        const posts = await Promise.all(group.postIds.map(async (postId) => {
          const { data } = await chatApi.fetchDetail({ room_id: roomId, post_id: postId, isGuest: this.isGuest });
          const returnedRoom = typeof data?.room === 'object' ? data.room?._id : data?.room;
          if (data?._id !== postId || returnedRoom !== roomId || data?.lang !== group.lang ||
              data?.delete_flg === true || typeof data?.content !== 'string' || !data.content.trim()) {
            throw new Error('Guide unavailable');
          }
          return { _id: data._id, content: data.content };
        }));
        if (generation === this.requestGeneration) this.posts = posts;
      } catch {
        if (generation === this.requestGeneration) this.failed = true;
      } finally {
        if (generation === this.requestGeneration) this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.room-guides {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 6px 10px;
  background: #eaf4ff;
  color: #163a5f;
  border-bottom: 1px solid #94b8dd;
}
.room-guides__title { font-size: 14px; font-weight: 700; }
.room-guide-part h3 { margin: 16px 0 8px; font-size: 1.05em; }
.room-guide-part p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
.room-guide-part + .room-guide-part { border-top: 1px solid #bbb; margin-top: 20px; }
.room-guide-language-note { font-size: 0.9em; }
</style>
