import { expect } from 'vitest';
import { createTimelineLifecycleGuard } from '@/features/timeline/lifecycleGuard';
import { disposeTimelineView } from '@/features/timeline/viewLifecycle';
import { beginPlannedPageLeave, resetPlannedPageLeave } from '@/utils/plannedPageLeave';
import { queueUpdateAnimationObserver, setupAnimationObserver } from '@/features/timeline/observers';

describe('タイムラインの処理世代と画面破棄', () => {
  afterEach(() => resetPlannedPageLeave());

  it('現在の処理世代のリクエストだけを有効として扱う', () => {
    const lifecycle = createTimelineLifecycleGuard();
    const infra = { timelineDisposed: false, timelineLifecycleGeneration: 2 };

    expect(lifecycle.capture(infra)).to.equal(2);
    expect(lifecycle.isCurrent(infra, 2)).to.equal(true);
    expect(lifecycle.canApplyRequest(infra, 2)).to.equal(true);
    expect(lifecycle.isCurrent(infra, 1)).to.equal(false);
  });

  it('画面離脱開始後とinvalidate後の応答を無視する', () => {
    const lifecycle = createTimelineLifecycleGuard();
    const infra = { timelineDisposed: false, timelineLifecycleGeneration: 0 };

    beginPlannedPageLeave();
    expect(lifecycle.canApplyRequest(infra, 0)).to.equal(false);
    resetPlannedPageLeave();

    lifecycle.invalidate(infra);
    expect(infra.timelineDisposed).to.equal(true);
    expect(infra.timelineLifecycleGeneration).to.equal(1);
    expect(lifecycle.shouldIgnoreRequestError(infra, new Error('late'), 0)).to.equal(true);
  });

  it('画面破棄時はlifecycleを無効化してからSocketを切断する', () => {
    const originalSpeechSynthesis = window.speechSynthesis;
    const events = [];
    const context = {
      infra: {
        animationObserver: null,
        observedAnimations: new Set(),
        timelineContentObserver: null,
        animRaf: null,
      },
      room: {},
      scrollState: { observers: new Map() },
      shortcutPushNkey() {},
      handleResize: null,
      $i18n: { locale: 'ja' },
      $store: { getters: { lang: 'ja' } },
      invalidateTimelineLifecycle: () => events.push('lifecycle-invalidate'),
      clearTimelineAnalytics: () => events.push('analytics-clear'),
    };

    window.speechSynthesis = { cancel() {} };

    try {
      disposeTimelineView(context, {
        disposeSocket: () => events.push('socket-disconnect'),
      });
    } finally {
      window.speechSynthesis = originalSpeechSynthesis;
    }

    expect(events).to.deep.equal([
      'lifecycle-invalidate',
      'analytics-clear',
      'socket-disconnect',
    ]);
  });

  it('初期化と更新で作成したアニメーション資源を重複せず1回だけ破棄する', () => {
    const originalObserver = global.IntersectionObserver;
    const originalRaf = global.requestAnimationFrame;
    const originalCaf = global.cancelAnimationFrame;
    const originalSpeechSynthesis = window.speechSynthesis;
    const canceledRafIds = [];

    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor() {
        this.disconnectCount = 0;
      }
      observe() {}
      disconnect() {
        this.disconnectCount += 1;
      }
    };
    global.requestAnimationFrame = () => 31;
    global.cancelAnimationFrame = (id) => canceledRafIds.push(id);
    window.speechSynthesis = { cancel() {} };

    const context = {
      $el: document.createElement('div'),
      $store: { getters: { animationSpeed: 'normal', lang: 'ja' } },
      getAnimationDuration: () => 1000,
      timeline: { animatingItems: {} },
      infra: {
        animationObserver: null,
        observedAnimations: new Set(),
        timelineContentObserver: null,
        animRaf: null,
      },
      scrollState: { observers: new Map() },
      shortcutPushNkey() {},
      handleResize: null,
      $i18n: { locale: 'ja' },
      invalidateTimelineLifecycle() {},
    };

    try {
      setupAnimationObserver(context);
      const createdObserver = context.infra.animationObserver;
      const disconnectCountBeforeDispose = createdObserver.disconnectCount;
      context.infra.observedAnimations.add(document.createElement('div'));
      queueUpdateAnimationObserver(context);
      const createdRafId = context.infra.animRaf;

      disposeTimelineView(context, { disposeSocket() {} });

      expect(canceledRafIds).to.deep.equal([createdRafId]);
      expect(createdObserver.disconnectCount).to.equal(disconnectCountBeforeDispose + 1);
      expect(context.infra.animRaf).to.equal(null);
      expect(context.infra.animationObserver).to.equal(null);
      expect(context.infra.observedAnimations.size).to.equal(0);

      disposeTimelineView(context, { disposeSocket() {} });

      expect(canceledRafIds).to.deep.equal([createdRafId]);
      expect(createdObserver.disconnectCount).to.equal(disconnectCountBeforeDispose + 1);
    } finally {
      global.IntersectionObserver = originalObserver;
      global.requestAnimationFrame = originalRaf;
      global.cancelAnimationFrame = originalCaf;
      window.speechSynthesis = originalSpeechSynthesis;
    }
  });
});
