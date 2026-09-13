import { createApp } from 'vue';

import ChunkLoadRecovery from '@/components/app/ChunkLoadRecovery.vue';
import { createChunkLoadRecovery } from '@/features/chunkLoadRecovery';

export const startApplication = ({
  application,
  createRecoveryApp = createApp,
  createChunkLoadRecoveryImpl = createChunkLoadRecovery,
  documentObject = globalThis.document,
} = {}) => {
  let recoveryApplication = null;
  const chunkLoadRecovery = createChunkLoadRecoveryImpl({
    onRecoveryRequired: ({ reason, retry }) => {
      if (recoveryApplication || !documentObject?.body) return;
      const container = documentObject.createElement('div');
      container.id = 'chunk-load-recovery';
      documentObject.body.appendChild(container);
      recoveryApplication = createRecoveryApp(ChunkLoadRecovery, {
        reason,
        onRetry: retry,
      });
      recoveryApplication.use(application.i18n);
      recoveryApplication.mount(container);
    },
  });

  chunkLoadRecovery.install();

  const startPromise = documentObject?.querySelector('#app')
    ? application.start().then(() => {
        chunkLoadRecovery.markApplicationReady();
      })
    : null;

  return { chunkLoadRecovery, startPromise };
};
