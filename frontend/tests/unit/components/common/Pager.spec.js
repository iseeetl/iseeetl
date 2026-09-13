import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import Pager from '@/components/common/Pager.vue';

const findByText = (wrapper, text) => wrapper.findAll('button').find((btn) => btn.text() === text);
const findByLabel = (wrapper, label) => wrapper.find(`button[aria-label="${label}"]`);

const translate = (key, values = {}) =>
  Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), key);

const factory = (props = {}) =>
  shallowMount(Pager, {
    props: {
      currentPage: 3,
      lastPage: 5,
      ...props,
    },
    mocks: { $t: translate },
  });

describe('ページ切替（Pager）', () => {
  it('currentPage=1 のとき先頭/前ボタンは表示しない', () => {
    const wrapper = factory({ currentPage: 1, lastPage: 5 });
    expect(findByLabel(wrapper, '最初のページ').exists()).to.equal(false);
    expect(findByLabel(wrapper, '前のページ').exists()).to.equal(false);
  });

  it('currentPage=lastPage のとき次/末尾ボタンは表示しない', () => {
    const wrapper = factory({ currentPage: 5, lastPage: 5 });
    expect(findByLabel(wrapper, '次のページ').exists()).to.equal(false);
    expect(findByLabel(wrapper, '最後のページ').exists()).to.equal(false);
  });

  it('現在ページのボタンを無効にし、専用クラスを付ける', () => {
    const wrapper = factory({ currentPage: 3, lastPage: 5 });
    const current = findByText(wrapper, '3');
    expect(current.exists()).to.equal(true);
    expect(current.attributes()).to.have.property('disabled');
    expect(current.classes()).to.include('pager-current-page');
    expect(current.attributes('aria-current')).to.equal('page');
    expect(current.attributes('aria-label')).to.equal('3ページ');
  });

  it('ボタンを押すとchangeイベントを通知する', async () => {
    const wrapper = factory({ currentPage: 3, lastPage: 5 });

    await findByLabel(wrapper, '最初のページ').trigger('click');
    await findByLabel(wrapper, '前のページ').trigger('click');
    await findByText(wrapper, '2').trigger('click');
    await findByLabel(wrapper, '次のページ').trigger('click');
    await findByLabel(wrapper, '最後のページ').trigger('click');

    const calls = wrapper.emitted().change.map((args) => args[0]);
    expect(calls).to.deep.equal([1, 2, 2, 4, 5]);
  });

  it('navと全操作を結果領域へ関連付ける', () => {
    const wrapper = factory({ resultRegionId: 'custom-results' });

    expect(wrapper.element.tagName).to.equal('NAV');
    expect(wrapper.attributes('aria-label')).to.equal('ページ番号');
    expect(findByLabel(wrapper, '最初のページ').exists()).to.equal(true);
    expect(findByLabel(wrapper, '前のページ').exists()).to.equal(true);
    expect(findByLabel(wrapper, '次のページ').exists()).to.equal(true);
    expect(findByLabel(wrapper, '最後のページ').exists()).to.equal(true);
    wrapper.findAll('button').forEach((button) => {
      expect(button.attributes('aria-controls')).to.equal('custom-results');
    });
  });

  it('lastPageが1以下ならnavを描画しない', () => {
    expect(factory({ currentPage: 1, lastPage: 1 }).html()).to.equal('<!--v-if-->');
    expect(factory({ currentPage: 1, lastPage: 0 }).html()).to.equal('<!--v-if-->');
  });

  it('最大5ページだけを表示する', () => {
    const wrapper = factory({ currentPage: 10, lastPage: 20 });
    const numericPages = wrapper
      .findAll('button')
      .map((button) => button.text())
      .filter((text) => /^\d+$/u.test(text));

    expect(numericPages).to.deep.equal(['8', '9', '10', '11', '12']);
  });

  it('無効なボタン・現在ページ・範囲外のページではchangeイベントを通知しない', async () => {
    const wrapper = factory({ disabled: true });
    wrapper.vm.emitChange(1);
    wrapper.vm.emitChange(3);
    wrapper.vm.emitChange(6);
    await findByLabel(wrapper, '次のページ').trigger('click');

    expect(wrapper.emitted().change).to.equal(undefined);
    wrapper.findAll('button').forEach((button) => {
      expect(button.attributes()).to.have.property('disabled');
    });
  });
});
