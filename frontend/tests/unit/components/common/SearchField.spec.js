import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchField from '@/components/common/SearchField.vue';

const translate = (key, values = {}) =>
  Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), key);

const factory = (props = {}, options = {}) =>
  mount(SearchField, {
    props: {
      modelValue: '',
      label: '検索',
      ...props,
    },
    global: {
      mocks: { $t: translate },
    },
    ...options,
  });

describe('検索欄（SearchField）', () => {
  it('標準検索フォームと結果領域に関連付けた操作を表示する', () => {
    const wrapper = factory();
    const input = wrapper.find('input');
    const button = wrapper.find('button');

    expect(wrapper.find('form').attributes('role')).to.equal('search');
    expect(input.attributes('id')).to.equal('management-search-input');
    expect(input.attributes('type')).to.equal('search');
    expect(input.attributes('aria-controls')).to.equal('management-list-results');
    expect(wrapper.find('label').attributes('for')).to.equal('management-search-input');
    expect(button.attributes('aria-label')).to.equal('検索を実行');
    expect(button.attributes('type')).to.equal('submit');
    expect(button.text()).to.contain('検索');
    expect(button.classes()).to.include('ui-button--filled');
    expect(button.classes()).to.include('ui-button--primary');
    expect(wrapper.find('[data-testid="management-search-clear"]').exists()).to.equal(false);
  });

  it('ラベル未指定時は現在の言語の検索ラベルを使う', () => {
    const wrapper = mount(SearchField, {
      props: { modelValue: '' },
      global: { mocks: { $t: (key) => `translated:${key}` } },
    });

    expect(wrapper.find('form').attributes('aria-label')).to.equal('translated:検索');
    expect(wrapper.find('label').text()).to.equal('translated:検索');
  });

  it('input、blur、フォーム submitで既存イベントを各1回通知する', async () => {
    const wrapper = factory();
    const input = wrapper.find('input');

    await input.setValue('abc');
    expect(wrapper.emitted()['update:modelValue'][0]).to.deep.equal(['abc']);

    await input.trigger('blur');
    expect(wrapper.emitted().blur).to.have.lengthOf(1);

    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted().search).to.have.lengthOf(1);
  });

  it('日本語入力の変換中や無効化中は検索を送信しない', async () => {
    const wrapper = factory({ modelValue: '検索語' });
    const input = wrapper.find('input');

    await input.trigger('compositionstart');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted().search).to.equal(undefined);

    await input.trigger('compositionend');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted().search).to.have.lengthOf(1);

    await wrapper.setProps({ disabled: true });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted().search).to.have.lengthOf(1);
    wrapper.findAll('button').forEach((control) => {
      expect(control.attributes()).to.have.property('disabled');
    });
    expect(input.attributes()).to.have.property('disabled');
  });

  it('clearはupdate、clearの順にemitしてinputへフォーカスを戻す', async () => {
    const calls = [];
    const wrapper = factory(
      {
        modelValue: 'abc',
        'onUpdate:modelValue': (value) => calls.push(['update', value]),
        onClear: () => calls.push(['clear']),
        onSearch: () => calls.push(['search']),
      },
      { attachTo: document.body }
    );

    const clear = wrapper.find('[data-testid="management-search-clear"]');
    expect(clear.text()).to.equal('クリア');
    expect(clear.attributes('aria-label')).to.equal('検索条件をクリア');
    expect(clear.attributes('aria-controls')).to.equal('management-list-results');
    expect(clear.classes()).to.include('ui-button--filled');
    expect(clear.classes()).to.include('ui-button--neutral');

    await clear.trigger('click');

    expect(calls).to.deep.equal([
      ['update', ''],
      ['clear'],
    ]);
    expect(document.activeElement).to.equal(wrapper.find('input').element);
    wrapper.unmount();
  });

  it('resultRegionIdをinputと全ボタンへ反映する', () => {
    const wrapper = factory({ modelValue: 'abc', resultRegionId: 'custom-results' });
    expect(wrapper.find('input').attributes('aria-controls')).to.equal('custom-results');
    wrapper.findAll('button').forEach((button) => {
      expect(button.attributes('aria-controls')).to.equal('custom-results');
    });
  });

  it('入力前は文字数不足を表示せず、フォーカスが外れた後に入力欄へエラーを関連付ける', async () => {
    const wrapper = factory({
      showMinError: true,
      minErrorText: 'min',
    });
    const input = wrapper.find('input');

    expect(wrapper.find('.ui-field__error').exists()).to.equal(false);
    expect(input.attributes('aria-invalid')).to.equal(undefined);
    expect(input.attributes('aria-describedby')).to.equal(undefined);

    await input.trigger('blur');

    expect(wrapper.find('.ui-field__error').text()).to.equal('min');
    expect(input.attributes('aria-invalid')).to.equal('true');
    expect(input.attributes('aria-describedby')).to.equal('management-search-input-error');
  });

  it('入力後は文字数の下限・上限エラーの優先順位を維持する', async () => {
    const wrapper = factory({
      showMinError: true,
      showMaxError: true,
      minErrorText: 'min',
      maxErrorText: 'max',
    });

    await wrapper.find('form').trigger('submit');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ui-field__error').text()).to.equal('min');

    await wrapper.setProps({ showMinError: false });
    expect(wrapper.find('.ui-field__error').text()).to.equal('max');
  });

  it('fieldClassとfieldStyleをUiField rootへ維持する', () => {
    const wrapper = factory({
      fieldClass: ['management-search', { wide: true }],
      fieldStyle: { maxWidth: '320px' },
    });

    expect(wrapper.classes()).to.include('management-search');
    expect(wrapper.classes()).to.include('search-field');
    expect(wrapper.classes()).to.include('wide');
    expect(wrapper.attributes('style')).to.contain('max-width: 320px');
  });
});
