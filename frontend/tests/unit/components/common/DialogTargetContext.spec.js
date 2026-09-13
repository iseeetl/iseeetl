import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';

describe('ダイアログの対象情報（DialogTargetContext）', () => {
  it('ラベルと対象名を指定IDで表示し、対象名の文字方向を周囲から分離する', () => {
    const wrapper = shallowMount(DialogTargetContext, {
      props: {
        contextId: 'room-dialog-context',
        label: '対象ルーム',
        name: 'English room חדר',
      },
    });

    expect(wrapper.attributes('id')).to.equal('room-dialog-context');
    expect(wrapper.get('.dialog-target-context__label').text()).to.equal('対象ルーム');
    expect(wrapper.get('bdi.dialog-target-context__name').attributes('dir')).to.equal('auto');
    expect(wrapper.get('bdi.dialog-target-context__name').text()).to.equal('English room חדר');
  });

  it('contextId未指定時は空のid属性を出力しない', () => {
    const wrapper = shallowMount(DialogTargetContext, {
      props: {
        label: '対象ルーム',
        name: 'Room',
      },
    });

    expect(wrapper.attributes()).not.to.have.property('id');
  });
});
