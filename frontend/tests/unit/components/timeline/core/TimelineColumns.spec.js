import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineColumns from '@/components/timeline/core/TimelineColumns.vue';

const TimelineColumnStub = {
  name: 'TimelineColumn',
  template:
    '<div class="timeline-column-stub" :id="\'timeline-inner-\' + index" :role="isMobile ? \'tabpanel\' : undefined" :aria-labelledby="isMobile ? \'tab-button-\' + index : undefined"></div>',
  props: ['index', 'filter', 'isMobile'],
};
const SplitPanesStub = { name: 'splitpanes', emits: ['resized'], template: '<div><slot/></div>' };
const PaneStub = { name: 'pane', template: '<div><slot/></div>', props: ['size'] };

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineColumns, {
    stubs: {
      TimelineColumn: TimelineColumnStub,
      pane: PaneStub,
      splitpanes: SplitPanesStub,
    },
    props: {
      filters: [{ id: 'f1' }, { id: 'f2' }],
      currentTabIndex: 0,
      isMobile: false,
      commonColumnProps: (filter, index) => ({ index, filter }),
      commonColumnEvents: {},
      onPaneResized: () => {},
      onDragEnd: () => {},
      ...(overrides.props || {}),
    },
  });

describe('タイムラインのカラム一覧', () => {
  it('PC表示ではフィルタ数だけカラムを描画する', () => {
    const wrapper = createWrapper({ props: { isMobile: false } });
    expect(wrapper.findAll('.timeline-column-stub').length).to.equal(2);
  });

  it('PC表示では空のsplitpanesを描画せず、最初のフィルタ確定後にマウントする', async () => {
    const wrapper = createWrapper({ props: { isMobile: false, filters: [] } });

    expect(wrapper.findComponent(SplitPanesStub).exists()).to.equal(false);

    await wrapper.setProps({ filters: [{ id: 'f1' }] });

    expect(wrapper.findComponent(SplitPanesStub).exists()).to.equal(true);
    expect(wrapper.findAll('.timeline-column-stub').length).to.equal(1);
  });

  it('ドラッグ終了時はpropを変更せず親へ通知する', () => {
    const filters = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
    const events = [];
    const wrapper = createWrapper({
      props: {
        filters,
        onDragEnd: (event) => events.push(event),
      },
    });
    const event = { oldDraggableIndex: 0, newDraggableIndex: 2 };

    wrapper.vm.handleSortableEnd(event);

    expect(filters.map((filter) => filter.id)).to.deep.equal(['f1', 'f2', 'f3']);
    expect(events).to.deep.equal([event]);
  });

  it('Splitpanes v4のresized データを親ハンドラへそのまま渡す', () => {
    const events = [];
    const wrapper = createWrapper({
      props: {
        onPaneResized: (payload) => events.push(payload),
      },
    });
    const payload = { panes: [{ min: 1, max: 100, size: 40 }, { min: 1, max: 100, size: 60 }] };

    wrapper.findComponent(SplitPanesStub).vm.$emit('resized', payload);

    expect(events).to.deep.equal([payload]);
  });

  it('スマートフォン表示では現在タブのみ描画する', () => {
    const wrapper = createWrapper({
      props: {
        isMobile: true,
        currentTabIndex: 1,
        commonColumnProps: (filter, index) => ({ index, filter, isMobile: true }),
      },
    });
    expect(wrapper.findAll('.timeline-column-stub').length).to.equal(1);
  });

  it('スマートフォンでも全タブのパネル参照先を一意にし、非選択パネルを隠す', () => {
    const wrapper = createWrapper({
      props: {
        isMobile: true,
        currentTabIndex: 1,
        commonColumnProps: (filter, index) => ({ index, filter, isMobile: true }),
      },
    });
    const panels = wrapper.findAll('[role="tabpanel"]');

    expect(panels).to.have.lengthOf(2);
    expect(panels.map((panel) => panel.attributes('id'))).to.deep.equal(['timeline-inner-0', 'timeline-inner-1']);
    expect(panels[0].attributes('aria-labelledby')).to.equal('tab-button-0');
    expect(panels[0].attributes('hidden')).to.equal('');
    expect(panels[1].attributes('aria-labelledby')).to.equal('tab-button-1');
    expect(panels[1].attributes('hidden')).to.equal(undefined);
  });
});
