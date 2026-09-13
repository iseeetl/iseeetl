<template>
  <div ref="wave" class="wave-canvas"></div>
</template>

<script>
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

export default {
  name: 'WaveformRecord',
  emits: ['blobReady', 'deviceReady', 'deviceError'],

  mounted() {
    this.ws = WaveSurfer.create({
      container: this.$refs.wave,
      height: 48,
      waveColor: '#4cafef',
      progressColor: '#2196f3',
      interact: false,
      rtl: true,
    });

    this.rec = this.ws.registerPlugin(
      RecordPlugin.create({
        mimeType: (() => {
          const cands = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4;codecs=pcm',
            'audio/mp4',
            'audio/wav',
          ];
          return cands.find(MediaRecorder.isTypeSupported) || '';
        })(),
        renderRecordedAudio: false,
        scrollingWaveform: true,
        scrollingWaveformWindow: 6,
      })
    );

    this.rec.on('deviceReady', () => this.$emit('deviceReady'));
    this.rec.on('deviceError', (e) => this.$emit('deviceError', e));
    this.rec.on('record-end', (blob) => {
      const ms = this.rec.getDuration(); // 録音時間はミリ秒で返るため、表示用の秒へ変換する。
      const sec = Number((ms / 1000).toFixed(1));
      this.$emit('blobReady', { blob, duration: sec });
    });
  },

  methods: {
    start() {
      if (!this.rec) return Promise.reject(new Error('Record plugin not initialised'));
      return this.rec.startRecording();
    },
    stop() {
      if (!this.rec) return Promise.resolve();
      this.rec.stopRecording();
      return Promise.resolve();
    },
  },

  beforeUnmount() {
    if (this.ws) this.ws.destroy();
  },
};
</script>

<style scoped>
.wave-canvas {
  width: 100%;
  border-radius: 4px;
  pointer-events: none; /* 波形に重なる操作ボタンをクリックできるようにする。 */
}
</style>
