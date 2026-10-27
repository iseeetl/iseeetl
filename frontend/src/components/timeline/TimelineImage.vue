<template>
  <img ref="image" :src="currentSrc" :alt="alt" loading="lazy" decoding="async" @load="measure" @error="fallback" />
</template>

<script>
export default {
  name: 'TimelineImage',
  props: { alt: { type: String, required: true }, src: { type: String, required: true }, previewSrc: { type: String, default: '' } },
  data() { return { highResolution: false, previewFailed: false, visible: false }; },
  computed: { currentSrc() { return this.highResolution && !this.previewFailed ? this.previewSrc : this.src; } },
  watch: {
    src() { this.highResolution = false; this.previewFailed = false; this.$nextTick(this.measure); },
  },
  mounted() {
    this.visible = typeof IntersectionObserver === 'undefined';
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.measure);
      this.resizeObserver.observe(this.$refs.image);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) this.measure();
      });
      this.intersectionObserver.observe(this.$refs.image);
    }
    window.addEventListener('resize', this.measure);
    this.watchDensity();
    this.measure();
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    window.removeEventListener('resize', this.measure);
    this.densityQuery?.removeEventListener('change', this.densityChanged);
  },
  methods: {
    watchDensity() {
      this.densityQuery?.removeEventListener('change', this.densityChanged);
      this.densityQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      this.densityQuery?.addEventListener('change', this.densityChanged);
    },
    densityChanged() { this.watchDensity(); this.measure(); },
    measure() {
      if (!this.visible || !this.previewSrc || this.previewFailed || this.highResolution) return;
      const image = this.$refs.image;
      if (!image?.complete || !image.naturalWidth) return;
      const { width, height } = image.getBoundingClientRect();
      if (Math.max(width, height) * (window.devicePixelRatio || 1) > 400) this.highResolution = true;
    },
    fallback() { if (this.highResolution) this.previewFailed = true; },
  },
};
</script>
