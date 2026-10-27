<template>
  <UiDialog ref="dialog" :open="opened" title-id="activity-title" class="ui-dialog--standard activity-panel" @request-close="close" @closed="navigateAfterClose" @opened="restoreActivityList">
    <template #title><h2 id="activity-title" class="ui-dialog__heading">{{ $t(settings ? 'activity.settings' : target ? 'activity.target' : 'activity.title') }}</h2></template>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">{{ $t('postDefaults.loading') }}</p>
    <template v-if="settings && draft">
      <p>{{ roomTitle }} · {{ $t('updateNotice.thisRoom') }}</p>
      <p>{{ $t('activity.deliveryHelp') }}</p>
      <fieldset :disabled="saving">
        <legend>{{ $t('activity.deliverySettings') }}</legend>
        <label><input type="checkbox" v-model="draft.timelineEnabled" />{{ $t('activity.timelineMaster') }}</label>
        <div v-for="category in categories" :key="category" class="category">
          <strong :id="'activity-category-'+category">{{ $t(`activity.${category}`) }}</strong>
          <p class="category-help" :id="'activity-help-'+category">{{ $t(`activity.${category}Help`) }}</p>
          <div class="delivery-choices" role="group" :aria-labelledby="'activity-category-'+category" :aria-describedby="'activity-help-'+category">
            <label v-for="channel in ['timeline','push','notify']" :key="channel">
              {{ $t(`activity.${channel}`) }}
              <select v-model="draft.scopes[category][channel]" :aria-label="$t(`activity.${category}`)+'：'+$t(`activity.${channel}`)"
                :disabled="channel === 'push' && !pushAvailable || channel === 'timeline' && !draft.timelineEnabled" @change="alignScopes(category, channel)">
                <option v-for="mode in ['off','matching','all']" :key="mode" :value="mode">{{ $t(`activity.scope_${mode}`) }}</option>
              </select>
            </label>
          </div>
        </div>
        <p>{{ $t('activity.pushHelp') }}</p>
        <p v-if="draft.preserveOwnNotifications !== false">{{ $t('activity.legacyPreserved') }}</p>
      </fieldset>
      <fieldset :disabled="saving">
        <legend>{{ $t('activity.broadTypes') }}</legend>
        <label v-for="key in ['reply','alternative','supplement','reaction']" :key="key"><input type="checkbox" v-model="draft.updateTypes[key]" />{{ $t(`activity.${key}`) }}</label>
      </fieldset>
      <p>{{ $t('activity.contextHelp') }}</p>
      <p>{{ $t('activity.visibilityHelp') }}</p>
    </template>
    <template v-else-if="target">
      <ActivityTarget v-if="target.available" :value="target" :tags="tags" @gallery="item => $emit('gallery', item)" @navigate="navigateSelectedTarget" />
      <p v-else>{{ $t('postDefaults.unavailable') }}</p>
    </template>
    <template v-else>
      <div class="activity-controls">
        <label><input type="radio" v-model="view" value="room" @change="refresh()" />{{ $t('activity.room') }}</label>
        <label><input type="radio" v-model="view" value="personal" @change="refresh()" />{{ $t('activity.personal') }}</label>
        <label><input type="checkbox" v-model="unread" @change="refresh()" />{{ $t('activity.unread') }}</label>
      </div>
      <div ref="list" class="activity-list">
        <article v-for="entry in entries" :key="entry.id" :class="{ unread: !entry.read }">
          <button type="button" :data-activity-id="entry.id" @click="openTarget(entry)">
            <span>{{ entryLabel(entry) }} · {{ entry.actorName || $t('activity.someone') }}</span>
            <time>{{ new Date(entry.occurredAt).toLocaleString($i18n.locale) }}</time>
            <span v-if="!entry.read">{{ $t('activity.unread') }}</span>
            <p>{{ !entry.available ? $t('postDefaults.unavailable') : entry.hidden ? $t('activity.hidden') : entry.preview }}</p>
            
          </button>
          <button type="button" class="preview-button" :aria-label="$t('activity.previewUpdate')" @click="openTarget(entry, true)">📺 {{ $t('activity.previewUpdate') }}</button>
        </article>
        <p v-if="!busy && !entries.length">{{ $t('activity.empty') }}</p>
      </div>
      <UiButton v-if="nextCursor" :disabled="busy" @click="refresh(true)">{{ $t('activity.more') }}</UiButton>
    </template>
    <template #actions>
      <UiButton v-if="settings" :disabled="saving" tone="primary" @click="saveSettings">{{ $t('managementUi.save') }}</UiButton>
      <UiButton v-if="target?.available" @click="replyToTarget">{{ $t('返信') }}</UiButton>
      <UiButton v-if="settings || target" @click="back">{{ $t('activity.back') }}</UiButton>
      <template v-else>
        <UiButton :disabled="busy || !entries.some(entry=>!entry.read)" @click="markDisplayed">{{ $t('activity.markShown') }}</UiButton>
        <UiButton @click="showSettings">{{ $t('activity.settings') }}</UiButton>
      </template>
      <UiButton @click="close">{{ $t('閉じる') }}</UiButton>
    </template>
  </UiDialog>
</template>
<script>
import api from '@/api/activity';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiButton from '@/components/ui/UiButton.vue';
import ActivityTarget from './ActivityTarget.vue';
import { toServerQuery } from '@/features/timeline/queryFilters';
import { cursorKey, readCursor, saveCursor, visibleEntry, timelineEnabled, scopesFor, alignScopes } from './activityState';
const categories = ['roomActivity', 'relatedActivity', 'subscribedThreads'];
const clone = value => JSON.parse(JSON.stringify(value));
export default {
  components: { UiDialog, UiButton, ActivityTarget }, props: { navigateToTarget: Function, roomId: String, roomTitle: String, tags: Array, filters: Array, currentTabIndex: { type: Number, default: 0 }, matchesPost: Function, globalQuery: Object }, emits: ['reply', 'gallery'],
  data: () => ({ enabled: false, opened: false, settings: false, busy: false, saving: false, error: '', entries: [], nextCursor: null,
    view: 'room', unread: false, resumeList: false, queuedTarget: null, targetRequest: 0, selectedEntry: null, target: null, returnId: null, listScroll: 0, preferences: null, version: 0, draft: null, pending: false, pendingView: 'room', visibilitySaving: false,
    subscribedIds: [], seenIds: new Set(), categories, generation: 0, request: 0, timer: null, polling: false }),
  computed: {
    identity() { return this.$store.getters.userId || this.$store.getters.guestId; },
    visibilityValue() { return this.visibility(); },
    contextValue() { return this.context(); },
    pushAvailable() { return !!this.$store.getters.userIsLogin && !!this.$store.getters.oneSignalPushAvailable; },
  },
  watch: { roomId: { immediate: true, handler() { this.initialize(); } }, identity() { this.initialize(); }, visibilityValue: { deep: true, handler() { this.syncVisibility(); } }, contextValue: { deep: true, handler() { this.syncVisibility(); } } },
  beforeUnmount() { this.generation++; clearInterval(this.timer); },
  methods: {
    entryLabel(entry) { const kind = entry.type === 'reaction' ? entry.media ? 'reactionAlternative' : entry.supplementId ? 'reactionSupplement' : entry.replyId ? 'reactionReply' : 'reaction' : entry.type; return this.$t(`activity.${kind}`); },
    async initialize() {
      const generation = ++this.generation; this.queuedTarget = null; this.targetRequest++; clearInterval(this.timer); this.enabled = false; this.opened = false; this.preferences = null; this.target = null; this.settings = false; this.busy = false; this.saving = false; this.request++; 
      this.pending = false; this.seenIds = new Set(); this.subscribedIds = []; this.entries = []; this.error = '';
      if (!this.roomId || !this.identity) return;
      try {
        const capability = await api.capability(); if (generation !== this.generation || !capability.data.enabled) return;
        const [prefs, subscriptions] = await Promise.all([api.preferences(this.roomId), api.subscriptions(this.roomId)]);
        if (generation !== this.generation) return;
        this.version = prefs.data.version; this.preferences = prefs.data.value;
        const old = this.$store.state.roomUpdatePreferences?.[this.roomId];

        this.subscribedIds = subscriptions.data.postIds; this.enabled = true;
        // Migrate only existing room notice choices; never enable push through migration.
        if (!this.version && old) {
          const value = { updateTypes: { reply: true, alternative: old.alternative !== false, supplement: old.supplement !== false, reaction: old.reaction !== false } };
          for (const key of ['roomActivity', 'relatedActivity']) value[key] = { notify: key === 'roomActivity' || old.scope === 'related',
            timeline: old.enabled !== false && (key === 'relatedActivity' ? old.scope === 'related' : old.scope !== 'related'), push: false };
          await this.persistPartial(value);
        }
        await this.syncVisibility();
        await this.poll(true); this.timer = setInterval(() => this.poll(), 10000);
        const eventId = this.$route.query.activity;
        if (typeof eventId === 'string' && /^[a-f0-9]{24}$/i.test(eventId)) { this.opened = true; await this.show(); await this.openTarget(this.entries.find(entry => entry.id === eventId) || { id: eventId }, true); }
      } catch { if (generation === this.generation) this.error = this.$t('activity.loadFailed'); }
    },
    async show(fromBanner = false) { if (fromBanner) this.view = this.pendingView; this.opened = true; this.target = null; this.settings = false; this.pending = false; await this.refresh(); },
    async refresh(more = false) {
      const request = ++this.request, generation = this.generation; this.busy = true; this.error = '';
      try {
        const { data } = await api.list(this.roomId, { view: this.view, unread: this.unread, globalQuery: toServerQuery(this.globalQuery), columns: (this.filters || []).map(filter => toServerQuery(filter.conditions)), ...(more && this.nextCursor ? { cursor: this.nextCursor } : {}) });
        if (request !== this.request || generation !== this.generation) return;
        this.entries = more ? [...this.entries, ...data.entries.filter(entry => !this.entries.some(old => old.id === entry.id))] : data.entries;
        this.nextCursor = data.nextCursor;
      } catch { if (generation === this.generation) this.error = this.$t('activity.loadFailed'); }
      finally { if (request === this.request) this.busy = false; }
    },
    async markDisplayed() { const ids = this.entries.filter(entry => !entry.read).map(entry => entry.id); for (let i=0;i<ids.length;i+=100) await this.markRead(ids.slice(i,i+100)); },
    async markRead(ids) {
      if (!ids.length) return;
      const generation = this.generation;
      try { const { data } = await api.markRead(this.roomId, ids); if (generation !== this.generation) return;
        const read = new Set(data.readIds); this.entries = this.entries.map(entry => read.has(entry.id) ? { ...entry, read: true } : entry);
      } catch { if (generation === this.generation) this.error = this.$t('activity.saveFailed'); }
    },
    async openTarget(entry, preview = false) {
      const generation = this.generation; const targetRequest = ++this.targetRequest; this.busy = true; this.error = ''; this.returnId = entry.id; this.listScroll = this.$refs.dialog?.$refs.panel?.querySelector('.ui-dialog__content')?.scrollTop || 0;
      try { const { data } = await api.target(this.roomId, entry.id); if (generation !== this.generation || targetRequest !== this.targetRequest) return;
        if (!data?.available || !data.post || !data.target) { this.error = this.$t('postDefaults.unavailable'); return; }
        this.selectedEntry = { ...entry, type: entry.type || (data.target.media ? 'alternative' : data.target.supplementId ? 'supplement' : data.target.replyId ? 'reply' : 'post') };
        if (preview || !this.navigateToTarget) { this.target = data; await this.markRead([entry.id]); }
        else { this.queuedTarget = { data, entry, generation, request: targetRequest }; this.opened = false; }
      } catch { if (generation === this.generation) this.error = this.$t('postDefaults.unavailable'); }
      finally { if (generation === this.generation) this.busy = false; }
    },
    reopenList() { this.settings = false; this.target = null; this.resumeList = true; this.opened = true; },
    restoreActivityList() { if (this.resumeList) { this.resumeList = false; this.back(); } },
    back() { this.settings = false; this.target = null; this.$nextTick(() => {
      const scroller = this.$refs.dialog?.$refs.panel?.querySelector('.ui-dialog__content'); if (scroller) scroller.scrollTop = this.listScroll;
      const focus = this.$refs.list?.querySelector(`[data-activity-id="${this.returnId}"]`) || this.$refs.dialog?.$refs.panel?.querySelector('.activity-controls input'); focus?.focus({ preventScroll: true });
    }); },
    async navigateSelectedTarget(target) {
      if (!this.navigateToTarget || !this.target?.available || this.busy) return;
      const generation = this.generation; const request = ++this.targetRequest; this.busy = true;
      try {
        const { data } = await api.target(this.roomId, this.selectedEntry.id);
        if (generation !== this.generation || request !== this.targetRequest) return;
        if (!data?.available || !data.post || !data.target) { this.error = this.$t('postDefaults.unavailable'); return; }
        const parent = !target.replyId && !target.supplementId && !target.media;
        this.queuedTarget = { data: { ...data, target: parent ? { postId: data.target.postId } : data.target },
          entry: parent ? { ...this.selectedEntry, type: 'post' } : this.selectedEntry, generation, request };
        this.opened = false;
      } catch { if (generation === this.generation) this.error = this.$t('activity.loadFailed'); }
      finally { if (generation === this.generation) this.busy = false; }
    },
    async navigateAfterClose() {
      const queued = this.queuedTarget; this.queuedTarget = null;
      if (!queued || queued.generation !== this.generation || queued.request !== this.targetRequest) return;
      const current = () => queued.generation === this.generation && queued.request === this.targetRequest;
      try {
        const shown = await this.navigateToTarget(queued.data, this.entryLabel(queued.entry || { type: 'post' }), current);
        if (!current()) return;
        if (shown) await this.markRead([queued.entry.id]);
        else { this.error = this.$t('postDefaults.unavailable'); this.opened = true; }
      } catch { if (current()) { this.error = this.$t('activity.loadFailed'); this.opened = true; } }
    },
    close() { this.queuedTarget = null; this.targetRequest++; this.opened = false; this.request++; },
    replyToTarget() { const value = this.target; this.close(); this.$emit('reply', value.post); },
    dismissBanner() { this.pending = false; },
    showSettings() { if (!this.preferences) return; this.error = '';  this.draft = clone(this.preferences); this.draft.scopes = scopesFor(this.preferences); this.settings = true; this.target = null; this.opened = true; this.$nextTick(() => { const panel = this.$refs.dialog?.$refs.panel; panel?.querySelector('fieldset input')?.focus(); }); },
    alignScopes(category, channel) { alignScopes(this.draft.scopes[category], channel); },
    disableDependent(key) { if (!this.draft[key].notify) { this.draft[key].push = false; this.draft[key].timeline = false; } },
    context() { const clean = value => { const query = toServerQuery(value); return query ? Object.fromEntries(Object.entries(query).filter(([,v]) => v != null)) : null; }; return { globalQuery: clean(this.globalQuery), columns: this.filters?.[this.currentTabIndex] ? [clean(this.filters[this.currentTabIndex].conditions)] : [] }; },
    visibility() { const pref = this.$store.getters.roomAIVisibility?.(this.roomId);
      return { alternative: this.$store.getters.displayAlternativeText !== false, supplement: this.$store.getters.displaySupplement !== false,
        ai: pref?.mode !== 'none', hiddenAITagIds: pref?.mode === 'tags' ? pref.hiddenTagIds : [] };
    },
    async persistPartial(value) {
      const generation = this.generation; const { data } = await api.savePreferences(this.roomId, { version: this.version, value });
      if (generation !== this.generation) return; this.version = data.version; this.preferences = data.value;
    },
    async syncVisibility() {
      if (!this.enabled || !this.preferences || this.saving || this.visibilitySaving) return;
      if (this.version && this.preferences.historyStart && JSON.stringify(this.preferences.visibility) === JSON.stringify(this.visibility()) && JSON.stringify(this.preferences.context) === JSON.stringify(this.context())) return;
      this.visibilitySaving = true; const generation = this.generation;
      const requested = { visibility: this.visibility(), context: this.context() }; let saved = false;
      try { await this.persistPartial(requested); saved = true; }
      catch { if (generation === this.generation) this.error = this.$t('activity.syncFailed'); }
      finally { this.visibilitySaving = false; }
      if (saved && generation === this.generation && JSON.stringify(requested) !== JSON.stringify({ visibility: this.visibility(), context: this.context() })) await this.syncVisibility();
    },
    async saveSettings() {
      this.saving = true; this.error = ''; const generation = this.generation;
      const value = { timelineEnabled: this.draft.timelineEnabled, updateTypes: this.draft.updateTypes, visibility: this.visibility(), context: this.context() };
      value.scopes = clone(this.draft.scopes);
      try { const { data } = await api.savePreferences(this.roomId, { version: this.version, value }); if (generation !== this.generation) return;
        this.version = data.version; this.preferences = data.value; this.settings = false; this.pending = false; await this.refresh(); this.$nextTick(() => this.$refs.dialog?.$refs.panel?.querySelector('.activity-controls input')?.focus());
      } catch (error) { if (generation === this.generation) { this.error = this.$t(error.response?.status === 409 ? 'activity.conflict' : 'activity.saveFailed'); if (error.response?.status === 409) { const { data } = await api.preferences(this.roomId); this.version = data.version; this.preferences = data.value; } } }
      finally { if (generation === this.generation) this.saving = false; }
    },
    async subscribe(postId, enabled) {
      const generation = this.generation;
      try { await api.subscribe(this.roomId, postId, enabled); if (generation !== this.generation) return;
        this.subscribedIds = enabled ? [...new Set([...this.subscribedIds, postId])] : this.subscribedIds.filter(id => id !== postId);
      } catch { if (generation === this.generation) { this.error = this.$t('activity.saveFailed'); this.opened = true; } }
    },
    exactTargetVisible(entry, latestPost) {
      const loaded = (this.filters || []).flatMap(filter => filter.posts || []).find(post => post._id === entry.postId && !post.origin_id);
      let item = entry.replyId ? loaded?.replies?.find(reply => reply._id === entry.replyId) : loaded;
      if (entry.supplementId) item = item?.supplementaries?.find(supp => supp._id === entry.supplementId);
      if (!item) return false;
      let latest = entry.replyId ? latestPost?.replies?.find(reply => reply._id === entry.replyId) : latestPost;
      if (entry.supplementId) latest = latest?.supplementaries?.find(supp => supp._id === entry.supplementId);
      const field = entry.media ? {image:'image_caption',video:'video_description',audio:'audio_description'}[entry.media] : 'content';
      if (latest && item[field] !== latest[field]) return false;
      if (entry.reactionId && !(item[entry.media ? 'alternative_reactions' : 'reactions'] || []).some(reaction => reaction._id === entry.reactionId)) return false;
      const roots = document.querySelectorAll(`.timeline-content [data-timeline-item-id="${entry.supplementId || entry.replyId || entry.postId}"]`);
      return [...roots].some(root => {
        const node = entry.media ? root.querySelector(`[data-alt-kind="${entry.media}"] .alt-copy`) : entry.type === 'reaction' ? root.querySelector('.reaction-container') : root;
        if (node?.querySelector('[aria-expanded="false"]') && ['alternative','supplement'].includes(entry.type)) return false;
        if (!node || !node.getClientRects().length || node.closest('[inert], [aria-hidden="true"]')) return false;
        const rect = node.getBoundingClientRect();
        for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (/(hidden|clip|scroll|auto)/.test(style.overflow + style.overflowX + style.overflowY)) {
            const clip = parent.getBoundingClientRect(); if (rect.top < clip.top || rect.bottom > clip.bottom || rect.left < clip.left || rect.right > clip.right) return false;
          }
        }
        return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
      });
    },
    async poll(initial = false) {
      if (this.polling || !this.enabled || document.visibilityState === 'hidden') return;
      const generation = this.generation; this.polling = true;
      try {
        if (!initial && !this.saving && !this.visibilitySaving && !this.settings) {
          const { data } = await api.preferences(this.roomId); if (generation !== this.generation) return;
          const changed = JSON.stringify(this.preferences) !== JSON.stringify(data.value);
          this.version = data.version; this.preferences = data.value;
          if (changed || !this.preferences.timelineEnabled) this.pending = false;
          const subscriptions = await api.subscriptions(this.roomId); if (generation !== this.generation) return;
          this.subscribedIds = subscriptions.data.postIds;
        }
        for (const view of ['room', 'personal']) {
          const key = cursorKey(this.identity, this.roomId, view), after = readCursor(key);
          let cursor, latest, found = false;
          do {
            const { data } = await api.list(this.roomId, { view, limit: 50, ...(after ? { after } : {}), ...(cursor ? { cursor } : {}),
              ...(view === 'room' ? { globalQuery: toServerQuery(this.globalQuery), columns: (this.filters || []).map(filter => toServerQuery(filter.conditions)) } : {}) });
            if (generation !== this.generation) return;
            latest ||= data.latestCursor;
            if (!after) break; // First visit establishes a baseline; all prior entries remain in history.
            for (const entry of data.entries) {
              if (entry.read || entry.ownAction || !entry.available || !visibleEntry(entry, this.visibility())) continue;
              const { data: target } = await api.target(this.roomId, entry.id); if (generation !== this.generation) return;
              if (!target.available) continue;
              if (!timelineEnabled(entry, this.preferences, this.matchesPost ? this.matchesPost(target.post) : true)) continue;
              if (!this.exactTargetVisible(entry, target.post)) { found = true; this.pending = true; this.pendingView = view; break; }
            }
            cursor = data.nextCursor;
          } while (cursor && !found);
          // The banner links to durable history, so coalescing never deletes skipped rows.
          saveCursor(key, latest);
        }
      } catch { /* Keep the cursor on failure so reconnect can catch up. */ }
      finally { this.polling = false; }

    },
  },
};
</script>
<style scoped>
.activity-controls{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}.activity-panel label{display:flex;gap:8px;align-items:center;margin:10px 0}.activity-panel input{width:18px;height:18px}.activity-panel fieldset{border:1px solid #788399;margin:12px 0;padding:12px}.activity-panel select{font:inherit;max-width:100%;padding:6px}.category{border-bottom:1px solid #9a9a9a;padding:12px 0}.category strong{display:block}.category-help{margin:4px 0;font-size:inherit}.delivery-choices{display:flex;gap:8px 16px;flex-wrap:wrap}.delivery-choices label{min-height:32px}.activity-list article{border-bottom:1px solid #778399}.activity-list button{display:block;width:100%;text-align:start;font:inherit;background:transparent;color:inherit;border:0;padding:12px;cursor:pointer}.activity-list .unread{border-inline-start:4px solid #3768ac}.activity-list time{display:block;font-size:12px}.activity-list p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.activity-list .preview-button{width:auto;padding:6px 12px;font-size:inherit}.activity-list button:focus-visible{outline:3px solid #486ad4;outline-offset:-3px}

</style>
