import { expect } from 'vitest';
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import UiField from '@/components/ui/UiField.vue';

const defaultSlot = ({ controlAttrs }) => h('input', controlAttrs);

const factory = (props = {}, slot = defaultSlot) =>
  mount(UiField, {
    props: {
      controlId: 'sample-name',
      label: '名前',
      ...props,
    },
    slots: {
      default: slot,
    },
  });

const SelectFieldHarness = {
  components: { UiField },
  data: () => ({ selectedValue: '' }),
  template: `
    <UiField v-slot="{ controlAttrs }" control-id="sample-select" label="選択項目" stacked>
      <select v-bind="controlAttrs" v-model="selectedValue">
        <option disabled value="">選択してください</option>
        <option value="value-1">項目1</option>
      </select>
    </UiField>
  `,
};

describe('入力欄（UiField）', () => {
  it('ラベルをcontrolIdで標準入力要素へ関連付ける', () => {
    const wrapper = factory();
    const label = wrapper.find('.ui-field__label');
    const control = wrapper.find('input');

    expect(label.text()).to.equal('名前');
    expect(label.attributes('for')).to.equal('sample-name');
    expect(control.attributes('id')).to.equal('sample-name');
  });

  it('ラベル、入力要素、説明、エラーの順で描画する', () => {
    const wrapper = factory({
      invalid: true,
      description: '入力方法',
      error: '入力エラー',
    });
    const childClasses = Array.from(wrapper.element.children).map((element) => element.className);

    expect(childClasses).to.deep.equal([
      'ui-field__label',
      'ui-field__control',
      'ui-field__description',
      'ui-field__error',
    ]);
  });

  it('default スロットへ標準入力要素と補助ボタンを置ける', () => {
    const wrapper = factory({}, ({ controlAttrs }) =>
      h('div', [h('input', controlAttrs), h('button', { type: 'button' }, '表示')])
    );

    expect(wrapper.find('input').attributes('id')).to.equal('sample-name');
    expect(wrapper.find('button').text()).to.equal('表示');
    expect(wrapper.find('button').attributes('id')).to.equal(undefined);
  });

  it('スロット内の補助入力要素で発生したイベントでは対象入力要素の状態を更新しない', async () => {
    const wrapper = factory({ counter: true }, ({ controlAttrs }) =>
      h('div', [
        h('input', { ...controlAttrs, maxlength: '10' }),
        h('input', { id: 'auxiliary-input' }),
      ])
    );
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const control = wrapper.get('#sample-name');
    const auxiliaryControl = wrapper.get('#auxiliary-input');

    control.element.value = 'draft';
    auxiliaryControl.element.value = 'helper';
    auxiliaryControl.element.dispatchEvent(new Event('input', { bubbles: true }));

    expect(wrapper.vm.controlHasValue).to.equal(false);
    expect(wrapper.vm.characterCount).to.equal(0);
  });

  it('説明だけを描画し、aria-describedbyへ設定する', () => {
    const wrapper = factory({ description: '半角で入力してください' });
    const description = wrapper.find('.ui-field__description');

    expect(description.attributes('id')).to.equal('sample-name-description');
    expect(description.text()).to.equal('半角で入力してください');
    expect(wrapper.find('.ui-field__error').exists()).to.equal(false);
    expect(wrapper.find('input').attributes('aria-describedby')).to.equal('sample-name-description');
  });

  it('エラーだけをalertとして描画し、aria-describedbyへ設定する', () => {
    const wrapper = factory({
      invalid: true,
      error: '必須です',
    });
    const error = wrapper.find('.ui-field__error');

    expect(error.attributes('id')).to.equal('sample-name-error');
    expect(error.attributes('role')).to.equal('alert');
    expect(error.text()).to.equal('必須です');
    expect(wrapper.find('.ui-field__description').exists()).to.equal(false);
    expect(wrapper.find('input').attributes('aria-describedby')).to.equal('sample-name-error');
  });

  it('説明とエラーのIDをこの順でaria-describedbyへ設定する', () => {
    const wrapper = factory({
      invalid: true,
      description: '入力方法',
      error: '入力エラー',
    });

    expect(wrapper.find('input').attributes('aria-describedby')).to.equal('sample-name-description sample-name-error');
  });

  it('invalid=trueの時だけaria-invalidを設定する', async () => {
    const wrapper = factory();
    const control = wrapper.find('input');

    expect(control.attributes('aria-invalid')).to.equal(undefined);

    await wrapper.setProps({ invalid: true });

    expect(control.attributes('aria-invalid')).to.equal('true');
  });

  it('未入力の既定状態ではエラーとエラー参照を描画しない', () => {
    const wrapper = factory();
    const control = wrapper.find('input');

    expect(wrapper.find('.ui-field__error').exists()).to.equal(false);
    expect(control.attributes('aria-invalid')).to.equal(undefined);
    expect(control.attributes('aria-describedby')).to.equal(undefined);
  });

  it('空の入力要素はラベルを入力欄内に置き、フォーカス中と値ありで上へ移す', async () => {
    const wrapper = factory();
    const control = wrapper.find('input');
    await wrapper.vm.$nextTick();

    expect(wrapper.classes()).to.not.include('ui-field--label-raised');

    await control.trigger('focusin');
    expect(wrapper.classes()).to.include('ui-field--focused');
    expect(wrapper.classes()).to.include('ui-field--label-raised');

    await control.trigger('focusout');
    expect(wrapper.classes()).to.not.include('ui-field--focused');
    expect(wrapper.classes()).to.not.include('ui-field--label-raised');

    control.element.value = '入力済み';
    await control.trigger('input');
    expect(wrapper.classes()).to.include('ui-field--has-value');
    expect(wrapper.classes()).to.include('ui-field--label-raised');
  });

  it('初期値がある入力要素ではマウント後からラベルを上へ移す', async () => {
    const wrapper = factory({}, ({ controlAttrs }) => h('input', { ...controlAttrs, value: '既存値' }));
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(wrapper.classes()).to.include('ui-field--has-value');
    expect(wrapper.classes()).to.include('ui-field--label-raised');
  });

  it('counter指定時だけmaxlengthに対する現在文字数を更新する', async () => {
    const wrapper = factory({ counter: true }, ({ controlAttrs }) =>
      h('input', { ...controlAttrs, maxlength: '100' })
    );
    const control = wrapper.find('input');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.ui-field__counter').text()).to.equal('0 / 100');
    expect(wrapper.find('.ui-field__counter').attributes('role')).to.equal('status');

    control.element.value = '12345';
    await control.trigger('input');
    expect(wrapper.find('.ui-field__counter').text()).to.equal('5 / 100');

    await wrapper.setProps({ counter: false });
    expect(wrapper.find('.ui-field__counter').exists()).to.equal(false);
  });

  it('selectのinputとchangeの間に再描画が入っても選択値を保持する', async () => {
    const wrapper = mount(SelectFieldHarness);
    const field = wrapper.getComponent(UiField);
    const select = wrapper.get('select');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    select.element.value = 'value-1';
    select.element.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(select.element.value).to.equal('value-1');
    expect(wrapper.vm.selectedValue).to.equal('');

    select.element.dispatchEvent(new Event('change', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedValue).to.equal('value-1');
    expect(field.classes()).to.include('ui-field--has-value');
  });

  it('stacked指定時は空のselectでもラベルを常に上部へ配置する', async () => {
    const wrapper = mount(SelectFieldHarness);
    const field = wrapper.getComponent(UiField);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedValue).to.equal('');
    expect(field.classes()).to.include('ui-field--stacked');
    expect(field.classes()).to.include('ui-field--label-raised');
  });
});
