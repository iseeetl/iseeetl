import fs from 'fs';
import path from 'path';
import { expect } from 'vitest';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const FIELD_STYLE_PATH = path.join(SRC_ROOT, 'styles', 'field.css');

const COUNTER_FIELDS = [
  ['components/floor/EditFloorDialog.vue', ['edit_floor_title', 'edit_floor_description']],
  ['components/room/EditRoomDialog.vue', ['room_title', 'room_description']],
  ['components/floor-tag/EditFloorTagDialog.vue', ['tag_name']],
  ['components/room-tag/EditRoomTagDialog.vue', ['room_tag_name']],
  ['components/quicktext/EditQuickTextGroupDialog.vue', ['qt_group_title']],
  ['components/quicktext/EditQuickTextItemDialog.vue', ['qt_item_label']],
  ['components/timeline/dialogs/EditPostDialog.vue', ['post_content']],
  ['components/timeline/dialogs/EditReplyDialog.vue', ['reply_content']],
  ['components/timeline/dialogs/EditSupplementDialog.vue', ['supplement_content']],
  ['components/timeline/inputs/MediaInput.vue', ['image_caption', 'audio_title', 'audio_description']],
  ['views/ResetPassword.vue', ['password', 'confirm-password']],
  ['views/management/CategoryTagManagement.vue', ['category-tag-name']],
];

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');

describe('共通入力欄のスタイル', () => {
  it('空欄ラベルを入力欄内に置き、フォーカスまたは値ありで上へ移す', () => {
    const style = readSource(FIELD_STYLE_PATH);

    expect(style).to.match(/\.ui-field__label\s*\{[^}]*position:\s*absolute;[^}]*top:\s*22px;/);
    expect(style).to.match(/\.ui-field--label-raised \.ui-field__label\s*\{[^}]*top:\s*0;/);
    expect(style).to.match(/\.ui-field--focused \.ui-field__label\s*\{[^}]*color:\s*var\(--ui-color-primary\);/);
  });

  it('文字数上限を常時確認する17欄でcounterを有効にする', () => {
    let count = 0;

    COUNTER_FIELDS.forEach(([relativePath, controlIds]) => {
      const source = readSource(path.join(SRC_ROOT, relativePath));

      controlIds.forEach((controlId) => {
        const staticControlId = `control-id="${controlId}"`;
        const dynamicControlId = `:control-id="mediaId('${controlId}')"`;
        const openingTag = source
          .match(/<UiField\b[^>]*>/gu)
          ?.find((tag) => tag.includes(staticControlId) || tag.includes(dynamicControlId));
        expect(openingTag, `${relativePath}: ${controlId}`).to.be.a('string');
        expect(openingTag, `${relativePath}: ${controlId}`).to.match(/\bcounter\b/);
        count += 1;
      });
    });

    expect(count).to.equal(17);
  });

  it('タイムラインの編集欄で録音操作と文字数表示が重ならない高さと余白を確保する', () => {
    const style = readSource(FIELD_STYLE_PATH);

    expect(style).to.match(/\.timeline-comment-field \.ui-field__control textarea\s*\{[^}]*min-height:\s*96px;/);
    expect(style).to.match(/\.timeline-comment-field \.ui-field__control textarea\s*\{[^}]*padding-inline-end:\s*64px;/);
    expect(style).to.match(/\.timeline-comment-field \.ui-field__counter\s*\{[^}]*inset-inline-end:\s*8px;/);
    expect(style).to.match(/\.timeline-comment-field \.record-button\s*\{[^}]*bottom:\s*8px;/);
  });
});
