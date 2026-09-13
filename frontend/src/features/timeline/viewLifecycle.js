export const mountTimelineView = (context) => {
  context.handleResize = context.checkMobile.bind(context);
  window.addEventListener('resize', context.handleResize);
  document.addEventListener('keyup', context.shortcutPushNkey);
  context.setupAnimationObserver();
};

export const disposeTimelineView = (context, { disposeSocket }) => {
  context.invalidateTimelineLifecycle();
  context.clearTimelineAnalytics?.();
  context.timelineResourcesReady = false;
  disposeSocket(context);

  document.removeEventListener('keyup', context.shortcutPushNkey);
  window.speechSynthesis.cancel();

  if (context.handleResize) {
    window.removeEventListener('resize', context.handleResize);
    context.handleResize = null;
  }
  if (context.infra.animationObserver) {
    context.infra.animationObserver.disconnect();
    context.infra.animationObserver = null;
  }
  context.infra.observedAnimations.clear();
  if (context.infra.timelineContentObserver) context.infra.timelineContentObserver.disconnect();
  if (context.scrollState?.observers) {
    context.scrollState.observers.forEach((observer) => observer.disconnect());
    context.scrollState.observers.clear();
  }
  if (context.$i18n.locale !== context.$store.getters.lang) {
    context.$i18n.locale = context.$store.getters.lang;
  }
  if (context.infra.animRaf !== null) {
    cancelAnimationFrame(context.infra.animRaf);
    context.infra.animRaf = null;
  }
};
