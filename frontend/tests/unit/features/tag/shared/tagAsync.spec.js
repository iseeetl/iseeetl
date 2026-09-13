import { expect } from 'vitest';
import { runWithSendingAndProgress } from '@/features/tag/shared/tagAsync';

describe('タグ操作の送信状態と進捗', () => {
  it('runWithSendingAndProgressはsending/progressを制御し結果を返す', async () => {
    const sendingStates = [];
    const progressStates = [];
    const result = await runWithSendingAndProgress({
      setSending: (value) => sendingStates.push(value),
      setProgress: (value) => progressStates.push(value),
      task: async ({ onProgress }) => {
        onProgress({ loaded: 50, total: 100 });
        return 'ok';
      },
    });

    expect(result).to.equal('ok');
    expect(sendingStates).to.deep.equal([true, false]);
    expect(progressStates).to.deep.equal([50, 0]);
  });

  it('runWithSendingAndProgressは例外時もresetしてエラーを再送出する', async () => {
    const sendingStates = [];
    const progressStates = [];
    let caught = null;

    try {
      await runWithSendingAndProgress({
        setSending: (value) => sendingStates.push(value),
        setProgress: (value) => progressStates.push(value),
        task: async ({ onProgress }) => {
          onProgress({ loaded: 20, total: 100 });
          throw new Error('failure');
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.an('error');
    expect(caught.message).to.equal('failure');
    expect(sendingStates).to.deep.equal([true, false]);
    expect(progressStates).to.deep.equal([20, 0]);
  });
});
