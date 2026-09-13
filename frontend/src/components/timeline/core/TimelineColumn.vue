<template>
  <div
    :id="'timeline-inner-' + index"
    :role="isMobile ? 'tabpanel' : undefined"
    :aria-labelledby="isMobile ? 'tab-button-' + index : undefined"
    class="timeline-inner"
  >
    <div
      :id="isDefaultColumn ? 'timeline' : 'filter' + index"
      ref="timeline"
      class="timeline column"
      :style="timelineFontFamily + timelineFontSize + ' !important'"
    >
      <div class="timeline-title">
        <UiTooltip class="timeline-title-handle" :text="$t('ドラッグアンドドロップでカラム移動')">
          <UiButton
            class="timeline-handle"
            appearance="text"
            tone="neutral"
            density="dense"
            iconOnly
            :aria-label="$t('ドラッグアンドドロップでカラム移動')"
          >
            <UiIcon name="drag_indicator" />
          </UiButton>
        </UiTooltip>

        <h2
          :id="isDefaultColumn ? 'timeline-title-main' : 'timeline-title' + index"
          class="filter-timeline-title timeline-title-summary"
          :aria-label="timelineTitleText"
        >
          <UiTooltip
            class="timeline-title-tooltip"
            :text="$t('{title}の先頭へ移動', { title: timelineTitleText })"
          >
            <button
              ref="scrollToTopButton"
              class="timeline-scroll-to-top-button"
              type="button"
              :aria-label="$t('{title}の先頭へ移動', { title: timelineTitleText })"
              :data-testid="'timeline-scroll-to-top-' + index"
              @click="scrollToTop"
            >
              <TimelineFilterSummary
                :filter="filter"
                :localTagIds="localTagIds"
                :getTranslatedTagName="getTranslatedTagName"
              />
            </button>
          </UiTooltip>
        </h2>

        <div class="timeline-title-actions">
          <TimelinePostButtons
            :isGuestReactionOnly="isGuestReactionOnly"
            :defaultTagIds="filterTagIds"
            @showEditPostDialog="onShowEditPostDialog"
          />

          <UiTooltip class="button-position-right" :text="$t(isSpeechActive ? '読み上げオン' : '読み上げオフ')">
            <UiButton
              appearance="text"
              :tone="isSpeechActive || localSpeech ? 'danger' : 'primary'"
              density="dense"
              iconOnly
              :aria-label="$t(isSpeechActive ? '読み上げオン' : '読み上げオフ')"
              data-testid="timeline-speech-toggle-button"
              @click="$emit('toggleColumnSpeech', index, $event)"
            >
              <UiIcon :name="isSpeechActive ? 'volume_up' : 'volume_off'" />
            </UiButton>
          </UiTooltip>

          <UiTooltip :text="$t('絞り込み条件変更')">
            <UiButton
              appearance="text"
              tone="primary"
              density="dense"
              iconOnly
              :data-testid="'timeline-filter-edit-button-' + index"
              :aria-label="$t('絞り込み条件変更')"
              @click="$emit('showFilterDialog', index, filter, $event)"
            >
              <UiIcon name="filter_alt" />
            </UiButton>
          </UiTooltip>

          <UiTooltip :text="$t('絞り込み削除')">
            <UiButton
              appearance="text"
              tone="primary"
              density="dense"
              iconOnly
              :data-testid="'timeline-filter-delete-button-' + index"
              :aria-label="$t('絞り込み削除')"
              @click="$emit('deleteFilter', index)"
            >
              <UiIcon name="close" />
            </UiButton>
          </UiTooltip>
        </div>
      </div>

      <div class="timeline-content" :data-column-index="index" :aria-busy="filter._sending ? 'true' : 'false'">
        <!-- 指定された投稿を先頭に固定して表示する。 -->
        <div v-if="isConditionless && focusPost" :key="focusPost._id + '_wrapper'" class="focus-post-wrapper">
          <!-- 返信は新しい順に表示する。 -->
          <template v-for="(reply, rIdx) in focusPost.replies.slice().reverse()" :key="reply._id">
            <AnimationReplyItem
              v-if="!hideReply && reply.animation !== null"
              :postId="focusPost._id"
              :post="focusPost"
              :reply="reply"
              :columnIndex="index"
              :animatingItemsColumn="animatingItemsColumn"
              :animationEnabled="animationEnabled"
              :needThreadLine="needThreadLine(focusPost, rIdx)"
              @showDeleteReplyDialog="onShowDeleteReplyDialog"
              @showEditKickedUserDialog="onShowEditKickedUserDialog"
              @animationClicked="onAnimationClicked"
            />
            <ReplyItem
              v-else-if="!hideReply"
              :idPrefix="itemIdPrefix"
              :post="focusPost"
              :reply="reply"
              :tags="roomTags"
              :isGuestRulesAgreed="isGuestRulesAgreed"
              :hideInfo="hideInfo"
              :needThreadLine="needThreadLine(focusPost, rIdx)"
              :showUserIcon="filter.showUserIcon"
              @showEditReplyDialog="onShowEditReplyDialog"
              @showEditSupplementDialog="onShowEditSupplementDialog"
              @showDeleteSupplementDialog="onShowDeleteSupplementDialog"
              @showEditTagDialog="onShowEditTagDialog"
              @showDeleteReplyDialog="onShowDeleteReplyDialog"
              @showGalleryDialog="onShowGalleryDialog"
              @showEditKickedUserDialog="onShowEditKickedUserDialog"
              @onSuccessCreateFilter="onSuccessCreateFilter"
            />
          </template>

          <PostItem
            :key="focusPost._id"
            :idPrefix="itemIdPrefix"
            :post="focusPost"
            :tags="roomTags"
            :isGuestRulesAgreed="isGuestRulesAgreed"
            :hideInfo="hideInfo"
            :showExternalShareButton="showExternalShareButton"
            :showUserIcon="filter.showUserIcon"
            @showEditPostDialog="onShowEditPostDialog"
            @showDeletePostDialog="onShowDeletePostDialog"
            @showEditReplyDialog="onShowEditReplyDialog"
            @showDeleteReplyDialog="onShowDeleteReplyDialog"
            @showEditSupplementDialog="onShowEditSupplementDialog"
            @showDeleteSupplementDialog="onShowDeleteSupplementDialog"
            @showEditTagDialog="onShowEditTagDialog"
            @showGalleryDialog="onShowGalleryDialog"
            @showEditKickedUserDialog="onShowEditKickedUserDialog"
            @onSuccessCreateFilter="onSuccessCreateFilter"
          />
        </div>

        <!-- 条件なしカラムの投稿一覧 -->
        <template v-if="!hasEffectiveConditions">
          <div v-for="post in normalPosts" :key="'post_' + post._id">
            <template v-if="checkTagFilter(post)">
              <template v-if="isReplyNotification(post)">
                <ReplyNotificationItem
                  :key="`reply_notification_${post._id}`"
                  :post="post"
                  :reply="post.replyNotification"
                  :tags="roomTags"
                  :hideParent="post.hideParent"
                  @onPressNotification="onPressNotification"
                />
              </template>
              <template v-else-if="isReactionNotification(post)">
                <ReactionNotificationItem
                  :key="`reaction_notification_${post.reactionNotification._id}`"
                  :post="post"
                  :reaction="post.reactionNotification"
                  :tags="roomTags"
                  :hideParent="post.hideParent"
                  @onPressNotification="onPressNotification"
                />
              </template>

              <template v-else-if="post.animation !== null">
                <AnimationPostItem
                  :key="post._id"
                  :post="post"
                  :columnIndex="index"
                  :animatingItemsColumn="animatingItemsColumn"
                  :animationEnabled="animationEnabled"
                  @showEditPostDialog="onShowEditPostDialog"
                  @showEditTagDialog="onShowEditTagDialog"
                  @showDeletePostDialog="onShowDeletePostDialog"
                  @showEditKickedUserDialog="onShowEditKickedUserDialog"
                  @animationClicked="onAnimationClicked"
                />
              </template>

              <template v-else>
                <template v-for="(reply, rIdx) in post.replies.slice().reverse()" :key="reply._id">
                  <AnimationReplyItem
                    v-if="!hideReply && reply.animation !== null"
                    :postId="post._id"
                    :post="post"
                    :reply="reply"
                    :columnIndex="index"
                    :animatingItemsColumn="animatingItemsColumn"
                    :animationEnabled="animationEnabled"
                    :needThreadLine="needThreadLine(post, rIdx)"
                    @showEditReplyDialog="onShowEditReplyDialog"
                    @showEditTagDialog="onShowEditTagDialog"
                    @showDeleteReplyDialog="onShowDeleteReplyDialog"
                    @showEditKickedUserDialog="onShowEditKickedUserDialog"
                    @animationClicked="onAnimationClicked"
                  />
                  <ReplyItem
                    v-else-if="!hideReply"
                    :idPrefix="itemIdPrefix"
                    :post="post"
                    :reply="reply"
                    :tags="roomTags"
                    :isGuestRulesAgreed="isGuestRulesAgreed"
                    :hideInfo="hideInfo"
                    :needThreadLine="needThreadLine(post, rIdx)"
                    :showUserIcon="filter.showUserIcon"
                    @showEditReplyDialog="onShowEditReplyDialog"
                    @showEditSupplementDialog="onShowEditSupplementDialog"
                    @showDeleteSupplementDialog="onShowDeleteSupplementDialog"
                    @showEditTagDialog="onShowEditTagDialog"
                    @showDeleteReplyDialog="onShowDeleteReplyDialog"
                    @showGalleryDialog="onShowGalleryDialog"
                    @showEditKickedUserDialog="onShowEditKickedUserDialog"
                    @onSuccessCreateFilter="onSuccessCreateFilter"
                  />
                </template>

                <PostItem
                  :key="post._id"
                  :idPrefix="itemIdPrefix"
                  :post="post"
                  :tags="roomTags"
                  :isGuestRulesAgreed="isGuestRulesAgreed"
                  :hideInfo="hideInfo"
                  :showExternalShareButton="showExternalShareButton"
                  :showUserIcon="filter.showUserIcon"
                  @showEditPostDialog="onShowEditPostDialog"
                  @showDeletePostDialog="onShowDeletePostDialog"
                  @showEditReplyDialog="onShowEditReplyDialog"
                  @showDeleteReplyDialog="onShowDeleteReplyDialog"
                  @showEditSupplementDialog="onShowEditSupplementDialog"
                  @showDeleteSupplementDialog="onShowDeleteSupplementDialog"
                  @showEditTagDialog="onShowEditTagDialog"
                  @showGalleryDialog="onShowGalleryDialog"
                  @showEditKickedUserDialog="onShowEditKickedUserDialog"
                  @onSuccessCreateFilter="onSuccessCreateFilter"
                />
              </template>
            </template>
          </div>
        </template>

        <!-- 絞り込みカラムの投稿一覧 -->
        <template v-else>
          <div v-for="post in filteredPosts" :key="'post_' + post._id">
            <template v-if="isReplyNotification(post)">
              <ReplyNotificationItem
                :key="`reply_notification_${post._id}`"
                :post="post"
                :reply="post.replyNotification"
                :tags="roomTags"
                :hideParent="post.hideParent"
                @onPressNotification="onPressNotification"
              />
            </template>
            <template v-else-if="isReactionNotification(post)">
              <ReactionNotificationItem
                :key="`reaction_notification_${post.reactionNotification._id}`"
                :post="post"
                :reaction="post.reactionNotification"
                :tags="roomTags"
                :hideParent="post.hideParent"
                @onPressNotification="onPressNotification"
              />
            </template>

            <template v-else-if="post.animation && (rangeIsAll || doesDataMatchConditions(post, filter.conditions))">
              <AnimationPostItem
                :key="post._id"
                :post="post"
                :columnIndex="index"
                :animatingItemsColumn="animatingItemsColumn"
                :animationEnabled="animationEnabled"
                @showEditPostDialog="onShowEditPostDialog"
                @showEditTagDialog="onShowEditTagDialog"
                @showDeletePostDialog="onShowDeletePostDialog"
                @showEditKickedUserDialog="onShowEditKickedUserDialog"
                @animationClicked="onAnimationClicked"
              />
            </template>

            <template v-else>
              <template v-for="(reply, rIdx) in post.replies.slice().reverse()" :key="reply._id">
                <AnimationReplyItem
                  v-if="
                    !hideReply &&
                    reply.animation &&
                    shouldShowReply(
                      rangeIsAll || doesDataMatchConditions(post, filter.conditions),
                      reply,
                      filter.conditions
                    )
                  "
                  :postId="post._id"
                  :post="post"
                  :reply="reply"
                  :columnIndex="index"
                  :animatingItemsColumn="animatingItemsColumn"
                  :animationEnabled="animationEnabled"
                  :needThreadLine="needThreadLine(post, rIdx)"
                  @showEditReplyDialog="onShowEditReplyDialog"
                  @showEditTagDialog="onShowEditTagDialog"
                  @showDeleteReplyDialog="onShowDeleteReplyDialog"
                  @showEditKickedUserDialog="onShowEditKickedUserDialog"
                  @animationClicked="onAnimationClicked"
                />
                <ReplyItem
                  v-else-if="
                    !hideReply &&
                    shouldShowReply(
                      rangeIsAll || doesDataMatchConditions(post, filter.conditions),
                      reply,
                      filter.conditions
                    )
                  "
                  :idPrefix="itemIdPrefix"
                  :post="post"
                  :reply="reply"
                  :tags="roomTags"
                  :isGuestRulesAgreed="isGuestRulesAgreed"
                  :hideInfo="hideInfo"
                  :needThreadLine="needThreadLine(post, rIdx)"
                  :showUserIcon="filter.showUserIcon"
                  @showEditReplyDialog="onShowEditReplyDialog"
                  @showEditSupplementDialog="onShowEditSupplementDialog"
                  @showDeleteSupplementDialog="onShowDeleteSupplementDialog"
                  @showEditTagDialog="onShowEditTagDialog"
                  @showDeleteReplyDialog="onShowDeleteReplyDialog"
                  @showGalleryDialog="onShowGalleryDialog"
                  @showEditKickedUserDialog="onShowEditKickedUserDialog"
                  @onSuccessCreateFilter="onSuccessCreateFilter"
                />
              </template>

              <PostItem
                v-if="rangeIsAll || doesDataMatchConditions(post, filter.conditions)"
                :key="post._id"
                :idPrefix="itemIdPrefix"
                :post="post"
                :tags="roomTags"
                :isGuestRulesAgreed="isGuestRulesAgreed"
                :hideInfo="hideInfo"
                :showExternalShareButton="showExternalShareButton"
                :showUserIcon="filter.showUserIcon"
                @showEditPostDialog="onShowEditPostDialog"
                @showDeletePostDialog="onShowDeletePostDialog"
                @showEditReplyDialog="onShowEditReplyDialog"
                @showDeleteReplyDialog="onShowDeleteReplyDialog"
                @showEditSupplementDialog="onShowEditSupplementDialog"
                @showDeleteSupplementDialog="onShowDeleteSupplementDialog"
                @showEditTagDialog="onShowEditTagDialog"
                @showGalleryDialog="onShowGalleryDialog"
                @showEditKickedUserDialog="onShowEditKickedUserDialog"
                @onSuccessCreateFilter="onSuccessCreateFilter"
              />
            </template>
          </div>
        </template>

        <UiButton
          class="get-next-posts-button"
          v-if="isConditionless && !filter._noMore && posts.length > 0 && !filter._sending"
          appearance="filled"
          tone="primary"
          @click="$emit('onGetNextPosts', index)"
        >
          {{ $t('次の投稿を読み込む') }}
        </UiButton>

        <!-- 次のデータを取得するため、表示領域への進入を監視する。 -->
        <div class="scroll-sentinel"></div>
      </div>
    </div>
  </div>
</template>

<script>
import ReplyNotificationItem from '@/components/timeline/items/ReplyNotificationItem.vue';
import ReactionNotificationItem from '@/components/timeline/items/ReactionNotificationItem.vue';
import AnimationPostItem from '@/components/timeline/items/AnimationPostItem.vue';
import PostItem from '@/components/timeline/items/PostItem.vue';
import AnimationReplyItem from '@/components/timeline/items/AnimationReplyItem.vue';
import ReplyItem from '@/components/timeline/items/ReplyItem.vue';

import TimelinePostButtons from '@/components/timeline/core/TimelinePostButtons.vue';
import TimelineFilterSummary from '@/components/timeline/core/TimelineFilterSummary.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

import TranslationUtil from '@/utils/translationUtil';
import TimelineUtil from '@/features/timeline/timelineUtil';
import { getPresetTagIdsFromFilter } from '@/features/timeline/filters';
import { buildFilterSummaryText } from '@/features/timeline/filterSummary';
import {
  getEffectiveShowRange,
  matchesConditionGroups,
  matchesPostConditionGroups,
} from '@/features/timeline/queryFilters';

export default {
  emits: [
    'deleteFilter',
    'onGetNextPosts',
    'onPressNotification',
    'showDeletePostDialog',
    'showDeleteReplyDialog',
    'showDeleteSupplementDialog',
    'showEditKickedUserDialog',
    'showEditPostDialog',
    'showEditReplyDialog',
    'showEditSupplementDialog',
    'showEditTagDialog',
    'showFilterDialog',
    'showGalleryDialog',
    'successCreateFilter',
    'toggleAnimation',
    'toggleColumnSpeech',
  ],
  name: 'TimelineColumn',
  components: {
    ReplyNotificationItem,
    ReactionNotificationItem,
    AnimationPostItem,
    PostItem,
    AnimationReplyItem,
    ReplyItem,
    TimelinePostButtons,
    TimelineFilterSummary,
    UiButton,
    UiIcon,
    UiTooltip,
  },
  props: {
    index: {
      type: Number,
      required: true,
    },
    filter: {
      type: Object,
      required: true,
    },
    isDefaultColumn: {
      type: Boolean,
      default: false,
    },
    posts: {
      type: Array,
      default: () => [],
    },
    // アニメーション中の要素は、このカラムに属するものだけを親から受け取る。
    animatingItemsColumn: {
      type: Object,
      default: () => ({}),
    },
    animationEnabled: {
      type: Boolean,
      default: false,
    },
    roomTags: {
      type: Array,
      default: () => [],
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
    timelineFontFamily: {
      type: String,
      default: '',
    },
    timelineFontSize: {
      type: String,
      default: '',
    },
    isSpeechActive: {
      type: Boolean,
      default: false,
    },
    isGuestRulesAgreed: {
      type: Boolean,
      default: false,
    },
    hideReply: {
      type: Boolean,
      default: false,
    },
    hideInfo: {
      type: Boolean,
      default: false,
    },
    localSpeech: {
      type: Boolean,
      default: false,
    },
    localTagIds: { type: Array, default: () => [] },
    localTagOperator: { type: String, default: 'or' },
    globalConditions: { type: Object, default: null },
    globalShowRange: { type: String, default: null },
    focusedPostId: {
      type: String,
      default: null,
    },
    isGuestReactionOnly: {
      type: Boolean,
      default: false,
    },
    showExternalShareButton: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    isConditionless() {
      return this.filter && this.filter.conditions === null;
    },

    hasEffectiveConditions() {
      return !!(this.globalConditions || this.filter?.conditions);
    },

    rangeIsAll() {
      return getEffectiveShowRange(this.globalShowRange, this.filter?.conditions) !== 'target';
    },

    itemIdPrefix() {
      return this.isDefaultColumn ? 'timeline' : 'filter' + this.index;
    },

    focusPost() {
      if (!this.focusedPostId) return null;
      return this.posts.find((p) => p._id === this.focusedPostId) || null;
    },
    normalPosts() {
      return this.posts.filter((p) => p._id !== this.focusedPostId);
    },
    filterTagIds() {
      return getPresetTagIdsFromFilter(this.filter);
    },
    timelineTitleText() {
      return buildFilterSummaryText({
        filter: this.filter,
        localTagIds: this.localTagIds,
        getTranslatedTagName: this.getTranslatedTagName,
        t: (key) => this.$t(key),
      });
    },

    filteredPosts() {
      if (!this.hasEffectiveConditions) return this.posts;
      return this.normalPosts.filter((post) => {
        // 通知カードは条件なしカラムにだけ表示する。
        if (post.replyNotification || post.reactionNotification) return this.isConditionless;
        return this.matchesPostConditions(post);
      });
    },
  },
  methods: {
    // 投稿全体を表示する設定では、親投稿が条件に合えば返信も表示する。
    shouldShowReply(postMatched, reply, cond) {
      if (this.rangeIsAll && postMatched) return true;
      return this.doesDataMatchConditions(reply, cond);
    },
    // 新しい順に並べた返信のうち、最初の通常返信とそれより古い返信に縦線を描く。通常返信がなければ描かない。
    needThreadLine(post, reversedIdx) {
      const rev = post.replies.slice().reverse();
      const firstNormalIdx = rev.findIndex((r) => r.animation === null);

      if (firstNormalIdx === -1) return false;

      return reversedIdx >= firstNormalIdx;
    },

    scrollToTop() {
      const container = this.$el.querySelector('.timeline-content');
      if (container) {
        container.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }
    },

    checkTagFilter(post) {
      if (this.globalConditions) {
        return this.matchesPostConditions(post);
      }

      if (!this.localTagIds.length) {
        return true;
      }

      if (this.localTagOperator === 'or') {
        return Array.isArray(post.room_tags) && post.room_tags.some((tagId) => this.localTagIds.includes(tagId));
      }

      if (this.localTagOperator === 'and') {
        return Array.isArray(post.room_tags) && this.localTagIds.every((qtag) => post.room_tags.includes(qtag));
      }

      return true;
    },

    onSuccessCreateFilter(payload) {
      this.$emit('successCreateFilter', payload);
    },
    getTranslatedTagName(tagId) {
      return TranslationUtil.getTranslatedTagName(tagId, this.roomTags, this.$i18n.locale);
    },
    doesDataMatchConditions(data, conditions) {
      return matchesConditionGroups({
        target: data,
        globalConditions: this.globalConditions,
        columnConditions: conditions,
        matcher: (target, targetConditions) => TimelineUtil.doesDataMatchConditions(target, targetConditions),
      });
    },

    matchesPostConditions(post) {
      return matchesPostConditionGroups({
        post,
        globalConditions: this.globalConditions,
        columnConditions: this.filter?.conditions,
        matcher: (target, targetConditions) => TimelineUtil.doesDataMatchConditions(target, targetConditions),
      });
    },

    isReplyNotification(post) {
      return typeof post.replyNotification !== 'undefined' && post.replyNotification !== null;
    },
    isReactionNotification(post) {
      return typeof post.reactionNotification !== 'undefined' && post.reactionNotification !== null;
    },

    onPressNotification(data) {
      this.$emit('onPressNotification', data, this.index);
    },

    onShowDeletePostDialog(post, event) {
      this.$emit('showDeletePostDialog', post, event);
    },
    onShowEditKickedUserDialog(userId, username, event) {
      this.$emit('showEditKickedUserDialog', userId, username, event);
    },

    onShowEditReplyDialog(post, reply, event) {
      this.$emit('showEditReplyDialog', post, reply, event);
    },
    onShowDeleteReplyDialog(postId, reply, event) {
      this.$emit('showDeleteReplyDialog', postId, reply, event);
    },

    onShowEditSupplementDialog(postId, replyId, supplement, event) {
      this.$emit('showEditSupplementDialog', postId, replyId, supplement, event);
    },
    onShowDeleteSupplementDialog(postId, replyId, supplement, event) {
      this.$emit('showDeleteSupplementDialog', postId, replyId, supplement, event);
    },

    onShowEditTagDialog(id, tagValue, event) {
      this.$emit('showEditTagDialog', id, tagValue, event);
    },

    onShowEditPostDialog(post, isAnimation, tagIds = []) {
      this.$emit('showEditPostDialog', post, isAnimation, tagIds);
    },

    onShowGalleryDialog(data, event) {
      this.$emit('showGalleryDialog', data, event);
    },

    onAnimationClicked(animationElement) {
      this.$emit('toggleAnimation', animationElement);
    },
  },
};
</script>

<style scoped>
@media screen and (min-width: 897px) {
  .timeline-title,
  .filter-title {
    display: flex;
  }
}
@media screen and (max-width: 896px) {
  .timeline-title,
  .filter-title {
    display: none !important;
  }
}

.timeline-inner {
  max-width: 800px;
  width: 100%;
  height: 100%;
  margin: auto;
  background-color: rgb(230, 230, 230);
}
.column {
  display: flex;
  flex-direction: column;
  max-width: 800px;
  width: 100%;
  height: 100%;
  background-color: rgb(23, 31, 42);
}
.ar-mode-wrapper .column {
  background: #000 !important;
}

#timeline-title-main,
.filter-timeline-title {
  display: block;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding-inline-end: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #000000;
  font-weight: normal;
  font-size: 16px;
}
/* タグ指定時は見出しが2行になるため、高さを広げる。 */
.two-line-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-hidden {
  display: none !important;
}
.timeline-show {
  display: block !important;
}

.timeline-title {
  display: flex;
  justify-content: flex-start;
  position: relative;
  align-items: center;
  padding-inline-start: 8px;
  width: 100%;
  height: 48px;
  padding-bottom: 4px;
  color: rgb(23, 31, 42);
  background: white;
}
.timeline-title-handle,
.timeline-title-actions {
  flex: 0 0 auto;
}
.timeline-title .timeline-title-summary {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}
.timeline-title-tooltip {
  display: block;
  width: 100%;
  min-width: 0;
}
.timeline-scroll-to-top-button {
  display: block;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  line-height: inherit;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.timeline-title-actions {
  display: flex;
  align-items: center;
}
.timeline-title::before {
  content: '';
  display: block;
  position: absolute;
  inset-inline-start: 0;
  bottom: 0;
  z-index: 2;
  width: 100%;
  border-bottom: 4px solid rgb(255, 146, 0);
}
.timeline-title::after {
  content: '';
  display: block;
  position: absolute;
  inset-inline-start: 0;
  bottom: 0;
  z-index: 3;
  width: 50%;
  border-bottom: 4px solid rgb(0, 159, 168);
}
.timeline-content {
  height: calc(100% - 48px); /* カラムの高さからタイトルの高さを差し引く。 */
  overflow-x: hidden;
  overflow-y: scroll;
  position: relative;
}
.filter-title {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 8px;
  background: #eeeeee;
}
.timeline-title .ui-button--neutral .ui-icon {
  color: rgb(23, 31, 42);
}

.timeline-menu {
  display: flex;
  margin-top: 8px;
  margin-bottom: 8px;
}
.timeline-menu-icon-wrapper {
  display: flex;
  align-items: center;
}
.timeline-menu-icon {
  padding-inline-end: 6px;
}
.timeline-menu-button {
  margin-block: 0 !important;
  margin-inline: 16px 0 !important;
  padding: 8px !important;
  height: initial !important;
}

.get-next-posts-button {
  width: 100%;
  margin: 10px 0px 0px 0px;
}

.focus-post-wrapper {
  background-color: rgba(255, 255, 255, 0.1);
  box-shadow: inset 4px 0 0 0 #0074d9;
}

.scroll-sentinel {
  height: 1px;
}
</style>
