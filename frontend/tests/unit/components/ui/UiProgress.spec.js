import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UiProgress from '@/components/ui/UiProgress.vue';

describe('進捗表示（UiProgress）', () => {
  it('モードを必須propとして検証する', () => {
    const originalConsoleWarn = console.warn;
    const warnings = [];
    console.warn = (message) => warnings.push(message);

    try {
      mount(UiProgress);
    } finally {
      console.warn = originalConsoleWarn;
    }

    expect(warnings.some((warning) => warning.includes('Missing required prop: "mode"'))).to.equal(true);
  });

  it('進捗率を0～100の範囲に補正してARIA属性と幅へ反映する', async () => {
    const wrapper = mount(UiProgress, {
      props: {
        mode: 'determinate',
        value: -20,
      },
    });

    expect(wrapper.attributes('role')).to.equal('progressbar');
    expect(wrapper.attributes('aria-valuemin')).to.equal('0');
    expect(wrapper.attributes('aria-valuemax')).to.equal('100');
    expect(wrapper.attributes('aria-valuenow')).to.equal('0');
    expect(wrapper.find('.ui-progress__indicator').element.style.width).to.equal('0%');

    await wrapper.setProps({ value: 150 });

    expect(wrapper.attributes('aria-valuenow')).to.equal('100');
    expect(wrapper.find('.ui-progress__indicator').element.style.width).to.equal('100%');
  });

  it('indeterminateではaria-valuenowを出さない', () => {
    const wrapper = mount(UiProgress, {
      props: {
        mode: 'indeterminate',
        value: 50,
      },
    });

    expect(wrapper.attributes('role')).to.equal('progressbar');
    expect(wrapper.attributes('aria-valuenow')).to.equal(undefined);
    expect(wrapper.attributes('aria-valuemin')).to.equal(undefined);
    expect(wrapper.attributes('aria-valuemax')).to.equal(undefined);
    expect(wrapper.classes()).to.include('ui-progress--indeterminate');
  });

  it('呼出側のaria-labelledbyをrootへ渡す', () => {
    const wrapper = mount(UiProgress, {
      props: {
        mode: 'indeterminate',
      },
      attrs: {
        'aria-labelledby': 'dialog-title',
      },
    });

    expect(wrapper.attributes('aria-labelledby')).to.equal('dialog-title');
  });
});
