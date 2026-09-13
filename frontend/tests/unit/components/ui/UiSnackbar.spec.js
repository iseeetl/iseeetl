import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UiSnackbar from '@/components/ui/UiSnackbar.vue';

describe('通知メッセージ（UiSnackbar）', () => {
  let originalSetTimeout;
  let originalClearTimeout;
  let scheduledTimers;
  let clearedTimers;
  let nextTimerId;
  let wrappers;

  const factory = (props = {}) => {
    const wrapper = mount(UiSnackbar, {
      props: {
        message: '通知',
        ...props,
      },
    });
    wrappers.push(wrapper);
    return wrapper;
  };

  const getScheduledTimer = () => Array.from(scheduledTimers.entries())[0];

  const runTimer = (timerId) => {
    const timer = scheduledTimers.get(timerId);
    scheduledTimers.delete(timerId);
    timer.callback();
  };

  beforeEach(() => {
    originalSetTimeout = window.setTimeout;
    originalClearTimeout = window.clearTimeout;
    scheduledTimers = new Map();
    clearedTimers = [];
    nextTimerId = 1;
    wrappers = [];

    window.setTimeout = (callback, delay) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      scheduledTimers.set(timerId, { callback, delay });
      return timerId;
    };
    window.clearTimeout = (timerId) => {
      clearedTimers.push(timerId);
      scheduledTimers.delete(timerId);
    };
  });

  afterEach(() => {
    wrappers.forEach((wrapper) => {
      if (!wrapper.vm._isDestroyed) wrapper.unmount();
    });
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
  });

  it('center位置のclassとmessageを描画する', () => {
    const wrapper = factory({
      modelValue: true,
      position: 'center',
      message: '保存しました',
    });

    expect(wrapper.classes()).to.include('ui-snackbar');
    expect(wrapper.classes()).to.include('ui-snackbar--center');
    expect(wrapper.text()).to.equal('保存しました');
    expect(wrapper.isVisible()).to.equal(true);
  });

  it('位置の指定が未知の場合は中央に表示する', () => {
    const wrapper = factory({
      position: 'top',
    });

    expect(wrapper.classes()).to.include('ui-snackbar--center');
    expect(wrapper.classes()).not.to.include('ui-snackbar--top');
  });

  it('指定された表示時間が過ぎるとinput(false)を通知する', () => {
    const wrapper = factory({
      modelValue: true,
      duration: 1234,
    });
    const [timerId, timer] = getScheduledTimer();

    expect(timer.delay).to.equal(1234);
    runTimer(timerId);

    expect(wrapper.emitted('update:modelValue')).to.deep.equal([[false]]);
    expect(scheduledTimers.size).to.equal(0);
  });

  it('isInfinity=trueではタイマーを開始しない', async () => {
    const wrapper = factory({
      modelValue: true,
      duration: 1234,
      isInfinity: true,
    });

    expect(scheduledTimers.size).to.equal(0);

    await wrapper.setProps({ isInfinity: false });
    expect(getScheduledTimer()[1].delay).to.equal(1234);
  });

  it('valueを再表示するたびに新しいタイマーを開始する', async () => {
    const wrapper = factory({
      modelValue: true,
      duration: 2000,
    });
    const firstTimerId = getScheduledTimer()[0];

    await wrapper.setProps({ modelValue: false });
    expect(clearedTimers).to.deep.equal([firstTimerId]);
    expect(scheduledTimers.size).to.equal(0);

    await wrapper.setProps({ modelValue: true });
    const secondTimerId = getScheduledTimer()[0];
    expect(secondTimerId).not.to.equal(firstTimerId);
    expect(getScheduledTimer()[1].delay).to.equal(2000);
  });

  it('表示中のduration、message、isInfinity変更でタイマーを現在値へ更新する', async () => {
    const wrapper = factory({
      modelValue: true,
      duration: 1000,
    });
    const firstTimerId = getScheduledTimer()[0];

    await wrapper.setProps({ duration: 2500 });
    const secondTimerId = getScheduledTimer()[0];
    expect(clearedTimers).to.include(firstTimerId);
    expect(getScheduledTimer()[1].delay).to.equal(2500);

    await wrapper.setProps({ message: '更新済み' });
    const thirdTimerId = getScheduledTimer()[0];
    expect(clearedTimers).to.include(secondTimerId);
    expect(thirdTimerId).not.to.equal(secondTimerId);

    await wrapper.setProps({ isInfinity: true });
    expect(clearedTimers).to.include(thirdTimerId);
    expect(scheduledTimers.size).to.equal(0);
  });

  it('value=falseでタイマーを解除して非表示にする', async () => {
    const wrapper = factory({
      modelValue: true,
    });
    const timerId = getScheduledTimer()[0];

    await wrapper.setProps({ modelValue: false });

    expect(clearedTimers).to.include(timerId);
    expect(scheduledTimers.size).to.equal(0);
    expect(wrapper.isVisible()).to.equal(false);
  });

  it('破棄時にタイマーを解除する', () => {
    const wrapper = factory({
      modelValue: true,
    });
    const timerId = getScheduledTimer()[0];

    wrapper.unmount();

    expect(clearedTimers).to.include(timerId);
    expect(scheduledTimers.size).to.equal(0);
  });

  it('渡された通知用ARIA属性だけをrootへ設定する', () => {
    const wrapper = factory({
      role: 'alert',
      ariaLive: 'assertive',
      ariaAtomic: 'true',
    });

    expect(wrapper.attributes('role')).to.equal('alert');
    expect(wrapper.attributes('aria-live')).to.equal('assertive');
    expect(wrapper.attributes('aria-atomic')).to.equal('true');
  });

  it('通知用ARIA属性は未指定なら付与しない', () => {
    const wrapper = factory();

    expect(wrapper.attributes('role')).to.equal(undefined);
    expect(wrapper.attributes('aria-live')).to.equal(undefined);
    expect(wrapper.attributes('aria-atomic')).to.equal(undefined);
  });
});
