import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ManagementStatusBadge from '@/components/management/ManagementStatusBadge.vue';

describe('管理対象の状態表示（ManagementStatusBadge）', () => {
  it('既定の中立色でラベルを表示する', () => {
    const wrapper = mount(ManagementStatusBadge, {
      props: { label: '削除済み' },
    });

    expect(wrapper.text()).to.equal('削除済み');
    expect(wrapper.classes()).to.include('management-status-badge');
    expect(wrapper.classes()).to.include('management-status-badge--neutral');
    expect(wrapper.attributes('role')).to.equal(undefined);
  });

  it.each(['success', 'warning', 'danger', 'info'])('%s 配色のclassを適用する', (tone) => {
    const wrapper = mount(ManagementStatusBadge, {
      props: { label: '状態', tone },
    });

    expect(wrapper.classes()).to.include(`management-status-badge--${tone}`);
  });

  it('スロットをラベルより優先して表示する', () => {
    const wrapper = mount(ManagementStatusBadge, {
      props: { label: '既定値' },
      slots: { default: '表示中' },
    });

    expect(wrapper.text()).to.equal('表示中');
  });
});
