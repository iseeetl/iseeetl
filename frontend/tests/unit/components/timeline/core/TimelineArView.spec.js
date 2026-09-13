import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineArView from '@/components/timeline/core/TimelineArView.vue';

const TimelineColumnStub = {
  name: 'TimelineColumn',
  template: '<div class="timeline-column-stub"></div>',
  props: ['index', 'filter'],
};
const SplitPanesStub = { name: 'splitpanes', template: '<div><slot/></div>' };
const PaneStub = { name: 'pane', template: '<div><slot/></div>', props: ['size'] };

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineArView, {
    stubs: {
      TimelineColumn: TimelineColumnStub,
      splitpanes: SplitPanesStub,
      pane: PaneStub,
    },
    props: {
      filters: [{ id: 'f1' }, { id: 'f2' }],
      isMobile: false,
      isArAll: false,
      commonColumnProps: (filter, index) => ({ index, filter }),
      commonColumnEvents: {},
      ...(overrides.props || {}),
    },
  });

describe('タイムラインのAR表示', () => {
  it('スマートフォンまたはAR全列でない場合は1カラムのみ表示する', () => {
    const wrapper = createWrapper({ props: { isMobile: true, isArAll: false } });
    expect(wrapper.findAll('.timeline-column-stub').length).to.equal(1);
  });

  it('PCかつAR全列の場合はフィルタ数だけカラムを表示する', () => {
    const wrapper = createWrapper({ props: { isMobile: false, isArAll: true } });
    expect(wrapper.findAll('.timeline-column-stub').length).to.equal(2);
  });
});
