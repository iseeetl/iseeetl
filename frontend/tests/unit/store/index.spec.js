import { expect } from 'vitest';

import { createApplicationStore } from '@/store/index.js';

describe('ストアの生成', () => {
  it('既定のストアにタイムラインの状態と名前空間を登録しない', () => {
    const store = createApplicationStore();

    expect(store.state).to.not.have.property('timeline');
    expect(store._modulesNamespaceMap).to.not.have.property('timeline/');
  });

  it('指定したモジュールを名前空間付きで登録できる', () => {
    const testModule = {
      namespaced: true,
      state: () => ({ value: 'initial' }),
      mutations: {
        setValue(state, value) {
          state.value = value;
        },
      },
    };
    const store = createApplicationStore({ modules: { testModule } });

    expect(store.state.testModule.value).to.equal('initial');
    expect(store._modulesNamespaceMap).to.have.property('testModule/');
    store.commit('testModule/setValue', 'updated');
    expect(store.state.testModule.value).to.equal('updated');
  });

  it('root の getters が利用できる', () => {
    const store = createApplicationStore();

    expect(store.getters).to.have.property('userIsLogin');
  });

  it('生成したストア間でroot 状態を共有しない', () => {
    const first = createApplicationStore();
    const second = createApplicationStore();

    first.state.user.id = 'user-1';
    first.state.tag.list.push('tag-1');

    expect(second.state.user.id).to.equal(null);
    expect(second.state.tag.list).to.deep.equal([]);
  });
});
