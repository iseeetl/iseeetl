import Velocity from 'velocity-animate';
import 'velocity-animate/velocity.ui';

const getLocalEnableTextAnimation = (ctx) => {
  if (ctx.ui && typeof ctx.ui.localEnableTextAnimation !== 'undefined') {
    return ctx.ui.localEnableTextAnimation;
  }
  return ctx.localEnableTextAnimation;
};

const ensureAnimItems = (ctx) => {
  if (ctx.timeline) {
    if (!ctx.timeline.animatingItems) {
      ctx.timeline.animatingItems = {};
    }
    return ctx.timeline.animatingItems;
  }
  if (!ctx.animatingItems) {
    ctx.animatingItems = {};
  }
  return ctx.animatingItems;
};

const isAnimationEnabled = (ctx) => {
  if (typeof ctx.effectiveAnimationEnabled === 'boolean') return ctx.effectiveAnimationEnabled;
  return ctx.$store?.getters?.enableTextAnimation === true && getLocalEnableTextAnimation(ctx) === true;
};

const setRunningState = (animatingItems, animationElement, running) => {
  const columnIndex = animationElement.dataset.columnIndex;
  if (typeof columnIndex === 'undefined') return;
  if (!animatingItems[columnIndex]) animatingItems[columnIndex] = {};
  const itemId = animationElement.dataset.postId || animationElement.dataset.replyId;
  if (itemId) animatingItems[columnIndex][itemId] = running;
};

const resetAnimationElement = (animatingItems, animationElement) => {
  Velocity(animationElement, 'stop');
  animationElement._paused = false;
  animationElement.removeAttribute('style');
  animationElement.classList.remove('animation-active');
  animationElement.classList.remove('animation-complete');
  setRunningState(animatingItems, animationElement, false);
};

const moveFocusBeforeCompletion = (animationElement) => {
  const wrapper = animationElement.parentElement;
  if (!wrapper?.contains(document.activeElement)) return;
  const column = animationElement.closest('.timeline-inner');
  const scrollToTopButton = column?.querySelector('.timeline-scroll-to-top-button');
  scrollToTopButton?.focus();
};

export const resetDisabledAnimations = (ctx) => {
  const root = ctx.$el;
  if (!root) return;
  const animatingItems = ensureAnimItems(ctx);
  root.querySelectorAll('.animation').forEach((animationElement) => {
    resetAnimationElement(animatingItems, animationElement);
  });
};

export const queueUpdateAnimationObserver = (ctx) => {
  if (ctx.infra.animRaf !== null) {
    cancelAnimationFrame(ctx.infra.animRaf);
    ctx.infra.animRaf = null;
  }
  ctx.infra.animRaf = requestAnimationFrame(() => {
    updateAnimationObserver(ctx);
    ctx.infra.animRaf = null;
  });
};

export const setupAnimationObserver = (ctx) => {
  const animatingItems = ensureAnimItems(ctx);
  if (ctx.infra.animationObserver) {
    ctx.infra.animationObserver.disconnect();
    ctx.infra.observedAnimations.clear();
  }

  const handleIntersection = (entries) => {
    entries.forEach((entry) => {
      const animationElement = entry.target;

      if (entry.isIntersecting) {
        if (
          !animationElement.classList.contains('animation-active') &&
          !animationElement.classList.contains('animation-complete')
        ) {
          const ownerColumn = animationElement.closest('.column');
          const targetWidth = ownerColumn ? ownerColumn.clientWidth : 0;
          if (!targetWidth) return;

          const startX = targetWidth;
          const endX = -animationElement.offsetWidth;

          const selectedSpeed = ctx.$store.getters.animationSpeed;
          const animationDuration = ctx.getAnimationDuration(selectedSpeed);

          const sequence = [
            {
              e: animationElement,
              p: { opacity: 1 },
              o: {
                duration: 750,
                begin: () => {
                  animationElement._paused = false;
                  setRunningState(animatingItems, animationElement, true);
                },
              },
            },
            {
              e: animationElement,
              p: { translateX: endX },
              o: { duration: animationDuration, delay: 200, easing: 'linear' },
            },
            { e: animationElement, p: { opacity: 0 } },
            { e: animationElement, p: { translateX: startX } },
            { e: animationElement, p: { opacity: 1 }, o: { duration: 750 } },
            {
              e: animationElement,
              p: { translateX: endX },
              o: { duration: animationDuration, delay: 200, easing: 'linear' },
            },
            { e: animationElement, p: { opacity: 0 } },
            { e: animationElement, p: { translateX: startX } },
            { e: animationElement, p: { opacity: 1 }, o: { duration: 750 } },
            {
              e: animationElement,
              p: { translateX: endX },
              o: { duration: animationDuration, delay: 200, easing: 'linear' },
            },
            { e: animationElement, p: { opacity: 0 } },
            { e: animationElement, p: { translateX: 0 }, o: { duration: 0 } },
            {
              e: animationElement,
              p: { opacity: 0 },
              o: {
                complete: () => {
                  moveFocusBeforeCompletion(animationElement);
                  setRunningState(animatingItems, animationElement, false);
                  animationElement._paused = false;
                  animationElement.classList.remove('animation-active');
                  animationElement.classList.add('animation-complete');
                },
              },
            },
          ];

          if (isAnimationEnabled(ctx)) {
            animationElement.classList.add('animation-active');
            Velocity(animationElement, { translateX: startX }, { duration: 0 });
            Velocity.RunSequence(sequence);
          } else {
            resetAnimationElement(animatingItems, animationElement);
          }
        }
      } else if (animationElement.classList.contains('animation-complete')) {
        animationElement.classList.remove('animation-complete');
        animationElement._paused = false;
        setRunningState(animatingItems, animationElement, false);
      }
    });
  };

  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0,
  };

  ctx.infra.animationObserver = new IntersectionObserver(handleIntersection, observerOptions);
  updateAnimationObserver(ctx);
};

export const updateAnimationObserver = (ctx) => {
  if (!ctx.infra.animationObserver) return;

  ctx.infra.animationObserver.disconnect();
  ctx.infra.observedAnimations.clear();

  const root = ctx.$el || document;
  const current = Array.from(root.querySelectorAll('.animation'));

  current.forEach((el) => {
    if (!ctx.infra.observedAnimations.has(el)) {
      if (!el.dataset.columnIndex) {
        const timelineInner = el.closest('.timeline-inner');
        if (timelineInner) {
          const m = timelineInner.id.match(/^timeline-inner-(\d+)$/);
          if (m) el.dataset.columnIndex = m[1];
        }
      }
      ctx.infra.animationObserver.observe(el);
      ctx.infra.observedAnimations.add(el);
    }
  });
};

export const toggleAnimation = (ctx, animationElement) => {
  if (!animationElement || !isAnimationEnabled(ctx) || animationElement.classList.contains('animation-complete')) {
    return;
  }
  const animatingItems = ensureAnimItems(ctx);
  const columnIndex = animationElement.dataset.columnIndex;
  const postId = animationElement.dataset.postId;
  const replyId = animationElement.dataset.replyId;
  const itemId = postId || replyId;
  const isRunning = itemId && animatingItems[columnIndex]?.[itemId] === true;
  if (isRunning) {
    Velocity(animationElement, 'pause');
    animationElement._paused = true;
    setRunningState(animatingItems, animationElement, false);
  } else if (animationElement._paused === true) {
    Velocity(animationElement, 'resume');
    animationElement._paused = false;
    setRunningState(animatingItems, animationElement, true);
  }
};

export const setupTimelineContentObserver = ({ rootEl, onTimelineContent }) => {
  if (!rootEl) return null;

  const viewContent = rootEl.querySelector('.view-content');
  if (!viewContent) return null;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node && node.classList && node.classList.contains('timeline-content')) {
          onTimelineContent?.(node);
        }
        if (node && node.querySelectorAll) {
          node.querySelectorAll('.timeline-content').forEach((el) => onTimelineContent?.(el));
        }
      });
    });
  });

  observer.observe(viewContent, {
    childList: true,
    subtree: true,
  });

  viewContent.querySelectorAll('.timeline-content').forEach((el) => onTimelineContent?.(el));
  return observer;
};

const ensureScrollState = (scrollState) => {
  if (!scrollState) return null;
  if (!scrollState.observers) scrollState.observers = new Map();
  if (!scrollState.observedSentinels) scrollState.observedSentinels = new WeakSet();
  return scrollState;
};

export const setupScrollIntersectionObserver = ({ scrollState, timelineContent, getColumnIndex, onReachEnd }) => {
  const state = ensureScrollState(scrollState);
  if (!state || !timelineContent) return null;

  let io = state.observers.get(timelineContent);
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = typeof getColumnIndex === 'function' ? getColumnIndex(entry.target, timelineContent) : null;
          if (typeof onReachEnd === 'function') {
            onReachEnd(idx);
          }
        });
      },
      { root: timelineContent, rootMargin: '0px', threshold: 1.0 }
    );
    state.observers.set(timelineContent, io);
  }
  return io;
};

const getTimelineContentElByIndex = (rootEl, index) => {
  return rootEl?.querySelector(`.timeline-content[data-column-index="${index}"]`) || null;
};

export const enableAutoLoad = ({ scrollState, rootEl, index }) => {
  const state = ensureScrollState(scrollState);
  if (!state) return;
  const content = getTimelineContentElByIndex(rootEl, index);
  if (!content) return;
  const io = state.observers.get(content);
  const sentinel = content.querySelector('.scroll-sentinel');
  if (io && sentinel && !state.observedSentinels.has(sentinel)) {
    io.observe(sentinel);
    state.observedSentinels.add(sentinel);
  }
};

export const disableAutoLoad = ({ scrollState, rootEl, index }) => {
  const state = ensureScrollState(scrollState);
  if (!state) return;
  const content = getTimelineContentElByIndex(rootEl, index);
  if (!content) return;
  const io = state.observers.get(content);
  const sentinel = content.querySelector('.scroll-sentinel');
  if (io && sentinel && state.observedSentinels.has(sentinel)) {
    io.unobserve(sentinel);
    state.observedSentinels.delete(sentinel);
  }
};

export const reevaluateAutoLoad = ({ scrollState, rootEl, index, isNoMore }) => {
  const state = ensureScrollState(scrollState);
  if (!state) return;
  if (isNoMore) {
    disableAutoLoad({ scrollState: state, rootEl, index });
    return;
  }
  const el = getTimelineContentElByIndex(rootEl, index);
  if (!el) return;
  if (el.scrollHeight > el.clientHeight) enableAutoLoad({ scrollState: state, rootEl, index });
  else disableAutoLoad({ scrollState: state, rootEl, index });
};
