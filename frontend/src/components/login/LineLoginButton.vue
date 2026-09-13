<template>
  <div class="oauth-block" :aria-label="$t('LINEでログイン')">
    <button type="button" class="oauth-btn line-login-btn" @click="openPopup" :aria-label="$t('LINEでログイン')">
      <span class="line-left" aria-hidden="true">
        <span class="line-icon"></span>
      </span>

      <span class="line-center">
        <span class="line-label">{{ $t('LINEでログイン') }}</span>
      </span>

      <span class="line-right" aria-hidden="true"></span>
    </button>
    <a
      ref="fallbackLink"
      data-testid="line-login-fallback"
      class="screen-reader-only"
      :href="authorizeUrl"
      tabindex="-1"
      aria-hidden="true"
    ></a>
  </div>
</template>

<script>
import { API_BASE_URL } from '@/api/apiClient';

export default {
  emits: ['error', 'success'],
  name: 'LineLoginButton',
  props: {
    lang: { type: String, default: 'en' },
    floorId: { type: String, default: '' },
    roomId: { type: String, default: '' },
    authorizePath: { type: String, default: '/api/auth/line/authorize' },
    expectedOrigin: {
      type: String,
      default: () => new URL(API_BASE_URL || window.location.origin).origin,
    },
  },
  mounted() {
    window.addEventListener('message', this.onMsg);
  },
  beforeUnmount() {
    window.removeEventListener('message', this.onMsg);
  },
  computed: {
    authorizeUrl() {
      const baseUrl = API_BASE_URL || '';
      const query = new URLSearchParams();
      query.set('lang', this.lang);
      if (typeof this.floorId === 'string' && this.floorId.trim()) query.set('floor_id', this.floorId.trim());
      if (typeof this.roomId === 'string' && this.roomId.trim()) query.set('room_id', this.roomId.trim());
      return `${baseUrl}${this.authorizePath}?${query.toString()}`;
    },
  },
  methods: {
    openPopup() {
      const url = this.authorizeUrl;
      const w = 500,
        h = 640;
      const y = window.top.outerHeight / 2 + window.top.screenY - h / 2;
      const x = window.top.outerWidth / 2 + window.top.screenX - w / 2;
      const win = window.open(
        url,
        'line_login',
        `popup=yes,width=${w},height=${h},top=${Math.max(0, y)},left=${Math.max(0, x)}`
      );
      // ポップアップを利用できない場合は、同じタブでログイン画面を開く。
      if (!win || win.closed) {
        this.$refs.fallbackLink.click();
      }
    },
    onMsg(ev) {
      if (ev.origin !== this.expectedOrigin) return;
      const { type, payload } = ev.data || {};
      if (type !== 'line-login') return;
      payload ? this.$emit('success', payload) : this.$emit('error', new Error('No payload'));
    },
  },
};
</script>

<style scoped>
.oauth-block {
  margin: 12px 0 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.oauth-btn {
  width: 280px;
  display: block;
  flex: 0 0 auto;
}

.line-login-btn {
  --h: 44px;
  --fs: 14px;
  --bubble: 24px;
  --gap: 8px;
  --pad-x: 8px;
  --radius: 8px;

  height: var(--h);
  background: #06c755;
  color: #fff;
  border: 0;
  border-radius: var(--radius);
  cursor: pointer;

  display: grid;
  grid-template-columns:
    calc(var(--pad-x) + var(--bubble) + var(--gap))
    1fr
    calc(var(--pad-x) + var(--bubble) + var(--gap));
  align-items: center;
}

.line-left {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: var(--pad-x);
  gap: var(--gap);
}

.line-icon {
  width: var(--bubble);
  height: var(--bubble);
  background: center / 34px 34px no-repeat url('/line-login/line_88.png');
}

.line-center {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 var(--bubble);
  text-align: center;
}
.line-label {
  display: inline-block;
  font-size: var(--fs);
  font-weight: 500;
  letter-spacing: 0.25px;
  line-height: 1;
  white-space: nowrap;
}

.line-right {
}

@media (hover: hover) {
  .line-login-btn:hover {
    filter: brightness(1.05);
  }
}
.line-login-btn:active {
  filter: brightness(0.95);
}
</style>
