<template>
  <div class="oauth-block" :aria-label="$t('Googleでログイン')">
    <div ref="host" class="gsi-anchor"></div>
  </div>
</template>

<script>
export default {
  emits: ['error', 'success'],
  name: 'GoogleLoginButton',
  props: {
    lang: { type: String, default: 'ja' },
    oneTap: { type: Boolean, default: false },
    clientId: { type: String, default: () => import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '' },
  },
  mounted() {
    this.render();
  },
  activated() {
    this.render();
  },
  methods: {
    ensureGsiLoaded() {
      return new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const id = 'gsi-client';
        let s = document.getElementById(id);
        if (!s) {
          s = document.createElement('script');
          s.id = id;
          s.src = `https://accounts.google.com/gsi/client?hl=${encodeURIComponent(this.lang)}`;
          s.async = true;
          s.defer = true;
          s.onload = () => resolve();
          s.onerror = (e) => reject(e);
          document.head.appendChild(s);
        } else {
          s.addEventListener('load', () => resolve(), { once: true });
          s.addEventListener('error', (e) => reject(e), { once: true });
        }
      });
    },
    async render() {
      try {
        await this.ensureGsiLoaded();
        await this.$nextTick();

        const host = this.$refs.host;
        if (!host || host.childElementCount > 0) return;

        const clientId = this.clientId.trim();
        if (!clientId) {
          const err = new Error('VITE_GOOGLE_OAUTH_CLIENT_ID が未設定です');
          err.code = 'GOOGLE_OAUTH_CLIENT_ID_MISSING';
          this.$emit('error', err);
          console.error(err);
          return;
        }

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            if (credential) this.$emit('success', credential);
            else this.$emit('error', new Error('No credential'));
          },
          ux_mode: 'popup',
        });

        const opts = {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          logo_alignment: 'left',
          shape: 'rectangular',
          locale: this.lang,
          width: 280,
        };

        window.google.accounts.id.renderButton(host, opts);

        if (this.oneTap) {
          window.google.accounts.id.prompt();
        }
      } catch (e) {
        this.$emit('error', e);
        console.error('GSI init/render failed:', e);
      }
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
  overflow: visible;
}

.gsi-anchor {
  overflow: visible;
}
</style>

<style>
/* 共通のiframeの最大幅を上書きし、縮小によって右端が欠けるのを防ぐ。 */
.oauth-block iframe {
  max-width: none !important;
}
</style>
