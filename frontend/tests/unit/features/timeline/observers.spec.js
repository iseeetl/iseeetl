import { expect } from 'vitest';
import Velocity from 'velocity-animate';
import {
  queueUpdateAnimationObserver,
  resetDisabledAnimations,
  setupAnimationObserver,
  setupTimelineContentObserver,
  setupScrollIntersectionObserver,
  toggleAnimation,
  updateAnimationObserver,
  enableAutoLoad,
  disableAutoLoad,
  reevaluateAutoLoad,
} from '@/features/timeline/observers';

describe('タイムラインの表示とスクロールの監視', () => {
  it('setupTimelineContentObserver はroot要素が無い場合にnullを返す', () => {
    const result = setupTimelineContentObserver({ rootEl: null, onTimelineContent: () => {} });
    expect(result).to.equal(null);
  });

  it('queueUpdateAnimationObserver は既存RAFをキャンセルして更新する', () => {
    const originalRaf = global.requestAnimationFrame;
    const originalCaf = global.cancelAnimationFrame;

    const canceledIds = [];
    const rafCallbacks = [];
    let nextRafId = 10;
    global.cancelAnimationFrame = (id) => canceledIds.push(id);
    global.requestAnimationFrame = (cb) => {
      rafCallbacks.push(cb);
      return nextRafId++;
    };

    const rootEl = document.createElement('div');
    const anim = document.createElement('div');
    anim.className = 'animation';
    rootEl.appendChild(anim);

    let disconnected = 0;
    let observed = 0;
    const ctx = {
      $el: rootEl,
      infra: {
        animRaf: null,
        observedAnimations: new Set(),
        animationObserver: {
          disconnect: () => {
            disconnected += 1;
          },
          observe: () => {
            observed += 1;
          },
        },
      },
    };

    queueUpdateAnimationObserver(ctx);
    expect(ctx.infra.animRaf).to.equal(10);

    queueUpdateAnimationObserver(ctx);

    expect(canceledIds).to.deep.equal([10]);
    expect(ctx.infra.animRaf).to.equal(11);

    rafCallbacks[1]();

    expect(disconnected).to.equal(1);
    expect(observed).to.equal(1);
    expect(ctx.infra.animRaf).to.equal(null);
    expect(ctx).not.to.have.property('animRaf');
    expect(ctx).not.to.have.property('animationObserver');
    expect(ctx).not.to.have.property('observedAnimations');

    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCaf;
  });

  it('setupAnimationObserver はアニメ無効時に完了フラグを設定する', () => {
    const originalObserver = global.IntersectionObserver;
    let observerCallback = null;

    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const rootEl = document.createElement('div');
    const column = document.createElement('div');
    column.className = 'column';
    Object.defineProperty(column, 'clientWidth', { value: 120 });
    const anim = document.createElement('div');
    anim.className = 'animation';
    Object.defineProperty(anim, 'offsetWidth', { value: 20 });
    anim.dataset.columnIndex = '0';
    anim.dataset.postId = 'post-1';
    column.appendChild(anim);
    rootEl.appendChild(column);

    const ctx = {
      $el: rootEl,
      $store: { getters: { enableTextAnimation: false, animationSpeed: 'normal' } },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
      getAnimationDuration: () => 1000,
      ui: { localEnableTextAnimation: true },
      timeline: { animatingItems: {} },
      infra: { animationObserver: null, observedAnimations: new Set() },
    };

    setupAnimationObserver(ctx);
    observerCallback([{ isIntersecting: true, target: anim }]);

    expect(ctx.timeline.animatingItems['0']['post-1']).to.equal(false);

    global.IntersectionObserver = originalObserver;
  });

  it('setupAnimationObserver はアニメ有効時にクラスを付与する', () => {
    const originalObserver = global.IntersectionObserver;
    let observerCallback = null;
    const originalRunSequence = Velocity.RunSequence;

    Velocity.RunSequence = () => {};
    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const rootEl = document.createElement('div');
    const column = document.createElement('div');
    column.className = 'column';
    Object.defineProperty(column, 'clientWidth', { value: 120 });
    const anim = document.createElement('div');
    anim.className = 'animation';
    Object.defineProperty(anim, 'offsetWidth', { value: 20 });
    anim.dataset.columnIndex = '0';
    anim.dataset.postId = 'post-1';
    column.appendChild(anim);
    rootEl.appendChild(column);

    const ctx = {
      $el: rootEl,
      $store: { getters: { enableTextAnimation: true, animationSpeed: 'normal' } },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
      getAnimationDuration: () => 1000,
      ui: { localEnableTextAnimation: true },
      timeline: { animatingItems: {} },
      infra: { animationObserver: null, observedAnimations: new Set() },
    };

    setupAnimationObserver(ctx);
    observerCallback([{ isIntersecting: true, target: anim }]);

    expect(anim.classList.contains('animation-active')).to.equal(true);

    Velocity.RunSequence = originalRunSequence;
    global.IntersectionObserver = originalObserver;
  });

  it.each([
    { name: '流す投稿', datasetKey: 'postId' },
    { name: '流す返信', datasetKey: 'replyId' },
  ])('$nameは3回の移動を終え、画面外へ出てから再進入すると再び3回移動する', ({ datasetKey }) => {
    const originalObserver = global.IntersectionObserver;
    let observerCallback = null;
    const originalRunSequence = Velocity.RunSequence;
    const animationStates = [];
    const sequences = [];
    let ctx;

    Velocity.RunSequence = (sequence) => {
      sequences.push(sequence);
      const first = sequence[0];
      if (first && first.o && first.o.begin) first.o.begin();
      animationStates.push(ctx.timeline.animatingItems['0']['post-1']);
      const last = sequence[sequence.length - 1];
      if (last && last.o && last.o.complete) last.o.complete();
      animationStates.push(ctx.timeline.animatingItems['0']['post-1']);
    };

    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const rootEl = document.createElement('div');
    const column = document.createElement('div');
    column.className = 'column';
    Object.defineProperty(column, 'clientWidth', { value: 120 });
    const anim = document.createElement('div');
    anim.className = 'animation';
    Object.defineProperty(anim, 'offsetWidth', { value: 20 });
    anim.dataset.columnIndex = '0';
    anim.dataset[datasetKey] = 'post-1';
    column.appendChild(anim);
    rootEl.appendChild(column);

    ctx = {
      $el: rootEl,
      $store: { getters: { enableTextAnimation: true, animationSpeed: 'normal' } },
      getAnimationDuration: () => 1000,
      ui: { localEnableTextAnimation: true },
      timeline: { animatingItems: {} },
      infra: { animationObserver: null, observedAnimations: new Set() },
    };

    setupAnimationObserver(ctx);
    observerCallback([{ isIntersecting: true, target: anim }]);

    try {
      expect(animationStates).to.deep.equal([true, false]);
      expect(anim.classList.contains('animation-complete')).to.equal(true);
      expect(sequences[0].filter((step) => step.p.translateX === -20)).to.have.lengthOf(3);

      updateAnimationObserver(ctx);
      observerCallback([{ isIntersecting: true, target: anim }]);
      expect(sequences).to.have.lengthOf(1);

      observerCallback([{ isIntersecting: false, target: anim }]);
      expect(anim.classList.contains('animation-complete')).to.equal(false);
      observerCallback([{ isIntersecting: true, target: anim }]);

      expect(sequences).to.have.lengthOf(2);
      expect(sequences[1].filter((step) => step.p.translateX === -20)).to.have.lengthOf(3);
      expect(animationStates).to.deep.equal([true, false, true, false]);
      expect(anim.classList.contains('animation-complete')).to.equal(true);
    } finally {
      Velocity(anim, 'stop');
      Velocity.RunSequence = originalRunSequence;
      global.IntersectionObserver = originalObserver;
    }
  });

  it('setupAnimationObserver は既存Observerを再初期化する', () => {
    const originalObserver = global.IntersectionObserver;
    let disconnectCalled = false;

    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor() {}
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const ctx = {
      $el: document.createElement('div'),
      $store: { getters: { enableTextAnimation: false, animationSpeed: 'normal' } },
      $set: () => {},
      getAnimationDuration: () => 1000,
      ui: { localEnableTextAnimation: true },
      timeline: { animatingItems: {} },
      infra: {
        observedAnimations: new Set([document.createElement('div')]),
        animationObserver: {
          disconnect: () => {
            disconnectCalled = true;
          },
        },
      },
    };

    const previousObserver = ctx.infra.animationObserver;
    setupAnimationObserver(ctx);

    expect(disconnectCalled).to.equal(true);
    expect(ctx.infra.observedAnimations.size).to.equal(0);
    expect(ctx.infra.animationObserver).not.to.equal(previousObserver);

    global.IntersectionObserver = originalObserver;
  });

  it('setupTimelineContentObserver はview-contentが無い場合にnullを返す', () => {
    const rootEl = document.createElement('div');
    const result = setupTimelineContentObserver({ rootEl, onTimelineContent: () => {} });
    expect(result).to.equal(null);
  });

  it('setupTimelineContentObserver は既存要素と追加要素を通知する', () => {
    const originalObserver = global.MutationObserver;
    let observerCallback = null;

    global.MutationObserver = class FakeMutationObserver {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    };

    const rootEl = document.createElement('div');
    const viewContent = document.createElement('div');
    viewContent.className = 'view-content';
    const existing = document.createElement('div');
    existing.className = 'timeline-content';
    viewContent.appendChild(existing);
    rootEl.appendChild(viewContent);

    const notified = [];
    const observer = setupTimelineContentObserver({ rootEl, onTimelineContent: (node) => notified.push(node) });

    expect(observer).to.not.equal(null);
    expect(notified).to.deep.equal([existing]);

    const added = document.createElement('div');
    added.className = 'timeline-content';
    observerCallback([{ addedNodes: [added] }]);

    expect(notified).to.deep.equal([existing, added]);

    global.MutationObserver = originalObserver;
  });

  it('setupScrollIntersectionObserver は必須要素が無い場合にnullを返す', () => {
    const result = setupScrollIntersectionObserver({
      scrollState: null,
      timelineContent: null,
      getColumnIndex: () => 0,
      onReachEnd: () => {},
    });
    expect(result).to.equal(null);
  });

  it('updateAnimationObserver は columnIndex を補完する', () => {
    const rootEl = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = 'timeline-inner';
    inner.id = 'timeline-inner-2';
    const anim = document.createElement('div');
    anim.className = 'animation';
    inner.appendChild(anim);
    rootEl.appendChild(inner);

    let observed = 0;
    const ctx = {
      $el: rootEl,
      infra: {
        observedAnimations: new Set(),
        animationObserver: {
          disconnect: () => {},
          observe: () => {
            observed += 1;
          },
        },
      },
    };

    updateAnimationObserver(ctx);

    expect(anim.dataset.columnIndex).to.equal('2');
    expect(observed).to.equal(1);
  });

  it('setupAnimationObserver は完了クラスを解除する', () => {
    const originalObserver = global.IntersectionObserver;
    let observerCallback = null;

    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const rootEl = document.createElement('div');
    const anim = document.createElement('div');
    anim.className = 'animation animation-complete';
    anim._paused = true;
    rootEl.appendChild(anim);

    const ctx = {
      $el: rootEl,
      $store: { getters: { enableTextAnimation: false, animationSpeed: 'normal' } },
      $set: () => {},
      getAnimationDuration: () => 1000,
      ui: { localEnableTextAnimation: false },
      timeline: { animatingItems: {} },
      infra: { animationObserver: null, observedAnimations: new Set() },
    };

    setupAnimationObserver(ctx);
    observerCallback([{ isIntersecting: false, target: anim }]);

    expect(anim.classList.contains('animation-complete')).to.equal(false);
    expect(anim._paused).to.equal(false);

    global.IntersectionObserver = originalObserver;
  });

  it('アニメーション完了時に本文内へフォーカスがあれば同じカラムのタイトルへ戻す', () => {
    const originalObserver = global.IntersectionObserver;
    const originalRunSequence = Velocity.RunSequence;
    let observerCallback = null;
    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    };
    Velocity.RunSequence = (sequence) => {
      sequence[0].o.begin();
      sequence.at(-1).o.complete();
    };

    const timelineInner = document.createElement('div');
    timelineInner.className = 'timeline-inner';
    const column = document.createElement('div');
    column.className = 'column';
    Object.defineProperty(column, 'clientWidth', { value: 120 });
    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper';
    const animation = document.createElement('div');
    animation.className = 'animation';
    animation.dataset.columnIndex = '0';
    animation.dataset.postId = 'post-1';
    Object.defineProperty(animation, 'offsetWidth', { value: 20 });
    const pauseButton = document.createElement('button');
    const title = document.createElement('h2');
    const scrollButton = document.createElement('button');
    scrollButton.className = 'timeline-scroll-to-top-button';
    title.appendChild(scrollButton);
    wrapper.append(animation, pauseButton);
    column.append(title, wrapper);
    timelineInner.appendChild(column);
    document.body.appendChild(timelineInner);
    pauseButton.focus();

    try {
      const ctx = {
        $el: timelineInner,
        effectiveAnimationEnabled: true,
        $store: { getters: { animationSpeed: 'normal' } },
        getAnimationDuration: () => 1000,
        timeline: { animatingItems: {} },
        infra: { animationObserver: null, observedAnimations: new Set() },
      };
      setupAnimationObserver(ctx);
      observerCallback([{ isIntersecting: true, target: animation }]);

      expect(document.activeElement).to.equal(scrollButton);
      expect(ctx.timeline.animatingItems[0]['post-1']).to.equal(false);
      expect(animation.classList.contains('animation-complete')).to.equal(true);
    } finally {
      timelineInner.remove();
      Velocity.RunSequence = originalRunSequence;
      global.IntersectionObserver = originalObserver;
    }
  });

  it('setupScrollIntersectionObserver は交差時にonReachEndを呼ぶ', () => {
    const originalObserver = global.IntersectionObserver;
    let observerCallback = null;

    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
      unobserve() {}
    };

    const scrollState = { observers: new Map(), observedSentinels: new WeakSet() };
    const timelineContent = document.createElement('div');
    const calls = [];

    const observer = setupScrollIntersectionObserver({
      scrollState,
      timelineContent,
      getColumnIndex: () => 2,
      onReachEnd: (idx) => calls.push(idx),
    });

    expect(observer).to.equal(scrollState.observers.get(timelineContent));

    observerCallback([{ isIntersecting: true, target: document.createElement('div') }]);

    expect(calls).to.deep.equal([2]);

    global.IntersectionObserver = originalObserver;
  });

  it('toggleAnimation は pause/resume を切り替える', () => {
    const anim = document.createElement('div');
    anim.dataset.columnIndex = '1';
    anim.dataset.postId = 'p1';

    const ctx = {
      effectiveAnimationEnabled: true,
      timeline: { animatingItems: { 1: { p1: true } } },
      $set: (obj, key, value) => {
        obj[key] = value;
      },
    };

    toggleAnimation(ctx, anim);
    expect(anim._paused).to.equal(true);
    expect(ctx.timeline.animatingItems['1'].p1).to.equal(false);

    toggleAnimation(ctx, anim);
    expect(anim._paused).to.equal(false);
    expect(ctx.timeline.animatingItems['1'].p1).to.equal(true);
  });

  it('toggleAnimation は開始前、無効、完了状態でpausedを作らない', () => {
    const createAnimation = () => {
      const element = document.createElement('div');
      element.dataset.columnIndex = '0';
      element.dataset.postId = 'post-1';
      return element;
    };
    const waiting = createAnimation();
    toggleAnimation({ effectiveAnimationEnabled: true, timeline: { animatingItems: {} } }, waiting);
    expect(waiting._paused).to.equal(undefined);

    const disabled = createAnimation();
    toggleAnimation(
      { effectiveAnimationEnabled: false, timeline: { animatingItems: { 0: { 'post-1': true } } } },
      disabled
    );
    expect(disabled._paused).to.equal(undefined);

    const complete = createAnimation();
    complete.classList.add('animation-complete');
    toggleAnimation(
      { effectiveAnimationEnabled: true, timeline: { animatingItems: { 0: { 'post-1': true } } } },
      complete
    );
    expect(complete._paused).to.equal(undefined);
  });

  it('resetDisabledAnimations はVelocity、style、class、paused、runningを静止状態へ戻す', () => {
    const root = document.createElement('div');
    const animation = document.createElement('div');
    animation.className = 'animation animation-active animation-complete';
    animation.dataset.columnIndex = '0';
    animation.dataset.replyId = 'reply-1';
    animation._paused = true;
    animation.style.opacity = '0.5';
    root.appendChild(animation);
    const ctx = {
      $el: root,
      timeline: { animatingItems: { 0: { 'reply-1': true } } },
    };

    resetDisabledAnimations(ctx);

    expect(animation._paused).to.equal(false);
    expect(animation.hasAttribute('style')).to.equal(false);
    expect(animation.classList.contains('animation-active')).to.equal(false);
    expect(animation.classList.contains('animation-complete')).to.equal(false);
    expect(ctx.timeline.animatingItems[0]['reply-1']).to.equal(false);
  });

  it('enableAutoLoad はセンチネルを監視する', () => {
    const rootEl = document.createElement('div');
    const content = document.createElement('div');
    content.className = 'timeline-content';
    content.dataset.columnIndex = '0';
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    content.appendChild(sentinel);
    rootEl.appendChild(content);

    let observeCalls = 0;
    const io = {
      observe: () => {
        observeCalls += 1;
      },
    };
    const scrollState = { observers: new Map(), observedSentinels: new WeakSet() };
    scrollState.observers.set(content, io);

    enableAutoLoad({ scrollState, rootEl, index: 0 });

    expect(observeCalls).to.equal(1);
    expect(scrollState.observedSentinels.has(sentinel)).to.equal(true);
  });

  it('disableAutoLoad はセンチネルの監視を解除する', () => {
    const rootEl = document.createElement('div');
    const content = document.createElement('div');
    content.className = 'timeline-content';
    content.dataset.columnIndex = '0';
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    content.appendChild(sentinel);
    rootEl.appendChild(content);

    let unobserveCalls = 0;
    const io = {
      unobserve: () => {
        unobserveCalls += 1;
      },
    };
    const scrollState = { observers: new Map(), observedSentinels: new WeakSet([sentinel]) };
    scrollState.observers.set(content, io);

    disableAutoLoad({ scrollState, rootEl, index: 0 });

    expect(unobserveCalls).to.equal(1);
    expect(scrollState.observedSentinels.has(sentinel)).to.equal(false);
  });

  it('reevaluateAutoLoad はnoMoreなら監視を解除する', () => {
    const rootEl = document.createElement('div');
    const content = document.createElement('div');
    content.className = 'timeline-content';
    content.dataset.columnIndex = '0';
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    content.appendChild(sentinel);
    rootEl.appendChild(content);

    let unobserveCalls = 0;
    const io = {
      unobserve: () => {
        unobserveCalls += 1;
      },
    };
    const scrollState = { observers: new Map(), observedSentinels: new WeakSet([sentinel]) };
    scrollState.observers.set(content, io);

    reevaluateAutoLoad({ scrollState, rootEl, index: 0, isNoMore: true });

    expect(unobserveCalls).to.equal(1);
    expect(scrollState.observedSentinels.has(sentinel)).to.equal(false);
  });
});
