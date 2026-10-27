import { getEffectiveShowRange } from './queryFilters';

// Explicit activity navigation reveals only the selected item. Stored filters stay unchanged.
export const activityItem = (root, target, parent = false) => {
  if (!root || !target) return null;
  const id = parent ? target.postId : target.supplementId || target.replyId || target.postId;
  const item = [...root.querySelectorAll('[data-timeline-item-id]')].find(node => node.dataset.timelineItemId === id);
  return !parent && target.media ? item?.querySelector(`[data-alt-kind="${target.media}"]`) : item;
};

export const updateActivityPost = (posts, post) => {
  const index = posts.findIndex(item => item._id === post._id && !item.origin_id);
  if (index >= 0) posts.splice(index, 1, post);
  else {
    const before = posts.findIndex(item => new Date(item.created_at) < new Date(post.created_at));
    posts.splice(before < 0 ? posts.length : before, 0, post);
  }
};

// Check the exact updated item, not just another matching reply in its conversation.
export function canShowActivityInColumn(context, value, index) {
  const filter = context.timeline.filters[index];
  if (!filter || !context.matchesAny?.(value.post, filter.conditions)) return false;
  const { post, target } = value;
  const all = getEffectiveShowRange(context.ui.queryFilters?.globalShowRange, filter.conditions) !== 'target';
  const item = target.replyId ? post.replies?.find(reply => reply._id === target.replyId) : post;
  if (!item || target.replyId && context.ui.hideReply) return false;
  if (!all && !context.doesDataMatchConditions?.(item, filter.conditions)) return false;
  if (target.media && context.$store.getters.displayAlternativeText === false) return false;
  if (target.supplementId) {
    const supplement = item.supplementaries?.find(info => info._id === target.supplementId);
    if (!supplement || context.ui.hideInfo || (context.$store.getters.isSupplementVisible?.(supplement, post.room) ?? context.$store.getters.displaySupplement) === false) return false;
  }
  return true;
}

export const activityNavigationMethods = {
  clearActivityHighlight() {
    const { element, description, tabIndex } = this.activityNavigation;
    if (element) {
      element.classList.remove('activity-timeline-highlight');
      if (description === null) element.removeAttribute('aria-describedby');
      else if (description !== undefined) element.setAttribute('aria-describedby', description);
      if (tabIndex === null) element.removeAttribute('tabindex');
      else if (tabIndex !== undefined) element.setAttribute('tabindex', tabIndex);
    }
    this.activityNavigation.element = null;
  },
  clearActivityLocation() {
    this.clearActivityHighlight();
    this.activityNavigation.target = null;
    this.activityNavigation.label = '';
  },
  async navigateToActivity(value, label, current = () => true) {
    if (!value?.available || !value.post?._id || !value.target?.postId || this.isArMode) return false;
    const roomId = this.$store.getters.roomId;
    const live = () => current() && roomId === this.$store.getters.roomId;
    // Push links can arrive before the initial timeline is mounted.
    for (let i = 0; i < 80 && (!this.timelineResourcesReady || !this.infra.isSocketConnect); i++) {
      if (!live()) return false;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!live() || !this.timelineResourcesReady || !this.infra.isSocketConnect) return false;
    const filters = this.timeline.filters;
    const loaded = index => filters[index]?.posts?.some(post => post._id === value.post._id && !post.origin_id);
    // Prefer the selected tab even when the target needs older history to be loaded.
    const selected = this.ui.currentTabIndex;
    const index = canShowActivityInColumn(this, value, selected) ? selected : filters.findIndex(filter => filter.conditions === null);
    if (index < 0) return false;
    const filter = filters[index];
    if (!filter) return false;
    if (!loaded(index)) {
      const posts = (filter.posts || []).filter(post => !post.origin_id);
      const last = posts[posts.length - 1];
      // Same history-loading path as the existing notification cards.
      if (last && new Date(value.post.created_at) < new Date(last.created_at)) {
        await this.fetchTimelinePosts(index, { from: last.created_at, to: value.post.created_at, position: 'tail' });
      }
    }
    if (!live() || filters !== this.timeline.filters || filter !== filters[index]) return false;
    this.clearActivityLocation();
    this.ensurePostsArray(index);
    updateActivityPost(filter.posts, value.post);
    this.activityNavigation.target = { ...value.target, columnIndex: index };
    this.ui.currentTabIndex = index;
    await this.$nextTick();
    if (!live()) { this.clearActivityLocation(); return false; }
    this.ensureSmartphoneTabVisible?.(index, !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const shown = this.focusActivityLocation(false, label);
    if (!shown) this.clearActivityLocation();
    return shown;
  },
  focusActivityLocation(parent = false, label = '') {
    const target = this.activityNavigation.target;
    const root = this.$el?.querySelector(`#timeline-inner-${target?.columnIndex} .timeline-content`);
    const element = activityItem(root, target, parent);
    if (!element) return false;
    this.clearActivityHighlight();
    this.activityNavigation.element = element;
    this.activityNavigation.description = element.getAttribute('aria-describedby');
    this.activityNavigation.tabIndex = element.getAttribute('tabindex');
    this.activityNavigation.label = `${this.$t('activity.inTimeline')} ${parent ? this.$t('activity.post') : label}`;
    element.setAttribute('tabindex', '-1');
    const description = this.activityNavigation.description;
    element.setAttribute('aria-describedby', [description, 'activity-location-status'].filter(Boolean).join(' '));
    element.classList.add('activity-timeline-highlight');
    element.focus({ preventScroll: true });
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const rect = element.getBoundingClientRect();
    const viewport = root.getBoundingClientRect();
    // Scroll this column, not the whole page or the other columns.
    root.scrollTo({ top: Math.max(0, root.scrollTop + rect.top - viewport.top - 12), behavior: reduced ? 'instant' : 'smooth' });
    return true;
  },
  focusActivityParent() { this.focusActivityLocation(true); },
  returnToActivity() {
    this.clearActivityLocation();
    const center = this.$refs.activityCenter;
    center?.reopenList();
  },
};
