import { expect } from 'vitest';
import { showSnackbar } from '@/utils/snackbar';

describe('通知メッセージの表示', () => {
  it('通知メッセージをストア経由で表示する', () => {
    const calls = [];
    const store = {
      dispatch: (type, payload) => {
        calls.push([type, payload]);
      },
    };

    showSnackbar(store, 'message', 'alert');

    expect(calls).to.deep.equal([['doShowSnackbar', { message: 'message', role: 'alert' }]]);
  });

  it('ストアが無い場合は何もしない', () => {
    let called = false;
    showSnackbar(null, 'message');
    expect(called).to.equal(false);
  });
});
