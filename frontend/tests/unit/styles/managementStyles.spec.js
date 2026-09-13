import fs from 'fs';
import path from 'path';
import { expect } from 'vitest';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const MANAGEMENT_STYLE_PATH = path.join(SRC_ROOT, 'styles', 'management.css');
const MANAGEMENT_VIEWS_ROOT = path.join(SRC_ROOT, 'views', 'management');

describe('管理一覧の画面幅に応じたスタイル', () => {
  it('Pagerを狭い画面でも潰さず折り返す', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');
    const pagerList = source.match(/\.pager--management ul\s*\{([^}]*)\}/u);
    const pagerButton = source.match(/\.pager--management ul li button\s*\{([^}]*)\}/u);

    expect(pagerList).to.not.equal(null);
    expect(pagerList[1]).to.match(/display:\s*flex;/u);
    expect(pagerList[1]).to.match(/flex-wrap:\s*wrap;/u);
    expect(pagerButton).to.not.equal(null);
    expect(pagerButton[1]).to.not.match(/flex-shrink:\s*[1-9]/u);
  });

  it('320 CSS px向けに検索欄と結果領域の横はみ出しを防ぐ', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');

    expect(source).to.match(/\.management-list-results,\s*\.search-field\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*box-sizing:\s*border-box;/u);
    expect(source).to.match(/@media \(max-width:\s*480px\)\s*\{[\s\S]*?\.view \.search-field\s*\{[^}]*width:\s*100%\s*!important;[^}]*margin-inline:\s*0\s*!important;/u);
  });

  it('検索と状態絞り込み条件をPCでは同じ行、狭幅では縦に配置する', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');

    expect(source).to.match(/\.management-list-query--with-filters\s*\{[^}]*grid-template-columns:\s*minmax\(220px, 280px\) minmax\(320px, 720px\);[^}]*justify-content:\s*space-between;/u);
    expect(source).to.match(/@media \(max-width:\s*896px\)\s*\{[\s\S]*?\.management-list-query,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/u);
  });

  it('管理画面の見出しを可変高にして長いタイトルの重なりを防ぐ', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');

    expect(source).to.match(/\.management-view \.view-header\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*48px;/u);
    expect(source).to.match(/\.management-view \.view-title\s*\{[^}]*overflow-wrap:\s*anywhere;/u);
  });

  it('管理画面専用のフォーカス枠で共通設定を上書きしない', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');

    expect(source).to.not.match(/^\s*outline(?:-offset)?\s*:/gmu);
    expect(source).to.not.include('-webkit-focus-ring-color');
  });

  it('削除済みの行を中立色の背景で表示し、行全体に取り消し線を付けない', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');
    const softDelete = source.match(/\.soft-delete\s*\{([^}]*)\}/u);

    expect(softDelete).to.not.equal(null);
    expect(softDelete[1]).to.match(/background-color:\s*#f2f2f2;/u);
    expect(softDelete[1]).to.not.match(/text-decoration:\s*line-through;/u);
    expect(softDelete[1]).to.not.match(/background-color:\s*#f8d7da;/u);
  });

  it('状態バッジを色だけに依存しない共通ラベルとして描画できる', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');

    expect(source).to.match(/\.management-status-badge\s*\{[^}]*display:\s*inline-flex;[^}]*border:\s*1px solid/u);
    expect(source).to.include('.management-status-badge--success');
    expect(source).to.include('.management-status-badge--warning');
    expect(source).to.include('.management-status-badge--danger');
    expect(source).to.include('.management-status-badge--info');
  });

  it('状態、操作、補足、対象詳細を共通配置できる', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');

    expect(source).to.match(/\.management-status-list,\s*\.management-actions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*gap:/u);
    expect(source).to.match(/\.management-action-reason\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.4;/u);
    expect(source).to.match(/\.management-detail-list\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\);/u);
    expect(source).to.match(/\.management-detail-list dt\s*\{[^}]*font-weight:\s*600;/u);
    expect(source).to.match(/\.management-detail-list dd\s*\{[^}]*margin:\s*0;/u);
    expect(source).to.match(/\.management-row-actions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*white-space:\s*nowrap;/u);
    expect(source).to.match(/\.management-row-actions > \.ui-button\s*\{[^}]*white-space:\s*nowrap;/u);
    expect(source).to.match(/\.management-row-actions-group\s*\{[^}]*flex-direction:\s*column;/u);
  });

  it('一覧表を画面内に収め、横スクロールと固定の最小幅を設けない', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');
    const aiAnalysisSource = fs.readFileSync(
      path.join(MANAGEMENT_VIEWS_ROOT, 'AIAnalysisSettingManagement.vue'),
      'utf8'
    );

    expect(source).to.match(/\.management-table-scroll\s*\{[^}]*overflow-x:\s*visible;/u);
    expect(source).to.match(/\.management-table\s*\{[^}]*max-width:\s*100%;[^}]*table-layout:\s*auto;/u);
    expect(source).not.to.match(/\.management-table--(?:wide|medium|compact)\s*\{[^}]*min-width:/u);
    expect(source).to.match(/\.management-table th\s*\{[^}]*overflow-wrap:\s*normal;[^}]*word-break:\s*keep-all;/u);
    expect(aiAnalysisSource).to.match(/\.ai-analysis-settings__table\s*\{[^}]*table-layout:\s*auto;/u);
  });

  it('狭い画面では表を見出し付きのカードとして表示する', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');

    expect(source).to.match(/@media \(max-width:\s*1100px\)\s*\{[\s\S]*?\.management-table\s*\{[^}]*display:\s*block;/u);
    expect(source).to.match(/\.management-table thead\s*\{[^}]*position:\s*absolute;[^}]*clip:\s*rect\(0, 0, 0, 0\);/u);
    expect(source).to.match(/\.management-table tr\s*\{[^}]*border:\s*1px solid #d5d5d5;[^}]*border-radius:\s*6px;/u);
    expect(source).to.match(/\.management-table td\s*\{[^}]*display:\s*block;/u);
    expect(source).to.match(/\.management-table td::before\s*\{[^}]*content:\s*attr\(data-label\);/u);
  });

  it('表の外側をスクロール領域にせず、すべてのセルにカード用の見出しを付ける', () => {
    const viewFiles = fs
      .readdirSync(MANAGEMENT_VIEWS_ROOT)
      .filter((file) => file.endsWith('.vue'));
    const tableViews = viewFiles.flatMap((file) => {
      const source = fs.readFileSync(path.join(MANAGEMENT_VIEWS_ROOT, file), 'utf8');
      if (!source.includes('<table')) return [];
      const scrollContainer = source.match(/<div(?=[^>]*class="management-table-scroll")[^>]*>/u);
      const cells = Array.from(source.matchAll(/<td\b[^>]*>/gu), (match) => match[0]);
      return [{
        file,
        scrollContainer: scrollContainer?.[0] || '',
        cells,
        source,
      }];
    });

    expect(tableViews).to.have.lengthOf(13);
    tableViews.forEach(({ file, scrollContainer, cells, source }) => {
      expect(scrollContainer, file).not.to.include('role="region"');
      expect(scrollContainer, file).not.to.include('tabindex="0"');
      expect(scrollContainer, file).not.to.include('aria-label');
      expect(cells.length, file).to.be.greaterThan(0);
      cells.forEach((cell) => expect(cell, file).to.include('data-label='));
      expect(source, file).not.to.match(/min-width:\s*(?:960|720|560)px/u);
    });
  });

  it('投稿一覧の5列幅を合計100%で定義する', () => {
    const source = fs.readFileSync(MANAGEMENT_STYLE_PATH, 'utf8');

    expect(source).to.match(/\.post-management__context-column\s*\{[^}]*width:\s*18%;/u);
    expect(source).to.match(/\.post-management__content-column\s*\{[^}]*width:\s*32%;/u);
    expect(source).to.match(/\.post-management__status-column\s*\{[^}]*width:\s*16%;/u);
    expect(source).to.match(/\.post-management__date-column\s*\{[^}]*width:\s*18%;/u);
    expect(source).to.match(/\.post-management__action-column\s*\{[^}]*width:\s*16%;/u);
  });
});
