import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineFilterSummary from '@/components/timeline/core/TimelineFilterSummary.vue';

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineFilterSummary, {
    props: {
      filter: { conditions: null },
      localTagIds: [],
      getTranslatedTagName: (id) => id,
      mutedTone: false,
      ...(overrides.props || {}),
    },
    mocks: {
      $t(key) {
        if (!this.$i18n) {
          throw new Error('$i18nが必要です');
        }
        return key;
      },
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('タイムラインの絞り込み条件表示', () => {
  it('含める条件では「表示する」のチップを表示する', () => {
    const wrapper = createWrapper({
      props: {
        filter: {
          conditions: {
            filterMode: 'include',
            keyword: 'keyword',
            displayOrder: [],
          },
        },
      },
    });

    expect(wrapper.find('.filter-mode-chip').text()).to.equal('表示する');
    expect(wrapper.find('.condition-token--excluded').exists()).to.equal(false);
  });

  it('exclude条件では条件文言に取り消し線クラスを付与する', () => {
    const wrapper = createWrapper({
      props: {
        filter: {
          conditions: {
            filterMode: 'exclude',
            keyword: 'keyword',
            userName: 'user',
            displayOrder: [{ key: 'notags', display: 'タグ無し' }, { key: 'tag-1' }],
          },
        },
      },
    });

    const excludedTokens = wrapper.findAll('.condition-token--excluded');
    expect(wrapper.find('.filter-mode-chip').text()).to.equal('表示しない');
    expect(excludedTokens.length).to.equal(4);
    expect(wrapper.text()).to.include('keyword');
    expect(wrapper.text()).to.include('user');
    expect(wrapper.text()).to.include('タグ無し');
    expect(wrapper.text()).to.include('#tag-1');
  });

  it('条件なしではタイムラインタイトルとタグを表示する', () => {
    const wrapper = createWrapper({
      props: {
        filter: { conditions: null },
        localTagIds: ['tag-1', 'tag-2'],
      },
    });

    expect(wrapper.text()).to.include('タイムライン');
    expect(wrapper.text()).to.include('#tag-1');
    expect(wrapper.text()).to.include('#tag-2');
  });

  it('非活性トーン指定時はis-mutedクラスを付与する', () => {
    const wrapper = createWrapper({ props: { mutedTone: true } });
    expect(wrapper.classes()).to.include('is-muted');
  });
});
