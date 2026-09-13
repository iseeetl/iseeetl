import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ChunkLoadRecovery from '@/components/app/ChunkLoadRecovery.vue';
import { createApplicationI18n } from '@/i18n';

const mountRecovery = ({ locale = 'ja', reason = 'offline' } = {}) => {
  const background = document.createElement('main');
  const restoreButton = document.createElement('button');
  restoreButton.textContent = 'restore target';
  background.appendChild(restoreButton);
  document.body.appendChild(background);

  const recoveryHost = document.createElement('div');
  recoveryHost.id = 'chunk-load-recovery';
  document.body.appendChild(recoveryHost);
  restoreButton.focus();

  const wrapper = mount(ChunkLoadRecovery, {
    attachTo: recoveryHost,
    props: { reason },
    global: { plugins: [createApplicationI18n({ locale })] },
  });

  return { background, recoveryHost, restoreButton, wrapper };
};

describe('読込エラーからの復旧ダイアログ', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('復旧理由を現在言語で表示し、再試行を通知する', async () => {
    const { wrapper } = mountRecovery({ locale: 'en', reason: 'offline' });
    await nextTick();

    expect(wrapper.attributes('role')).to.equal('alertdialog');
    expect(wrapper.attributes('aria-modal')).to.equal('true');
    expect(wrapper.text()).to.include('Check your network connection');
    expect(wrapper.get('button').text()).to.equal('Retry');

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('retry')).to.have.lengthOf(1);
    wrapper.unmount();
  });

  it('初期フォーカスを再試行へ移し、TabとShift+Tabをalertdialog内で循環させる', async () => {
    const { wrapper } = mountRecovery();
    await nextTick();
    const retryButton = wrapper.get('button').element;

    expect(document.activeElement).to.equal(retryButton);

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).to.equal(true);
    expect(document.activeElement).to.equal(retryButton);

    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).to.equal(true);
    expect(document.activeElement).to.equal(retryButton);

    wrapper.get('.chunk-load-recovery__panel').element.focus();
    const shiftTabFromPanel = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(shiftTabFromPanel);
    expect(shiftTabFromPanel.defaultPrevented).to.equal(true);
    expect(document.activeElement).to.equal(retryButton);
    wrapper.unmount();
  });

  it('背景をinertかつaria-hiddenにし、破棄時に元の属性、スクロール、フォーカスを復元する', async () => {
    document.body.style.overflow = 'scroll';
    const { background, recoveryHost, restoreButton, wrapper } = mountRecovery();
    await nextTick();

    expect(background.hasAttribute('inert')).to.equal(true);
    expect(background.getAttribute('aria-hidden')).to.equal('true');
    expect(recoveryHost.hasAttribute('inert')).to.equal(false);
    expect(document.body.style.overflow).to.equal('hidden');

    restoreButton.focus();
    expect(document.activeElement).to.equal(wrapper.get('button').element);

    wrapper.unmount();

    expect(background.hasAttribute('inert')).to.equal(false);
    expect(background.hasAttribute('aria-hidden')).to.equal(false);
    expect(document.body.style.overflow).to.equal('scroll');
    expect(document.activeElement).to.equal(restoreButton);
  });

  it('背景に既に設定されていたinertとaria-hiddenを破棄時に保持する', async () => {
    const { background, wrapper } = mountRecovery();
    wrapper.unmount();
    background.setAttribute('inert', '');
    background.setAttribute('aria-hidden', 'false');

    const recoveryHost = document.createElement('div');
    document.body.appendChild(recoveryHost);
    const secondWrapper = mount(ChunkLoadRecovery, {
      attachTo: recoveryHost,
      global: { plugins: [createApplicationI18n()] },
    });
    await nextTick();
    secondWrapper.unmount();

    expect(background.hasAttribute('inert')).to.equal(true);
    expect(background.getAttribute('aria-hidden')).to.equal('false');
  });
});
