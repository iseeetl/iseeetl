import { expect } from 'vitest';
import { createTimelineViewState } from '@/features/timeline/viewState';

describe('タイムラインの初期表示状態', () => {
  it('ブラウザ幅とタイムライン初期状態を生成する', () => {
    const state = createTimelineViewState({ windowObject: { innerWidth: 1024 } });

    expect(state.ui.windowWidth).to.equal(1024);
    expect(state.ui.queryFilters.active).to.equal(false);
    expect(state.timeline.filters).to.deep.equal([]);
    expect(state.infra.socketStatus).to.equal('disconnected');
    expect(state.infra.animRaf).to.equal(null);
    expect(state.infra.animationObserver).to.equal(null);
    expect(state.infra.observedAnimations).to.be.instanceOf(Set);
    expect(state.infra.observedAnimations.size).to.equal(0);
    expect(state).not.to.have.property('observedAnimations');
    expect(state.dialogs.post.edit.visible).to.equal(false);
    expect(state.dialogs.post.edit.operationToken).to.equal(null);
    expect(state.timelineAnalytics).to.deep.equal({
      tracker: null,
      pageToken: null,
      roomToken: null,
    });
  });

  it('生成した画面ごとに変更可能な状態を分離する', () => {
    const first = createTimelineViewState({ windowObject: { innerWidth: 800 } });
    const second = createTimelineViewState({ windowObject: { innerWidth: 800 } });

    first.timeline.filters.push({ id: 'filter-1' });
    first.dialogs.post.edit.presetTagIds.push('tag-1');
    first.scrollState.observers.set('column-1', {});
    first.infra.observedAnimations.add(document.createElement('div'));

    expect(second.timeline.filters).to.deep.equal([]);
    expect(second.dialogs.post.edit.presetTagIds).to.deep.equal([]);
    expect(second.scrollState.observers.size).to.equal(0);
    expect(second.infra.observedAnimations.size).to.equal(0);
    expect(second.infra.observedAnimations).not.to.equal(first.infra.observedAnimations);
  });
});
