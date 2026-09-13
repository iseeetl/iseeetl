import { expect } from 'vitest';
import { handleAuthError } from '@/utils/authError';

import flushPromises from '../helpers/flushPromises';

describe('認証エラー時の共通処理', () => {
  it('未処理の401の場合にフォールバックログアウトと遷移を行う', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const store = { dispatch: (action) => dispatchCalls.push(action) };
    const router = { push: (payload) => pushCalls.push(payload) };

    const result = handleAuthError({ response: { status: 401 } }, { store, router });

    expect(result).to.equal(true);
    expect(dispatchCalls).to.deep.equal(['doLogout']);
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });

  it('APIクライアント処理済みの401はログアウトを重ねず遷移だけ行う', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const store = { dispatch: (action) => dispatchCalls.push(action) };
    const router = { push: (payload) => pushCalls.push(payload) };
    const error = { response: { status: 401 }, config: { _userLogoutHandled: true } };

    const result = handleAuthError(error, { store, router });

    expect(result).to.equal(true);
    expect(dispatchCalls).to.deep.equal([]);
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });

  it('401 以外は何もしない', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const store = { dispatch: (action) => dispatchCalls.push(action) };
    const router = { push: (payload) => pushCalls.push(payload) };

    const result = handleAuthError({ response: { status: 403 } }, { store, router });

    expect(result).to.equal(false);
    expect(dispatchCalls).to.deep.equal([]);
    expect(pushCalls).to.deep.equal([]);
  });

  it('権限不足の401ではログアウトもログイン画面遷移も行わない', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const store = { dispatch: (action) => dispatchCalls.push(action) };
    const router = { push: (payload) => pushCalls.push(payload) };
    const error = {
      response: { status: 401, data: { error: { code: 'INVALID_PERMISSION' } } },
    };

    const result = handleAuthError(error, { store, router });

    expect(result).to.equal(false);
    expect(dispatchCalls).to.deep.equal([]);
    expect(pushCalls).to.deep.equal([]);
  });

  it('router.pushでNavigationDuplicatedが発生しても例外にしない', async () => {
    const dispatchCalls = [];
    let called = 0;
    const duplicated = new Error('Avoided redundant navigation to current location');
    duplicated.name = 'NavigationDuplicated';

    const store = { dispatch: (action) => dispatchCalls.push(action) };
    const router = {
      push: () => {
        called += 1;
        return Promise.reject(duplicated);
      },
    };

    const result = handleAuthError({ response: { status: 401 } }, { store, router });
    await flushPromises();

    expect(result).to.equal(true);
    expect(called).to.equal(1);
    expect(dispatchCalls).to.deep.equal(['doLogout']);
  });
});
