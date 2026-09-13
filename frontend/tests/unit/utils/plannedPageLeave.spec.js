import { expect } from 'vitest';
import {
  beginPlannedPageLeave,
  isExplicitRequestCancellation,
  isPlannedPageLeave,
  resetPlannedPageLeave,
  shouldBeginPlannedPageLeaveForClick,
  shouldIgnorePageLeaveError,
} from '@/utils/plannedPageLeave';

describe('ページ離脱時の通信エラー制御', () => {
  afterEach(() => {
    resetPlannedPageLeave();
  });

  it('計画的離脱状態を開始・解除できる', () => {
    expect(isPlannedPageLeave()).to.equal(false);

    beginPlannedPageLeave();
    expect(isPlannedPageLeave()).to.equal(true);

    resetPlannedPageLeave();
    expect(isPlannedPageLeave()).to.equal(false);
  });

  it('リクエストの明示的な取消を識別する', () => {
    expect(isExplicitRequestCancellation({ code: 'ERR_CANCELED' })).to.equal(true);
    expect(isExplicitRequestCancellation({ name: 'CanceledError' })).to.equal(true);
    expect(isExplicitRequestCancellation({ name: 'AbortError' })).to.equal(true);
    expect(isExplicitRequestCancellation({ __CANCEL__: true })).to.equal(true);
    expect(isExplicitRequestCancellation(new Error('Network Error'))).to.equal(false);
  });

  it('Network Errorという文言だけでは抑止しない', () => {
    expect(shouldIgnorePageLeaveError(new Error('Network Error'))).to.equal(false);

    beginPlannedPageLeave();
    expect(shouldIgnorePageLeaveError(new Error('Network Error'))).to.equal(true);
  });

  it('現在タブで実際に遷移するクリックだけを対象にする', () => {
    const link = document.createElement('a');
    link.href = '/';
    const buildEvent = (overrides = {}) => ({
      button: 0,
      currentTarget: link,
      defaultPrevented: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...overrides,
    });

    expect(shouldBeginPlannedPageLeaveForClick(buildEvent())).to.equal(true);
    expect(shouldBeginPlannedPageLeaveForClick(buildEvent({ button: 1 }))).to.equal(false);
    expect(shouldBeginPlannedPageLeaveForClick(buildEvent({ metaKey: true }))).to.equal(false);
    expect(shouldBeginPlannedPageLeaveForClick(buildEvent({ defaultPrevented: true }))).to.equal(false);

    link.target = '_blank';
    expect(shouldBeginPlannedPageLeaveForClick(buildEvent())).to.equal(false);
  });
});
