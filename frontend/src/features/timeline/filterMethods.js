import chatApi from '@/api/chat';
import { appendApiErrorMessage } from '@/api/apiClient';

const captureOperation = (context) =>
  typeof context.captureTimelineOperation === 'function'
    ? context.captureTimelineOperation()
    : null;

const reportOperation = (context, token, operation) => {
  if (typeof context.reportTimelineOperation !== 'function') return false;
  return context.reportTimelineOperation(token, operation);
};

const reloadFilter = (context, index) => {
  context.timeline.filters[index] = { ...context.timeline.filters[index], posts: [] };
  delete context.timeline.filters[index]._noMore;
  context.fetchTimelinePosts(index, { position: 'tail' });
};

export const timelineFilterMethods = {
  async successCreateFilter(payload) {
    const operationToken = captureOperation(this);
    const isTemporary = this.ui.queryFilters.active;
    let pushFilterId = null;
    let webPush = isTemporary ? false : payload.webPush;

    if (!isTemporary && payload.webPush) {
      try {
        const response = await chatApi.createPushFilter({
          floor_id: this.$store.getters.floorId,
          room_id: this.$store.getters.roomId,
          conditions: payload.conditions,
        });
        pushFilterId = response.data._id;
      } catch (error) {
        const message = appendApiErrorMessage(this.$t('通知フィルタの作成に失敗しました'), error, {
          translate: this.$t,
        });
        this.setSnackbar(message, 'alert');
        webPush = false;
      }
    }

    this.timeline.filters.push({
      pushFilterId,
      webPush,
      showUserIcon: payload.showUserIcon,
      conditions: payload.conditions,
      posts: [],
    });
    this.persistFilters();
    if (this.isMobile) {
      this.$nextTick(() => this.onPressFilterTab(this.timeline.filters.length - 1));
    }
    this.dialogs.filter.visible = false;

    const newIndex = this.timeline.filters.length - 1;
    this.ensurePostsArray(newIndex);
    delete this.timeline.filters[newIndex]._noMore;
    this.fetchTimelinePosts(newIndex, { position: 'tail' });
    reportOperation(this, operationToken, {
      kind: 'filter_change',
      action: 'create',
      filter: this.timeline.filters[newIndex],
    });
  },
  async successUpdateFilter(filterIndex, payload) {
    const target = this.timeline.filters[filterIndex];
    if (!target) return;
    const operationToken = captureOperation(this);

    if (this.ui.queryFilters.active) {
      target.conditions = payload.conditions;
      target.showUserIcon = payload.showUserIcon;
      this.dialogs.filter.visible = false;
      reloadFilter(this, filterIndex);
      reportOperation(this, operationToken, {
        kind: 'filter_change',
        action: 'update',
        filter: target,
      });
      return;
    }

    try {
      if (target.pushFilterId) {
        if (payload.webPush) {
          await chatApi.updatePushFilter({ id: target.pushFilterId, conditions: payload.conditions });
        } else {
          await chatApi.deletePushFilter({ id: target.pushFilterId });
          target.pushFilterId = null;
        }
      } else if (payload.webPush) {
        const response = await chatApi.createPushFilter({
          floor_id: this.$store.getters.floorId,
          room_id: this.$store.getters.roomId,
          conditions: payload.conditions,
        });
        target.pushFilterId = response.data._id;
      }

      Object.assign(target, {
        conditions: payload.conditions,
        webPush: payload.webPush,
        showUserIcon: payload.showUserIcon,
      });
      this.persistFilters();
      this.dialogs.filter.visible = false;
      reloadFilter(this, filterIndex);
      reportOperation(this, operationToken, {
        kind: 'filter_change',
        action: 'update',
        filter: target,
      });
    } catch (error) {
      const message = appendApiErrorMessage(this.$t('通知フィルタの更新に失敗しました'), error, {
        translate: this.$t,
      });
      this.setSnackbar(message, 'alert');
    }
  },
  async deleteFilter(index) {
    const target = this.timeline.filters[index];
    if (!target) return;
    const operationToken = captureOperation(this);
    let canRemoveLocally = true;

    if (!this.ui.queryFilters.active && target.pushFilterId) {
      try {
        await chatApi.deletePushFilter({ id: target.pushFilterId });
      } catch (error) {
        canRemoveLocally = false;
        const message = appendApiErrorMessage(this.$t('通知フィルタの削除に失敗しました'), error, {
          translate: this.$t,
        });
        this.setSnackbar(message, 'alert');
      }
    }

    if (!canRemoveLocally) return;
    this.timeline.filters.splice(index, 1);
    this.persistFilters();
    if (this.isMobile) this.onPressFilterTab(0);
    reportOperation(this, operationToken, {
      kind: 'filter_change',
      action: 'delete',
      filter: target,
    });
  },
};
