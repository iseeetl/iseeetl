import { expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import UiButton from '@/components/ui/UiButton.vue';

const captureWarnings = (run) => {
  const warnings = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation((message) => warnings.push(String(message)));

  try {
    run();
  } finally {
    warn.mockRestore();
  }

  return warnings;
};

describe('ボタン（UiButton）', () => {
  it('標準ボタンを描画し、typeを既定値またはattrsから設定する', () => {
    const defaultButton = mount(UiButton);
    const submitButton = mount(UiButton, { attrs: { type: 'submit', form: 'sample-form' } });

    expect(defaultButton.element.tagName).to.equal('BUTTON');
    expect(defaultButton.attributes('type')).to.equal('button');
    expect(submitButton.attributes('type')).to.equal('submit');
    expect(submitButton.attributes('form')).to.equal('sample-form');
  });

  it('外観・配色・余白の指定に対応するクラスを設定する', () => {
    ['text', 'filled'].forEach((appearance) => {
      const wrapper = mount(UiButton, { props: { appearance } });
      expect(wrapper.classes()).to.include(`ui-button--${appearance}`);
    });

    ['neutral', 'primary', 'danger', 'success'].forEach((tone) => {
      const wrapper = mount(UiButton, { props: { tone } });
      expect(wrapper.classes()).to.include(`ui-button--${tone}`);
    });

    ['normal', 'dense'].forEach((density) => {
      const wrapper = mount(UiButton, { props: { density } });
      expect(wrapper.classes()).to.include(`ui-button--${density}`);
    });
  });

  it('disabledとattrsをrootへ渡す', () => {
    const wrapper = mount(UiButton, {
      attrs: {
        disabled: true,
        'data-testid': 'save-button',
      },
    });

    expect(wrapper.element.disabled).to.equal(true);
    expect(wrapper.attributes('data-testid')).to.equal('save-button');
  });

  it('標準リスナーをrootへ渡す', async () => {
    let clickCount = 0;
    const wrapper = mount(UiButton, {
      attrs: {
        onClick: () => {
          clickCount += 1;
        },
      },
    });

    await wrapper.trigger('click');

    expect(clickCount).to.equal(1);
  });

  it('アイコン専用ボタンに識別用クラスを付け、名前がなければ開発環境で警告する', () => {
    let wrapper;
    const warnings = captureWarnings(() => {
      wrapper = mount(UiButton, { props: { iconOnly: true } });
    });

    expect(wrapper.classes()).to.include('ui-button--icon-only');
    expect(warnings.some((warning) => warning.includes('iconOnly requires'))).to.equal(true);
  });

  it('iconOnlyにaria-labelがあれば警告を出さない', () => {
    const warnings = captureWarnings(() => {
      mount(UiButton, {
        props: { iconOnly: true },
        attrs: { 'aria-label': '編集' },
      });
    });

    expect(warnings).to.deep.equal([]);
  });

  it('公開フォーカスメソッドをroot ボタンへ委譲する', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wrapper = mount(UiButton, { attachTo: host });

    wrapper.vm.focus();

    expect(document.activeElement).to.equal(wrapper.element);
    wrapper.unmount();
    host.remove();
  });
});
