<template>
  <div class="view">
    <div class="view-header">
      <BackButton></BackButton>
      <h1 class="view-title">
        {{ $t('チュートリアル') }}
      </h1>
    </div>
    <div class="view-content">
      <div
        v-for="(tutorial, tutorialIndex) in tutorials"
        :key="tutorial.localFile || tutorial.videoId"
        class="tutorial-block"
      >
        <h2 class="title">{{ tutorialIndex + 1 }}. {{ $t(tutorial.title) }}</h2>

        <div class="video-wrap">
          <video
            v-if="tutorial.localFile"
            controls
            :src="localSrc(tutorial.localFile)"
            :aria-label="$t(tutorial.title)"
            preload="metadata"
          ></video>

          <iframe
            v-else
            :src="embedUrl(tutorial.videoId)"
            :title="$t(tutorial.title)"
            allow="autoplay; encrypted-media"
            allowfullscreen
          ></iframe>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import BackButton from '@/components/common/BackButton.vue';

export default {
  name: 'Tutorial',
  components: {
    BackButton,
  },
  data() {
    return {
      tutorialItems: [
        { title: 'ユーザ登録、ログイン', videoId: null, localFile: '1.mp4' },
        { title: '投稿の作成、更新、削除', videoId: null, localFile: '2.mp4' },
        { title: '「流す」投稿の作成、削除', videoId: null, localFile: '3.mp4' },
        { title: '返信の作成、更新、削除', videoId: null, localFile: '4.mp4' },
        { title: '「流す」返信の作成、削除', videoId: null, localFile: '5.mp4' },
        { title: '付加情報の作成、更新、削除', videoId: null, localFile: '6.mp4' },
        { title: '絞り込みの作成、更新、削除', videoId: null, localFile: '7.mp4' },
        { title: 'タイムラインの読み上げ機能', videoId: null, localFile: '8.mp4' },
        { title: '翻訳機能', videoId: null, localFile: '9.mp4' },
        { title: 'AI解析機能', videoId: null, localFile: '10.mp4' },
      ],
    };
  },
  computed: {
    tutorials() {
      return this.tutorialItems.filter((tutorial) => {
        if (tutorial.title === '翻訳機能') return this.$store.getters.googleTranslateAvailable;
        if (tutorial.title === 'AI解析機能') {
          return this.$store.getters.openaiAnalysisAvailable;
        }
        return true;
      });
    },
  },
  methods: {
    localSrc(file) {
      return `/assets/video/${file}`;
    },
    embedUrl(id) {
      return id ? `https://www.youtube.com/embed/${id}?rel=0` : '';
    },
  },
};
</script>
<style scoped>
.view-content :deep(h2){
  font-size: 1.35em !important;
  font-weight: bold !important;
  margin-top: 1em !important;
  margin-bottom: 0.2em !important;
}

.tutorial-block {
  margin-bottom: 2.5rem;
}

.title {
  font-size: 1.15rem;
  font-weight: 700;
  margin-bottom: 0.6rem;
}

.video-wrap {
  position: relative;
  width: 100%;
  padding-top: 56.25%; /* 高さを幅の56.25%にして、縦横比16:9を維持する。 */
}
.video-wrap iframe,
.video-wrap video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: cover;
}
</style>
