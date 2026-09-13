import fs from 'fs';
import path from 'path';
import { expect } from 'vitest';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const DIALOG_STYLE_PATH = path.join(SRC_ROOT, 'styles', 'dialog.css');
const TOKENS_STYLE_PATH = path.join(SRC_ROOT, 'styles', 'tokens.css');
const BUTTON_PATH = path.join(SRC_ROOT, 'components', 'ui', 'UiButton.vue');
const CONFIRM_DIALOG_PATH = path.join(SRC_ROOT, 'components', 'common', 'ConfirmDialog.vue');
const BASE_EDIT_DIALOG_PATH = path.join(SRC_ROOT, 'components', 'common', 'BaseEditDialog.vue');
const BASE_MEMBER_DIALOG_PATH = path.join(SRC_ROOT, 'components', 'common', 'BaseMemberDialog.vue');
const DELETE_ROOM_DIALOG_PATH = path.join(SRC_ROOT, 'components', 'room', 'DeleteRoomDialog.vue');
const LEAVE_ROOM_MEMBER_DIALOG_PATH = path.join(
  SRC_ROOT,
  'components',
  'room-member',
  'LeaveRoomMemberDialog.vue'
);

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');

describe('共通ダイアログのスタイル', () => {
  it('共通の幅と画面端の余白を全ダイアログのパネルへ適用する', () => {
    const dialogSource = readSource(DIALOG_STYLE_PATH);
    const tokenSource = readSource(TOKENS_STYLE_PATH);

    expect(tokenSource).to.match(/--ui-dialog-width-compact:\s*400px;/);
    expect(dialogSource).to.match(
      /\.ui-dialog\s*\{[^}]*--ui-dialog-width:\s*var\(--ui-dialog-width-compact\);[^}]*--ui-dialog-viewport-gutter:\s*32px;/
    );
    expect(dialogSource).to.match(
      /\.ui-dialog__panel\s*\{[^}]*width:\s*var\(--ui-dialog-width\);[^}]*max-width:\s*calc\(100vw - var\(--ui-dialog-viewport-gutter\)\);[^}]*max-height:\s*calc\(100vh - var\(--ui-dialog-viewport-gutter\)\);[^}]*max-height:\s*calc\(100dvh - var\(--ui-dialog-viewport-gutter\)\);/
    );
    expect(dialogSource).to.match(
      /@media screen and \(max-width:\s*896px\)\s*\{\s*\.ui-dialog\s*\{\s*--ui-dialog-viewport-gutter:\s*16px;\s*\}\s*\}/
    );
  });

  it('PCとスマートフォンの表示中UiButtonでinline-flexを維持する', () => {
    const dialogSource = readSource(DIALOG_STYLE_PATH);

    expect(dialogSource).to.include('.ui-button.desktop-item {\n  display: inline-flex !important;\n}');
    expect(dialogSource).to.include('.ui-button.mobile-item {\n    display: inline-flex !important;\n  }');
    expect(dialogSource).to.include('.ui-button.desktop-item {\n    display: none !important;\n  }');
  });

  it('ダイアログのヘッダ直下のボタンと左右の操作グループのアイコンボタンだけを円形にする', () => {
    const dialogSource = readSource(DIALOG_STYLE_PATH);
    const buttonSource = readSource(BUTTON_PATH);

    expect(dialogSource).to.include(
      '.ui-dialog__header-start.ui-button--icon-only,\n.ui-dialog__header-end.ui-button--icon-only,\n.ui-dialog__header-start .ui-button--icon-only,\n.ui-dialog__header-end .ui-button--icon-only'
    );
    expect(dialogSource).to.match(
      /\.ui-dialog__header-start\.ui-button--icon-only,\s*\.ui-dialog__header-end\.ui-button--icon-only,\s*\.ui-dialog__header-start \.ui-button--icon-only,\s*\.ui-dialog__header-end \.ui-button--icon-only\s*\{[^}]*border-radius:\s*50%;[^}]*\}/
    );
    expect(buttonSource).to.match(/\.ui-button\s*\{[^}]*border-radius:\s*3px;/);
    expect(buttonSource).to.not.match(/\.ui-button--icon-only\s*\{[^}]*border-radius:\s*50%;/);
  });

  it('ダイアログ下部の操作を右寄せで並べ、左側グループだけを左へ分ける', () => {
    const dialogSource = readSource(DIALOG_STYLE_PATH);

    expect(dialogSource).to.match(
      /\.ui-dialog__actions\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*flex-end;/
    );
    expect(dialogSource).to.match(/\.ui-dialog__actions\s*>\s*\.left\s*\{[^}]*margin-inline-end:\s*auto;/);
  });

  it('スマートフォン用のヘッダ操作があれば空のフッタを表示しない', () => {
    const sources = [
      [readSource(CONFIRM_DIALOG_PATH), 'confirm-dialog--actions-adjacent'],
      [readSource(BASE_EDIT_DIALOG_PATH), 'base-edit-dialog--actions-adjacent'],
      [readSource(BASE_MEMBER_DIALOG_PATH), 'base-member-dialog'],
      [readSource(DELETE_ROOM_DIALOG_PATH), 'room-delete-dialog'],
      [readSource(LEAVE_ROOM_MEMBER_DIALOG_PATH), 'leave-room-member-dialog'],
    ];

    sources.forEach(([source, dialogClass]) => {
      expect(source).to.match(
        new RegExp(
          `@media screen and \\(max-width: 896px\\)[\\s\\S]*\\.${dialogClass.replaceAll(
            '-',
            '\\-'
          )} \\.ui-dialog__actions\\) \\{[\\s\\S]*?display: none;`
        )
      );
    });
  });
});
