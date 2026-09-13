import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import TimelineText from '@/components/timeline/TimelineText.vue';

const createWrapper = (content) =>
  shallowMount(TimelineText, {
    props: { content },
  });

describe('タイムラインの本文表示', () => {
  it('通常テキストと改行をそのまま表示する', () => {
    const wrapper = createWrapper('first line\nsecond line');

    expect(wrapper.element.textContent).to.equal('first line\nsecond line');
    expect(wrapper.find('a').exists()).to.equal(false);
  });

  it('http/https URLだけを安全な別タブリンクとして表示する', () => {
    const wrapper = createWrapper('http://example.com https://example.org/path');
    const links = wrapper.findAll('a');

    expect(links).to.have.lengthOf(2);
    expect(links.map((link) => link.attributes('href'))).to.deep.equal([
      'http://example.com',
      'https://example.org/path',
    ]);
    links.forEach((link) => {
      expect(link.attributes('target')).to.equal('_blank');
      expect(link.attributes('rel')).to.equal('noopener noreferrer');
    });
  });

  it('HTMLタグらしい入力をHTMLとして解釈しない', () => {
    const wrapper = createWrapper('<script>window.attacked = true</script><strong>text</strong>');

    expect(wrapper.find('script').exists()).to.equal(false);
    expect(wrapper.find('strong').exists()).to.equal(false);
    expect(wrapper.element.innerHTML).to.include('&lt;script&gt;');
    expect(wrapper.element.textContent).to.equal('<script>window.attacked = true</script><strong>text</strong>');
  });

  it('javascript/data スキームをリンクとして描画しない', () => {
    const wrapper = createWrapper('javascript:alert(1) data:text/html,test');

    expect(wrapper.find('a').exists()).to.equal(false);
    expect(wrapper.element.textContent).to.equal('javascript:alert(1) data:text/html,test');
  });

  it('空文字列とnullを空の本文として表示する', async () => {
    const wrapper = createWrapper('');
    expect(wrapper.element.textContent).to.equal('');

    await wrapper.setProps({ content: null });
    expect(wrapper.element.textContent).to.equal('');
  });
});
