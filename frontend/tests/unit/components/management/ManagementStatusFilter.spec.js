import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ManagementStatusFilter from '@/components/management/ManagementStatusFilter.vue';

const messages = {
  'managementUi.filterLabel': '表示する状態',
  'managementUi.filterActive': '未削除',
  'managementUi.filterDeleted': '削除済み',
  'managementUi.filterAll': 'すべて',
};

const factory = (props = {}) =>
  mount(ManagementStatusFilter, {
    props: {
      modelValue: 'all',
      ...props,
    },
    global: {
      mocks: {
        $t: (key) => messages[key] || key,
      },
    },
  });

describe('管理対象の状態による絞り込み', () => {
  it('ラベルと3つの選択肢をselect要素へ関連付ける', async () => {
    const wrapper = factory();
    await wrapper.vm.$nextTick();
    const select = wrapper.get('select');
    const options = wrapper.findAll('option');

    expect(wrapper.get('label').text()).to.equal('表示する状態');
    expect(wrapper.get('label').attributes('for')).to.equal(select.attributes('id'));
    expect(options.map((option) => option.attributes('value'))).to.deep.equal(['all', 'active', 'deleted']);
    expect(options.map((option) => option.text())).to.deep.equal(['すべて', '未削除', '削除済み']);
    expect(select.element.value).to.equal('all');
  });

  it('modelValueを省略した場合はすべてを選択する', () => {
    const wrapper = mount(ManagementStatusFilter, {
      global: { mocks: { $t: (key) => messages[key] || key } },
    });

    expect(wrapper.get('select').element.value).to.equal('all');
  });

  it('選択変更でv-model更新とchangeを同じ値で通知する', async () => {
    const wrapper = factory();

    await wrapper.get('select').setValue('deleted');

    expect(wrapper.emitted('update:modelValue')).to.deep.equal([['deleted']]);
    expect(wrapper.emitted('change')).to.deep.equal([['deleted']]);
  });

  it('inputとchangeの間に再描画が入っても選択値を巻き戻さない', async () => {
    const wrapper = factory();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const select = wrapper.get('select');

    select.element.value = 'deleted';
    select.element.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(select.element.value).to.equal('deleted');
    expect(wrapper.emitted('update:modelValue')).to.equal(undefined);

    select.element.dispatchEvent(new Event('change', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:modelValue')).to.deep.equal([['deleted']]);
    expect(wrapper.emitted('change')).to.deep.equal([['deleted']]);
  });

  it('disabledを標準 selectへ反映する', () => {
    const wrapper = factory({ disabled: true, modelValue: 'all' });

    expect(wrapper.get('select').element.disabled).to.equal(true);
    expect(wrapper.get('select').element.value).to.equal('all');
  });
});
