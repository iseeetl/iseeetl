import { expect } from 'vitest';
import { closeTagEditDialog, showTagEditDialog, successTagEditDialog } from '@/features/tag/shared/tagManagementView';

describe('タグ管理画面の共通処理', () => {
  it('showTagEditDialogは表示状態と選択値を更新する', () => {
    const vm = {
      dialogVisible: false,
      selectedTag: null,
    };
    const data = { _id: 't1' };

    showTagEditDialog(vm, { visibleKey: 'dialogVisible', selectedKey: 'selectedTag' }, data);

    expect(vm.dialogVisible).to.equal(true);
    expect(vm.selectedTag).to.deep.equal(data);
  });

  it('closeTagEditDialogは表示状態を閉じる', () => {
    const vm = { dialogVisible: true };

    closeTagEditDialog(vm, { visibleKey: 'dialogVisible' });

    expect(vm.dialogVisible).to.equal(false);
  });

  it('successTagEditDialogはreplaceItem後にcloseを呼ぶ', () => {
    let replaced = null;
    let closeCount = 0;
    const vm = {
      $refs: {
        listBase: {
          replaceItem: (item) => {
            replaced = item;
          },
        },
      },
    };
    const handler = successTagEditDialog(vm, {
      close: () => {
        closeCount += 1;
      },
    });
    const data = { _id: 't1' };

    handler(data);

    expect(replaced).to.deep.equal(data);
    expect(closeCount).to.equal(1);
  });

  it('successTagEditDialogはlistBaseが無くてもcloseを呼ぶ', () => {
    let closeCount = 0;
    const vm = { $refs: {} };
    const handler = successTagEditDialog(vm, {
      close: () => {
        closeCount += 1;
      },
    });

    handler({ _id: 't1' });

    expect(closeCount).to.equal(1);
  });
});
