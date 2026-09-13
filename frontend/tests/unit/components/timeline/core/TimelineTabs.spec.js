import { expect, vi } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineTabs from '@/components/timeline/core/TimelineTabs.vue';

const UiButtonStub = {
  name: 'UiButton',
  template: '<button @click="$emit(\'click\', $event)"><slot/></button>',
};
const UiIconStub = { name: 'UiIcon', template: '<i></i>' };
const UiTooltipStub = { name: 'UiTooltip', template: '<span><slot/></span>' };
const TimelineFilterSummaryStub = {
  name: 'TimelineFilterSummary',
  props: ['mutedTone'],
  template: '<span class="timeline-filter-summary-stub" :data-muted="String(mutedTone)"><slot /></span>',
};

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineTabs, {
    stubs: {
      UiButton: UiButtonStub,
      UiIcon: UiIconStub,
      UiTooltip: UiTooltipStub,
      TimelineFilterSummary: TimelineFilterSummaryStub,
    },
    props: {
      filters: [{ conditions: null }, { conditions: { keyword: 'k', displayOrder: [] } }],
      currentTabIndex: 0,
      localTagIds: [],
      getTranslatedTagName: (id) => id,
      isSpeechActive: () => false,
      onPressFilterTab: () => {},
      onToggleColumnSpeech: () => {},
      onShowFilterDialog: () => {},
      onDeleteFilter: () => {},
      onTabListKeydown: () => {},
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

describe('タイムラインのタブ', () => {
  it('タブ一覧に名前を付け、タブ以外の操作を選択中タブの操作グループへ分ける', () => {
    const wrapper = createWrapper({ props: { currentTabIndex: 1 } });
    const tablist = wrapper.get('[role="tablist"]');
    const actions = wrapper.get('.active-tab-actions');

    expect(tablist.attributes('aria-label')).to.equal('タイムライン');
    Array.from(tablist.element.children).forEach((child) => expect(child.getAttribute('role')).to.equal('presentation'));
    tablist.findAll('button').forEach((button) => expect(button.attributes('role')).to.equal('tab'));
    expect(tablist.find('.active-tab-actions').exists()).to.equal(false);
    expect(actions.attributes('role')).to.equal('group');
    expect(actions.attributes('aria-labelledby')).to.equal('tab-button-1');
    actions.findAll('button').forEach((button) => expect(button.attributes('tabindex')).to.equal(undefined));
  });

  it('タブ切替後も3つの操作は選択中カラムだけを対象にする', async () => {
    const onToggleColumnSpeech = vi.fn();
    const onShowFilterDialog = vi.fn();
    const onDeleteFilter = vi.fn();
    const onPressFilterTab = vi.fn();
    const wrapper = createWrapper({
      props: { onToggleColumnSpeech, onShowFilterDialog, onDeleteFilter, onPressFilterTab },
    });

    for (const index of [0, 1, 0]) {
      await wrapper.setProps({ currentTabIndex: index });
      const actions = wrapper.get('.active-tab-actions');
      expect(wrapper.findAll('.active-tab-actions')).to.have.length(1);
      expect(actions.attributes('aria-labelledby')).to.equal(`tab-button-${index}`);
      const buttons = actions.findAll('button');
      await buttons.at(0).trigger('click');
      await buttons.at(1).trigger('click');
      await buttons.at(2).trigger('click');
      expect(onToggleColumnSpeech).toHaveBeenLastCalledWith(index, expect.any(Event));
      expect(onShowFilterDialog).toHaveBeenLastCalledWith(index, wrapper.props('filters')[index], expect.any(Event));
      expect(onDeleteFilter).toHaveBeenLastCalledWith(index);
    }
    expect(onPressFilterTab).not.toHaveBeenCalled();
  });

  it('focusTabは共通枠のスクロールを中断せず対象タブへフォーカスする', () => {
    const wrapper = createWrapper();
    let options;
    wrapper.vm.$refs.tab0[0].focus = (value) => {
      options = value;
    };

    wrapper.vm.focusTab(0);

    expect(options).to.deep.equal({ preventScroll: true });
  });

  it('ensureTabVisibleはタイトルと操作の共通枠をRTLでも論理方向で表示する', () => {
    const wrapper = createWrapper();
    const tab = wrapper.get('#tab-item-0').element;
    const calls = [];
    tab.scrollIntoView = (options) => calls.push(options);

    wrapper.vm.ensureTabVisible(0, false);

    expect(calls).to.deep.equal([{ behavior: 'auto', block: 'nearest', inline: 'nearest' }]);
  });

  it('ensureTabVisibleはsmooth指定をscrollIntoViewへ渡す', () => {
    const wrapper = createWrapper();
    const tab = wrapper.get('#tab-item-0').element;
    const calls = [];
    tab.scrollIntoView = (options) => calls.push(options);

    wrapper.vm.ensureTabVisible(0, true);

    expect(calls).to.deep.equal([{ behavior: 'smooth', block: 'nearest', inline: 'nearest' }]);
  });

  it('非活性タブにはmutedTone=trueを渡す', () => {
    const wrapper = createWrapper({
      props: {
        filters: [
          { conditions: { filterMode: 'include', displayOrder: [] } },
          { conditions: { filterMode: 'exclude', displayOrder: [] } },
        ],
        currentTabIndex: 0,
      },
    });
    const summaries = wrapper.findAll('.timeline-filter-summary-stub');
    expect(summaries.at(0).attributes('data-muted')).to.equal('false');
    expect(summaries.at(1).attributes('data-muted')).to.equal('true');
  });

  it('getTabTitleは条件なしのタイトルとタグを連結する', () => {
    const wrapper = createWrapper({
      props: { localTagIds: ['tag-1', 'tag-2'], filters: [{ conditions: null }] },
    });
    expect(wrapper.vm.getTabTitle({ conditions: null })).to.equal('タイムライン #tag-1 #tag-2');
  });

  it('getTabTitleは絞り込み条件を連結する', () => {
    const wrapper = createWrapper({
      props: { filters: [{ conditions: { filterMode: 'exclude', displayOrder: [] } }] },
    });
    const title = wrapper.vm.getTabTitle({
      conditions: { filterMode: 'exclude', keyword: 'k', userName: 'u', displayOrder: [{ key: 'tag-1' }] },
    });
    expect(title).to.equal('表示しない k u #tag-1');
  });

  it('タブタイトル内に漏斗アイコンが表示されない', () => {
    const wrapper = createWrapper({
      props: {
        filters: [{ conditions: { keyword: 'k', displayOrder: [{ key: 'notags', display: 'タグ無し' }] } }],
      },
    });
    expect(wrapper.find('.tab-button').findComponent({ name: 'UiIcon' }).exists()).to.equal(false);
  });
});
