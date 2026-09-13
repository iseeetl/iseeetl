import { config, enableAutoUnmount } from '@vue/test-utils';

config.global.config = {
  ...(config.global.config || {}),
  compilerOptions: {
    ...(config.global.config?.compilerOptions || {}),
    whitespace: 'condense',
  },
};
config.global.renderStubDefaultSlot = true;
enableAutoUnmount(afterEach);

if (!window.speechSynthesis) {
  window.speechSynthesis = {
    cancel() {},
    pause() {},
    resume() {},
    speak() {},
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
