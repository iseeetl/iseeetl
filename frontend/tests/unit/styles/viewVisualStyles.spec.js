import fs from 'fs';
import path from 'path';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { expect } from 'vitest';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const DIALOG_STYLE_PATH = path.join(SRC_ROOT, 'styles', 'dialog.css');
const FLOOR_PATH = path.join(SRC_ROOT, 'views', 'Floor.vue');
const ROOM_PATH = path.join(SRC_ROOT, 'views', 'Room.vue');
const TIMELINE_PATH = path.join(SRC_ROOT, 'views', 'Timeline.vue');
const TIMELINE_NORMAL_VIEW_PATH = path.join(
  SRC_ROOT,
  'components',
  'timeline',
  'core',
  'TimelineNormalView.vue'
);
const TIMELINE_COLUMN_PATH = path.join(SRC_ROOT, 'components', 'timeline', 'core', 'TimelineColumn.vue');
const TIMELINE_TABS_PATH = path.join(SRC_ROOT, 'components', 'timeline', 'core', 'TimelineTabs.vue');
const TIMELINE_MOBILE_BUTTONS_PATH = path.join(
  SRC_ROOT,
  'components',
  'timeline',
  'core',
  'TimelineMobilePostButtons.vue'
);
const TIMELINE_EDITOR_DIALOG_PATH = path.join(
  SRC_ROOT,
  'components',
  'timeline',
  'dialogs',
  'TimelineEditorDialog.vue'
);
const TIMELINE_EDITOR_DIALOG_USAGE_PATHS = [
  'EditPostDialog.vue',
  'EditReplyDialog.vue',
  'EditSupplementDialog.vue',
].map((fileName) =>
  path.join(SRC_ROOT, 'components', 'timeline', 'dialogs', fileName)
);
const GALLERY_DIALOG_PATH = path.join(
  SRC_ROOT,
  'components',
  'timeline',
  'dialogs',
  'GalleryDialog.vue'
);
const APP_MENU_PATH = path.join(SRC_ROOT, 'components', 'app', 'AppMenu.vue');
const PROFILE_DIALOG_PATH = path.join(SRC_ROOT, 'components', 'profile', 'ProfileDialog.vue');
const SCOPED_AI_ANALYSIS_DIALOG_PATH = path.join(
  SRC_ROOT,
  'components',
  'analysis',
  'ScopedAIAnalysisSettingDialog.vue'
);
const AI_ANALYSIS_FORM_FIELDS_PATH = path.join(
  SRC_ROOT,
  'components',
  'analysis',
  'AIAnalysisSettingFormFields.vue'
);
const AI_ANALYSIS_MANAGEMENT_PATH = path.join(
  SRC_ROOT,
  'views',
  'management',
  'AIAnalysisSettingManagement.vue'
);

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');
const readUnscopedStyle = (filePath) => {
  const source = readSource(filePath);
  const style = parse(source, { filename: filePath }).descriptor.styles.find(
    (descriptor) => !descriptor.scoped
  );

  expect(style).to.not.equal(undefined);
  return style.content;
};
const readScopedStyle = (filePath) => {
  const source = readSource(filePath);
  const style = source.match(/<style scoped>([\s\S]*)<\/style>/);

  expect(style).to.not.equal(null);
  return style[1];
};
const compileScopedStyle = (filePath) => {
  const source = readSource(filePath);
  const style = parse(source, { filename: filePath }).descriptor.styles.find(
    (descriptor) => descriptor.scoped
  );

  expect(style).to.not.equal(undefined);
  const result = compileStyle({
    source: style.content,
    filename: filePath,
    id: 'data-v-view-visual-test',
    scoped: true,
  });
  expect(result.errors).to.deep.equal([]);
  return result.code;
};

describe('画面ごとの表示スタイル', () => {
  it('フロア上部のボタンを検索項目の高さまで伸長させない', () => {
    const floorStyle = readScopedStyle(FLOOR_PATH);

    expect(floorStyle).to.match(/\.floor-action\s*\{[^}]*align-items:\s*flex-start;/);
    expect(floorStyle).to.match(/\.search-floor\s*\{[^}]*align-items:\s*flex-start;/);
  });

  it('フロア検索ラベルをフォーカスまたは値ありで上へ移し、アイコンを入力要素の上下中央に置く', () => {
    const floorSource = readSource(FLOOR_PATH);
    const floorStyle = readScopedStyle(FLOOR_PATH);

    expect(floorSource).to.include(`:class="{ 'search-floor-input--has-value': search !== '' }"`);
    expect(floorStyle).to.match(
      /\.search-floor-input:focus-within\s*:deep\(\.ui-field__label\),\s*\.search-floor-input--has-value\s*:deep\(\.ui-field__label\)\s*\{/
    );
    expect(floorStyle).to.match(/\.search-floor-icon\s*\{[^}]*top:\s*50%;[^}]*transform:\s*translateY\(-50%\);/);
  });

  it('フロアページャーの項目styleを直接子に限定してUiIconのspanへ適用しない', () => {
    const floorStyle = readScopedStyle(FLOOR_PATH);
    const directItemSelectors = floorStyle.match(/\.pager ul li > a,\s*\.pager ul li > span\s*\{/g) || [];

    expect(directItemSelectors).to.have.lengthOf(2);
    expect(floorStyle).to.not.match(/\.pager ul li (?:a|span)(?:,|\s*\{)/);
  });

  it('ルームの並べ替え用つまみの説明を一覧行の上端に表示する', () => {
    const roomSource = readSource(ROOM_PATH);
    const roomStyle = readScopedStyle(ROOM_PATH);

    expect(roomSource).to.include('class="room-handle-tooltip"');
    expect(roomStyle).to.match(/\.room-handle-tooltip\s*\{[^}]*align-self:\s*flex-start;/);
  });

  it('ルームの操作ボタンをスマートフォン幅で折り返し、先頭の操作を見切れさせない', () => {
    const roomStyle = readScopedStyle(ROOM_PATH);
    const mobileStyle = roomStyle.slice(roomStyle.indexOf('@media screen and (max-width: 896px)'));

    expect(mobileStyle).to.match(
      /\.room-action\s*\{[^}]*flex-wrap:\s*wrap;[^}]*justify-content:\s*flex-start;[^}]*gap:\s*8px;/
    );
    expect(mobileStyle).to.match(
      /\.room-action \.ui-button\s*\{[^}]*min-height:\s*44px;[^}]*margin:\s*0;/
    );
  });

  it('タイムラインはアプリ枠の残りの高さに収め、外側をスクロールさせない', () => {
    const timelineStyle = readUnscopedStyle(TIMELINE_PATH);
    const normalViewStyle = readScopedStyle(TIMELINE_NORMAL_VIEW_PATH);

    expect(timelineStyle).to.match(
      /\.timeline-page\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/
    );
    expect(timelineStyle).to.match(
      /\.view-wrapper\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/
    );
    expect(normalViewStyle).to.match(
      /\.view\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/
    );
    expect(timelineStyle).to.not.include('calc(100svh - 48px)');
    expect(normalViewStyle).to.not.include('calc(100svh - 48px)');
  });

  it('スマートフォンタイムラインはDOM順ではなく選択中のカラムを表示する', () => {
    const timelineStyle = readUnscopedStyle(TIMELINE_PATH);
    const mobileStart = timelineStyle.indexOf('@media (max-width: 896px)');
    const mobileEnd = timelineStyle.indexOf(
      '/* ------------------------------------------------------------\n   ARmode',
      mobileStart
    );
    const mobileStyle = timelineStyle.slice(mobileStart, mobileEnd);

    expect(mobileStyle).to.match(
      /\.mobile-wrapper\s*>\s*\.timeline-inner\s*\{[^}]*display:\s*flex;/
    );
    expect(mobileStyle).to.not.match(/\.timeline-inner:first-child/);
    expect(mobileStyle).to.not.match(/\.timeline-inner\s*\{[^}]*display:\s*none;/);
  });

  it('タイムラインタイトルはneutral アイコンだけを暗色にし、primaryとdangerは共通配色を継承する', () => {
    const timelineStyle = readScopedStyle(TIMELINE_COLUMN_PATH);

    expect(timelineStyle).to.match(
      /\.timeline-title\s+\.ui-button--neutral\s+\.ui-icon\s*\{[^}]*color:\s*rgb\(23,\s*31,\s*42\);/
    );
    expect(timelineStyle).to.not.match(/\.timeline-title\s+\.ui-icon\s*\{/);
    expect(timelineStyle).to.not.match(/\.timeline-title\s+\.ui-button--primary\s+\.ui-icon\s*\{/);
  });

  it('スマートフォンタイムラインタブは要約アイコンだけを暗色にし、操作ボタンの配色を上書きしない', () => {
    const tabsStyle = readScopedStyle(TIMELINE_TABS_PATH);

    expect(tabsStyle).to.include('.tab-item .tab-button .ui-icon');
    expect(tabsStyle).to.include('.tab-item-non-active .tab-button .ui-icon');
    expect(tabsStyle).to.not.include('.tab-item .ui-icon {');
    expect(tabsStyle).to.not.include('.tab-item-non-active .ui-icon {');
  });

  it('スマートフォン投稿ボタン内のアイコンと文言を縦中央に揃える', () => {
    const mobileButtonStyle = readScopedStyle(TIMELINE_MOBILE_BUTTONS_PATH);

    expect(mobileButtonStyle).to.match(
      /\.timeline-menu-icon-wrapper\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/
    );
  });

  it('スマートフォンタイムライン編集ダイアログを透過のままほぼ全画面にし、操作を右上へ固定する', () => {
    const editorSource = readSource(TIMELINE_EDITOR_DIALOG_PATH);
    const editorStyle = readScopedStyle(TIMELINE_EDITOR_DIALOG_PATH);
    const compiledEditorStyle = compileScopedStyle(TIMELINE_EDITOR_DIALOG_PATH);
    const mobileStyle = compiledEditorStyle.slice(
      compiledEditorStyle.indexOf('@media screen and (max-width: 896px)')
    );

    expect(editorSource).to.include(
      'class="timeline-editor-dialog__mobile-actions ui-dialog__header-end mobile-item"'
    );
    expect(editorStyle).to.match(
      /\.timeline-editor-dialog__mobile-actions\s*\{[^}]*display:\s*flex\s*!important;[^}]*gap:\s*8px;/
    );
    expect(mobileStyle).to.match(
      /\.timeline-editor-dialog\s*\{[^}]*--ui-dialog-width:\s*100vw;/
    );
    expect(mobileStyle).to.match(
      /\.timeline-editor-dialog \.ui-dialog__panel\s*\{[^}]*height:\s*calc\(100vh - var\(--ui-dialog-viewport-gutter\)\);[^}]*height:\s*calc\(100dvh - var\(--ui-dialog-viewport-gutter\)\);[^}]*overflow:\s*hidden;/
    );
    expect(mobileStyle).to.match(
      /\.timeline-editor-dialog \.ui-dialog__content\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overscroll-behavior:\s*contain;/
    );
    expect(mobileStyle).to.match(
      /\.timeline-editor-dialog \.ui-dialog__heading\s*\{[^}]*max-width:\s*calc\(100% - 176px\);/
    );
    TIMELINE_EDITOR_DIALOG_USAGE_PATHS.forEach((filePath) => {
      expect(readSource(filePath)).to.include('class="transparent-dialog"');
    });
    expect(editorStyle).to.not.match(/background(?:-color)?:/);
  });

  it('ギャラリーは暗い領域内に画像・動画全体を収め、操作を左右に分ける', () => {
    const galleryStyle = readScopedStyle(GALLERY_DIALOG_PATH);
    const compiledGalleryStyle = compileScopedStyle(GALLERY_DIALOG_PATH);
    const dialogStyle = readSource(DIALOG_STYLE_PATH);

    expect(compiledGalleryStyle).to.match(
      /\.gallery-dialog\s+\.ui-dialog__backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.84\);/
    );
    expect(compiledGalleryStyle).to.match(
      /\.gallery-dialog\s+\.ui-dialog__panel\s*\{[^}]*width:\s*calc\(100vw - 64px\);[^}]*height:\s*calc\(100dvh - 64px\);[^}]*overflow:\s*hidden;[^}]*background:\s*#111;/
    );
    expect(compiledGalleryStyle).to.match(
      /\.gallery-dialog\s+\.ui-dialog__content\s*\{[^}]*padding:\s*0;[^}]*overflow:\s*hidden;/
    );
    expect(compiledGalleryStyle).to.match(
      /\.gallery-content\[data-v-view-visual-test\]\s*\{[^}]*overflow:\s*hidden;[^}]*background:\s*#111;/
    );
    expect(compiledGalleryStyle).to.not.match(/\.gallery-dialog\[data-v-view-visual-test\]/);
    expect(dialogStyle).to.not.match(/\.gallery-dialog\s+\.ui-dialog__panel\s*\{[^}]*width:\s*auto;/);
    expect(galleryStyle).to.match(
      /\.gallery-image\s*\{[^}]*display:\s*block;[^}]*object-fit:\s*contain;/
    );
    expect(galleryStyle).to.match(
      /\.gallery-image,\s*\.gallery-video\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/
    );
    expect(galleryStyle).to.match(
      /\.gallery-video\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/
    );
    expect(galleryStyle).to.match(
      /\.gallery-video video\s*\{[^}]*width:\s*auto;[^}]*height:\s*auto;[^}]*max-width:\s*100%;[^}]*max-height:\s*100%;[^}]*object-fit:\s*contain;/
    );
    expect(galleryStyle).to.match(
      /\.gallery-download,\s*\.gallery-close\s*\{[^}]*width:\s*44px\s*!important;[^}]*height:\s*44px\s*!important;[^}]*position:\s*absolute\s*!important;/
    );
    expect(galleryStyle).to.match(/\.gallery-download\s*\{[^}]*left:\s*calc\(12px \+ env\(safe-area-inset-left\)\);/);
    expect(galleryStyle).to.match(/\.gallery-close\s*\{[^}]*right:\s*calc\(12px \+ env\(safe-area-inset-right\)\);/);

    const mobileStyle = compiledGalleryStyle.slice(
      compiledGalleryStyle.indexOf('@media screen and (max-width: 896px)')
    );
    expect(mobileStyle).to.match(
      /\.gallery-dialog\s+\.ui-dialog__panel\s*\{[^}]*width:\s*calc\(100vw - 16px\);[^}]*max-width:\s*calc\(100vw - 16px\);[^}]*height:\s*calc\(100dvh - 16px\);[^}]*max-height:\s*calc\(100dvh - 16px\);/
    );
  });

  it('アプリメニューのアイコンに補助色を使う', () => {
    const appMenuStyle = readScopedStyle(APP_MENU_PATH);

    expect(appMenuStyle).to.match(/\.app-menu__item-icon\s*\{[^}]*color:\s*rgba\(0,\s*0,\s*0,\s*0\.54\);/);
  });

  it('アプリメニューの管理項目と末尾の閉じる操作を視覚的に区切る', () => {
    const appMenuStyle = readScopedStyle(APP_MENU_PATH);

    expect(appMenuStyle).to.match(
      /\.app-menu__administrator-section\s*\{[^}]*border-block-start:\s*1px solid #ddd;/
    );
    expect(appMenuStyle).to.match(/\.app-menu__group-start\s*\{[^}]*margin-block-start:\s*8px;/);
    expect(appMenuStyle).to.match(
      /\.app-menu__footer\s*\{[^}]*margin-block-start:\s*auto;[^}]*border-block-start:\s*1px solid #ddd;/
    );
  });

  it('プロフィールの画像削除ボタンだけを円形にする', () => {
    const profileStyle = readScopedStyle(PROFILE_DIALOG_PATH);

    expect(profileStyle).to.match(/\.avatar-remove-button\s*\{[^}]*border-radius:\s*50%;/);
  });

  it('フロア・ルームのAI解析設定はPCでは幅広の表、スマートフォンではカードにする', () => {
    const dialogStyle = readScopedStyle(SCOPED_AI_ANALYSIS_DIALOG_PATH);
    const compiledDialogStyle = compileScopedStyle(SCOPED_AI_ANALYSIS_DIALOG_PATH);

    expect(compiledDialogStyle).to.match(
      /\.scoped-ai-analysis-settings-dialog\s*\{[^}]*--ui-dialog-width:\s*920px;/
    );
    expect(compiledDialogStyle).not.to.match(
      /\.scoped-ai-analysis-settings-dialog\[data-v-view-visual-test\]/
    );
    expect(dialogStyle).to.match(/\.settings-table\s*\{[^}]*min-width:\s*800px;/);
    expect(dialogStyle).to.match(/\.settings-table th\s*\{[^}]*white-space:\s*nowrap;/);
    expect(dialogStyle).to.match(/\.settings-card-list\s*\{[^}]*display:\s*none;/);
    expect(dialogStyle).to.include('@media (max-width: 896px)');

    const mobileStyle = dialogStyle.slice(dialogStyle.indexOf('@media (max-width: 896px)'));
    expect(mobileStyle).to.match(/\.settings-table-wrap\s*\{[^}]*display:\s*none;/);
    expect(mobileStyle).to.match(/\.settings-card-list\s*\{[^}]*display:\s*grid;/);
  });

  it('共通AI解析設定ダイアログをフロア／ルームと同じ幅広・縦一列フォームで表示する', () => {
    const managementStyle = readScopedStyle(AI_ANALYSIS_MANAGEMENT_PATH);
    const compiledManagementStyle = compileScopedStyle(AI_ANALYSIS_MANAGEMENT_PATH);
    const formFieldsStyle = readScopedStyle(AI_ANALYSIS_FORM_FIELDS_PATH);

    expect(compiledManagementStyle).to.match(
      /\.ai-analysis-setting-form-dialog\s*\{[^}]*--ui-dialog-width:\s*920px;/
    );
    expect(formFieldsStyle).to.match(
      /\.ai-analysis-setting-fields\s*\{[^}]*display:\s*grid;[^}]*gap:\s*16px;/
    );
    expect(formFieldsStyle).to.match(
      /\.ai-analysis-setting-fields__result-user-option\s*\{[^}]*display:\s*flex;[^}]*padding:\s*6px 0;/
    );
    expect(managementStyle).not.to.include('.ai-analysis-settings__setting-form');
  });

  it('AI解析結果の投稿者検索では入力欄とボタンを同じ高さで並べる', () => {
    const formFieldsStyle = readScopedStyle(AI_ANALYSIS_FORM_FIELDS_PATH);

    expect(formFieldsStyle).to.match(
      /\.ai-analysis-setting-fields__search-control\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*align-items:\s*end;/
    );
    expect(formFieldsStyle).to.match(
      /\.ai-analysis-setting-fields__search-control\s+:deep\(\.ui-button\)\s*\{[^}]*align-self:\s*stretch;[^}]*margin:\s*0;/
    );
  });

  it('共通AI解析設定は操作を分離し、見出しと行ボタンを横並びに保つ', () => {
    const managementSource = readSource(AI_ANALYSIS_MANAGEMENT_PATH);
    const managementStyle = readScopedStyle(AI_ANALYSIS_MANAGEMENT_PATH);

    expect(managementSource).to.include('class="ai-analysis-settings__header"');
    expect(managementSource).to.include(
      'class="management-table management-table--wide ai-analysis-settings__table"'
    );
    expect(managementSource).to.include('class="ai-analysis-settings__action-cell"');
    expect(managementStyle).to.match(
      /\.ai-analysis-settings__header\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/
    );
    expect(managementStyle).to.match(
      /\.ai-analysis-settings__table\s*\{[^}]*table-layout:\s*auto;/
    );
    expect(managementStyle).to.match(
      /\.ai-analysis-settings__table th\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*normal;[^}]*word-break:\s*keep-all;/
    );
    expect(managementStyle).to.match(
      /\.ai-analysis-settings__row-actions\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*justify-content:\s*flex-end;/
    );

    const mobileStyle = managementStyle.slice(managementStyle.indexOf('@media (max-width: 480px)'));
    expect(mobileStyle).to.match(
      /\.ai-analysis-settings :deep\(\.view-header\)\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*48px;/
    );
    expect(mobileStyle).to.match(
      /\.ai-analysis-settings__header\s*\{[^}]*flex-wrap:\s*wrap;/
    );
  });
});
