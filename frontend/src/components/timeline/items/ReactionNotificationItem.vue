<template>
  <article
    class="wrapper notification"
    @click.stop.prevent="onPressNotification(post)"
  >
    <div class="reaction">
      <div class="user-icon">
        <UiAvatar v-if="isUserIconPresent(reaction)">
          <img :src="getUserDisplayImagePath(reaction.user)" alt="" />
        </UiAvatar>
        <UiAvatar v-else>
          <UiIcon name="person" :size="24" />
        </UiAvatar>
      </div>
      <div class="container">
        <div class="name-created">
          <div class="name" dir="auto">
            {{ $t('{name}が投稿へリアクションしました', { name: getUsernameOrGuestname(reaction) }) }}
          </div>
          <div class="created">
            {{ getLocalDateTime(reaction.created_at) }}
          </div>
        </div>
        <div class="reaction-item">
          <div class="reaction-button">
            <img class="emoji-icon" :src="reactionIcon" :alt="$t(reaction.type)" />
            <span class="reaction-count">
              {{ reactionCountInPost }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <UiButton
      appearance="filled"
      tone="primary"
      :data-testid="'timeline-reaction-notification-target-' + reaction._id"
      @click.stop="onPressNotification(post)"
    >
      {{ $t('対象の投稿へ移動') }}
    </UiButton>

    <div class="post" v-if="!hideParent">
      <div class="user-icon">
        <UiAvatar v-if="isUserIconPresent(post)">
          <img :src="getUserDisplayImagePath(post.user)" alt="" />
        </UiAvatar>
        <UiAvatar v-else>
          <UiIcon name="person" :size="24" />
        </UiAvatar>
      </div>
      <div class="container">
        <div class="name-created">
          <div class="name" dir="auto">
            {{ $t('{name}の投稿', { name: getUsernameOrGuestname(post) }) }}
          </div>
          <div class="created">
            {{ getLocalDateTime(post.created_at) }}
          </div>
        </div>
        <div class="text"><TimelineText :content="post.content" /></div>
        <div class="translate" dir="auto" v-if="needsTranslation(post)">
          {{ getContent(post) }}
        </div>
        <div class="tags" v-if="$store.getters.displayTag">
          <template v-for="(tagId, index) in post.room_tags" :key="index">
            <span v-if="isTagInRoomTags(tagId)" dir="auto"> #{{ getTagNameById(tagId) }} </span>
          </template>
        </div>
        <div class="image" v-if="post.image_name">
          <button @click="showGalleryDialog(post)">
            <img
              :alt="post.image_caption ? post.image_caption : $t('投稿された画像')"
              :src="constructImagePath(post.floor, post.room, post)"
            />
          </button>
        </div>
        <div class="audio" v-if="post.audio_name">
          <template v-if="post.audio_description">
            <figure>
              <audio
                :src="'/media/' + post.floor + '/' + post.room + '/' + post.audio_name"
                :aria-label="post.audio_title || null"
                preload="none"
                controls
              ></audio>
              <figcaption dir="auto">{{ post.audio_description }}</figcaption>
            </figure>
          </template>
          <template v-else>
            <audio
              :src="'/media/' + post.floor + '/' + post.room + '/' + post.audio_name"
              :aria-label="post.audio_title || null"
              preload="none"
              controls
            ></audio>
          </template>
        </div>
        <div class="video" v-if="post.video_name !== null" :class="videoThumbClass(post)">
          <img
            aria-hidden="true"
            :src="'/media/' + post.floor + '/' + post.room + '/' + post.video_thumbnail_name"
            alt=""
            loading="lazy"
            @load="onVideoThumbLoad($event, post)"
          />
          <UiIcon class="play-icon" name="play_arrow" :size="48" />
        </div>
      </div>
    </div>
  </article>
</template>

<script>
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import TimelineText from '@/components/timeline/TimelineText.vue';
import DateUtil from '@/utils/dateUtil.js';
import TimelineUtil from '@/features/timeline/timelineUtil.js';
import TranslationUtil from '@/utils/translationUtil';
import userDisplayMethods from '@/features/profile/userDisplayMethods';
import { REACTION_TYPES } from '@/constants/reactionTypes';

export default {
  emits: ['onPressNotification'],
  name: 'ReactionNotificationItem',
  components: {
    TimelineText,
    UiAvatar,
    UiButton,
    UiIcon,
  },
  props: {
    post: {
      type: Object,
      required: true,
    },
    reaction: {
      type: Object,
      required: true,
    },
    tags: {
      type: Array,
      default: () => [],
    },
    hideParent: { type: Boolean, default: false },
  },
  data() {
    return {
      thumbOrientation: {}, // 投稿IDごとのサムネイルの向き（portraitは縦長、landscapeは横長）
    };
  },
  computed: {
    reactionCountInPost() {
      if (!this.post || !this.post.reactions || !this.reaction) {
        return 0;
      }
      return this.post.reactions.filter((r) => r.type === this.reaction.type).length;
    },
    reactionIcon() {
      if (!this.reaction || !this.reaction.type) {
        return '';
      }
      const found = REACTION_TYPES.find((item) => item.type === this.reaction.type);
      return found.icon;
    },
  },
  methods: {
    ...userDisplayMethods,
    onVideoThumbLoad(e, item) {
      const img = e.target;
      const isPortrait = img.naturalHeight > img.naturalWidth;
      this.thumbOrientation[item._id] = isPortrait ? 'portrait' : 'landscape';
    },
    videoThumbClass(item) {
      const o = this.thumbOrientation[item._id];
      return {
        'is-portrait': o === 'portrait',
        'is-landscape': o === 'landscape' || !o, // サムネイルの向きを取得するまでは横長として表示する。
      };
    },

    getUsernameOrGuestname(post) {
      return this.resolveActorDisplayName(post);
    },

    needsTranslation(data) {
      return TranslationUtil.needsTranslation(data, this.$i18n.locale);
    },
    getContent(data) {
      return TranslationUtil.getContent(data, this.$i18n.locale);
    },

    isTagInRoomTags(tagId) {
      return TimelineUtil.isTagInRoomTags(this.tags, tagId);
    },

    getTagNameById(tagId) {
      const tag = this.tags.find((tag) => tag._id === tagId);
      return TranslationUtil.getTagName(tag, this.$i18n.locale);
    },

    isUserIconPresent(data) {
      return this.hasUserDisplayImage(data?.user);
    },

    constructImagePath(floorId, roomId, data) {
      // サムネイルがない画像では元画像を表示する。
      return TimelineUtil.constructImagePath(floorId, roomId, data);
    },

    getLocalDateTime(date) {
      const locale = this.$i18n.locale;
      return DateUtil.getLocalDate(date, locale, 'dateTime');
    },

    onPressNotification(post) {
      this.$emit('onPressNotification', post);
    },

    showGalleryDialog() {
    },
  },
};
</script>

<style scoped>
.notification {
  background-color: rgba(255, 255, 255, 0.1);
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: inset 4px 0 0 0 orangered;
}
.wrapper {
  width: 100%;
}
.post {
  display: flex;
  padding: 16px 8px 0px 8px;
  width: 100%;
}
.reaction {
  display: flex;
  padding-block: 16px 0;
  padding-inline: 54px 8px;
  width: 100%;
  position: relative;
}

.reaction::before {
  content: '';
  position: absolute;
  width: 2px;
  top: 36px;
  bottom: -56px;
  inset-inline-start: 27px; /* 左余白54pxの中央に縦線を配置する。 */
  background: #999;
}

.reaction::after {
  content: '';
  position: absolute;
  height: 2px;
  width: 27px;
  top: 36px;
  inset-inline-start: 27px;
  transform: translateY(-50%);
  background: #999;
}

.user-icon {
  padding-inline-end: 8px;
}
.container {
  flex: 1;
  color: white;
}
.name-created {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.name {
  font-weight: bolder;
}
.created {
  margin-inline-start: auto;
  color: yellow;
}
@media screen and (max-width: 896px) {
  .name-created {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .created {
    margin-bottom: 4px;
    margin-inline-start: 0;
  }
}
.translate {
  color: lightskyblue;
}

.image {
  display: inline-block;
  margin: 8px 0;
}
.image button {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
}
.image img {
  display: block;
  width: auto;
  height: auto;
  max-width: min(100%, 400px);
  border-radius: 8px;
}

audio {
  width: 100%;
  max-width: 400px;
}

.video {
  display: block;
  margin: 8px 0;
  width: 100%;
  max-width: 400px;
  box-sizing: border-box;
}
.video > button {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  display: block;
  width: 100%;
  position: relative;
  line-height: 0;
  cursor: pointer;
}
.video.is-portrait > button {
  aspect-ratio: 4 / 5;
}
.video.is-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}
/* 横向きのサムネイルは元のアスペクト比を維持する。 */
.video.is-landscape img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}
.play-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 48px;
  color: white;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  padding: 4px;
  z-index: 1;
}

.text {
  text-align: start;
  white-space: pre-wrap;
  word-break: break-all;
}

.reaction-item {
  display: flex;
  margin-bottom: 4px;
}
.reaction-button {
  margin-inline-end: 8px;
  display: flex;
  align-items: center;
  background-color: transparent;
  border: 2px solid transparent;
  border-radius: 4px;
  cursor: default;
}
.emoji-icon {
  width: 20px;
  height: 20px;
  margin-inline-end: 4px;
}
.reaction-count {
  color: white;
}
</style>
