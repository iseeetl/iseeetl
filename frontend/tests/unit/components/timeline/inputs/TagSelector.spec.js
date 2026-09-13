import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { shallowMount } from '../../../helpers/testUtils';
import TagSelector from '@/components/timeline/inputs/TagSelector.vue';

const createWrapper = (overrides = {}) =>
  shallowMount(TagSelector, {
    props: {
      tags: [
        { _id: 't1', name: 'tag1', order: 2 },
        { _id: 't2', name: 'tag2', order: 1 },
      ],
      modelValue: [],
      locale: 'ja',
      originalTags: [],
      previousTags: [],
      copiedTags: [],
      sending: false,
      recording: false,
      ...(overrides.props || {}),
    },
    mocks: {
      $t: (key) => key,
      $store: { dispatch: () => {} },
      ...(overrides.mocks || {}),
    },
    stubs: overrides.stubs || {},
  });

describe('タグの選択', () => {
  it('タグは並び順でソートされる', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.sortedTags.map((tag) => tag._id)).to.deep.equal(['t2', 't1']);
  });

  it('同じ画面の複数セレクタでタグIDを一意にし、ラベルと対応させる', () => {
    const Host = {
      components: { TagSelector },
      data: () => ({ tags: [{ _id: 't1', name: 'tag1', order: 1 }] }),
      template: `
        <div>
          <TagSelector :tags="tags" :model-value="[]" locale="ja" />
          <TagSelector :tags="tags" :model-value="[]" locale="ja" />
        </div>
      `,
    };
    const wrapper = mount(Host, {
      global: {
        mocks: {
          $t: (key) => key,
          $store: { dispatch: () => {} },
        },
      },
    });
    const inputs = wrapper.findAll('input[type="checkbox"]');
    const ids = inputs.map((input) => input.attributes('id'));

    expect(inputs).to.have.lengthOf(2);
    expect(new Set(ids).size).to.equal(ids.length);
    inputs.forEach((input) => {
      expect(wrapper.find(`label[for="${input.attributes('id')}"]`).exists()).to.equal(true);
    });
  });

  it('チェック操作で選択タグを更新する', () => {
    const wrapper = createWrapper({ props: { modelValue: ['t2'] } });
    wrapper.vm.onChange({ target: { checked: true } }, 't1');

    expect(wrapper.emitted()['update:modelValue'][0][0]).to.deep.equal(['t2', 't1']);
  });

  it('解除操作で選択タグを除外する', () => {
    const wrapper = createWrapper({ props: { modelValue: ['t1', 't2'] } });
    wrapper.vm.onChange({ target: { checked: false } }, 't1');

    expect(wrapper.emitted()['update:modelValue'][0][0]).to.deep.equal(['t2']);
  });

  it('クリア操作でタグを空にする', () => {
    const wrapper = createWrapper({ props: { modelValue: ['t1'] } });
    wrapper.vm.clearAll();

    expect(wrapper.emitted()['update:modelValue'][0][0]).to.deep.equal([]);
    expect(wrapper.emitted()['clear-previous']).to.equal(undefined);
  });

  it('非表示の保存済みタグはクリア・置換操作でも保持する', () => {
    const wrapper = createWrapper({
      props: {
        modelValue: ['hidden', 't1'],
        preservedTags: ['hidden'],
        originalTags: ['hidden', 't2'],
        previousTags: ['hidden', 't1'],
        copiedTags: ['hidden', 't2'],
      },
    });

    wrapper.vm.clearAll();
    wrapper.vm.setOriginal();
    wrapper.vm.setPrevious();
    wrapper.vm.pasteCopied();

    expect(wrapper.emitted()['update:modelValue'].map((args) => args[0])).to.deep.equal([
      ['hidden'],
      ['hidden', 't2'],
      ['hidden', 't1'],
      ['hidden', 't2'],
    ]);
  });

  it('元投稿のタグがあれば反映する', () => {
    const wrapper = createWrapper({ props: { originalTags: ['t1'] } });
    wrapper.vm.setOriginal();

    expect(wrapper.emitted()['update:modelValue'][0][0]).to.deep.equal(['t1']);
  });

  it('前回投稿のタグがあれば反映する', () => {
    const wrapper = createWrapper({ props: { previousTags: ['t2'] } });
    wrapper.vm.setPrevious();

    expect(wrapper.emitted()['update:modelValue'][0][0]).to.deep.equal(['t2']);
  });

  it('コピー済みタグで選択中タグを置き換える', () => {
    const calls = [];
    const wrapper = createWrapper({
      props: { modelValue: ['t1'], copiedTags: ['t2', 'missing', 't2'] },
      mocks: {
        $store: {
          dispatch: (action, payload) => calls.push({ action, payload }),
        },
      },
    });

    wrapper.vm.pasteCopied();

    expect(wrapper.emitted()['update:modelValue'][0][0]).to.deep.equal(['t2']);
    expect(calls).to.deep.equal([
      { action: 'doShowSnackbar', payload: { message: 'タグを貼り付けました', role: 'status' } },
    ]);
  });

  it('貼り付け可能なコピー済みタグがなければ反映しない', () => {
    const wrapper = createWrapper({ props: { copiedTags: ['missing'] } });

    wrapper.vm.pasteCopied();

    expect(wrapper.emitted()['update:modelValue']).to.equal(undefined);
    expect(wrapper.vm.hasCopiedTags).to.equal(false);
  });

  it('貼り付けボタンは文字で表示し、コピー済みタグがなければ非活性にする', () => {
    const wrapper = createWrapper();
    const button = wrapper.find('[data-testid="tag-selector-paste-button"]');

    expect(button.text()).to.equal('貼り付け');
    expect(button.attributes()).to.have.property('disabled');
  });

  it('貼り付け可能なコピー済みタグがあれば貼り付けボタンを活性にする', () => {
    const wrapper = createWrapper({ props: { copiedTags: ['t1'] } });
    const button = wrapper.find('[data-testid="tag-selector-paste-button"]');

    expect(button.attributes('disabled')).to.equal(undefined);
  });
});
