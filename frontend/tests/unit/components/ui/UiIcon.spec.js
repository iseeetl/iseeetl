import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UiIcon from '@/components/ui/UiIcon.vue';

const captureWarnings = (run) => {
  const originalConsoleWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    run();
  } finally {
    console.warn = originalConsoleWarn;
  }

  return warnings;
};

describe('アイコン（UiIcon）', () => {
  it('iconsとsymbolsのfont classを切り替え、nameを描画する', () => {
    const icons = mount(UiIcon, { props: { name: 'edit' } });
    const symbols = mount(UiIcon, {
      props: {
        name: 'settings',
        family: 'symbols',
      },
    });

    expect(icons.classes()).to.include('material-icons');
    expect(icons.text()).to.equal('edit');
    expect(symbols.classes()).to.include('material-symbols-outlined');
    expect(symbols.text()).to.equal('settings');
    expect(symbols.attributes('translate')).to.equal('no');
  });

  it('24pxの既定sizeと48px指定をstyleへ設定する', () => {
    const defaultIcon = mount(UiIcon, { props: { name: 'person' } });
    const largeIcon = mount(UiIcon, {
      props: {
        name: 'person',
        size: 48,
      },
    });

    expect(defaultIcon.element.style.width).to.equal('24px');
    expect(defaultIcon.element.style.height).to.equal('24px');
    expect(defaultIcon.element.style.fontSize).to.equal('24px');
    expect(largeIcon.element.style.width).to.equal('48px');
    expect(largeIcon.element.style.height).to.equal('48px');
    expect(largeIcon.element.style.fontSize).to.equal('48px');
  });

  it('装飾用アイコンにaria-hiddenを設定する', () => {
    const wrapper = mount(UiIcon, { props: { name: 'close' } });

    expect(wrapper.attributes('aria-hidden')).to.equal('true');
    expect(wrapper.attributes('role')).to.equal(undefined);
  });

  it('装飾以外のアイコンにはroleとaria-labelを設定する', () => {
    const wrapper = mount(UiIcon, {
      props: {
        name: 'warning',
        decorative: false,
      },
      attrs: {
        'aria-label': '警告',
      },
    });

    expect(wrapper.attributes('role')).to.equal('img');
    expect(wrapper.attributes('aria-hidden')).to.equal(undefined);
    expect(wrapper.attributes('aria-label')).to.equal('警告');
  });

  it('装飾以外のアイコンに名前がなければ開発環境で警告する', () => {
    const warnings = captureWarnings(() => {
      mount(UiIcon, {
        props: {
          name: 'warning',
          decorative: false,
        },
      });
    });

    expect(warnings.some((warning) => warning.includes('non-decorative icons require'))).to.equal(true);
  });
});
