import fs from 'fs';
import path from 'path';
import { expect } from 'vitest';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const TOKENS_PATH = path.join(SRC_ROOT, 'styles', 'tokens.css');
const OVERRIDE_PATH = path.join(SRC_ROOT, 'styles', 'override.css');
const TIMELINE_COLUMN_PATH = path.join(SRC_ROOT, 'components', 'timeline', 'core', 'TimelineColumn.vue');

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');

const relativeLuminance = ([red, green, blue]) => {
  const linearComponents = [red, green, blue].map((component) => {
    const normalized = component / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linearComponents[0] + 0.7152 * linearComponents[1] + 0.0722 * linearComponents[2];
};

const contrastRatio = (first, second) => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
};

const collectStyleSources = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .reduce((files, entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return files.concat(collectStyleSources(entryPath));
      if (entry.isFile() && (entry.name.endsWith('.css') || entry.name.endsWith('.vue'))) {
        files.push(entryPath);
      }
      return files;
    }, []);

const findOutlineDeclarations = (filePath) => {
  const source = readSource(filePath);
  const declarations = [];
  const pattern = /^\s*(outline(?:-offset)?)\s*:\s*([^;]+);/gm;
  let match = pattern.exec(source);
  while (match) {
    declarations.push({
      file: path.relative(SRC_ROOT, filePath),
      property: match[1],
      value: match[2].trim(),
    });
    match = pattern.exec(source);
  }
  return declarations;
};

describe('共通のフォーカス表示', () => {
  it('共通のフォーカス枠をtokens.cssで定義する', () => {
    const tokensSource = readSource(TOKENS_PATH);
    const focusBlock = tokensSource.match(
      /:focus-visible,\s*article\[tabindex='-1'\]:focus\s*\{([^}]*)\}/
    );

    expect(focusBlock).to.not.equal(null);
    expect(focusBlock[1]).to.include('outline: 2px solid var(--ui-color-focus);');
    expect(focusBlock[1]).to.include('outline-offset: 2px;');
  });

  it('共通のフォーカス枠と流れる本文用の内側の枠を定義する', () => {
    const declarations = collectStyleSources(SRC_ROOT).reduce(
      (result, filePath) => result.concat(findOutlineDeclarations(filePath)),
      []
    );

    expect(declarations).to.deep.equal([
      ...['AnimationPostItem.vue', 'AnimationReplyItem.vue'].flatMap((file) => [
        { file: path.join('components', 'timeline', 'items', file), property: 'outline', value: '2px solid currentColor' },
        { file: path.join('components', 'timeline', 'items', file), property: 'outline-offset', value: '-2px' },
      ]),
      {
        file: path.join('styles', 'tokens.css'),
        property: 'outline',
        value: '2px solid var(--ui-color-focus)',
      },
      {
        file: path.join('styles', 'tokens.css'),
        property: 'outline-offset',
        value: '2px',
      },
    ]);
  });

  it('後から読み込むスタイルで共通のフォーカス枠を上書きしない', () => {
    const mainSource = readSource(path.join(SRC_ROOT, 'main.js'));
    const applicationStylesSource = readSource(path.join(SRC_ROOT, 'applicationStyles.js'));
    const overrideSource = readSource(OVERRIDE_PATH);

    expect(mainSource).to.include("import './applicationStyles';");
    expect(applicationStylesSource).to.include("import '@/styles/tokens.css';");
    expect(applicationStylesSource).to.include("import '@/styles/override.css';");
    expect(applicationStylesSource.indexOf("import '@/styles/tokens.css';")).to.be.lessThan(
      applicationStylesSource.indexOf("import '@/styles/override.css';")
    );
    expect(overrideSource).to.not.match(/^\s*outline(?:-offset)?\s*:/m);
    expect(overrideSource).to.not.include('-webkit-focus-ring-color');
    expect(overrideSource).to.not.match(/outline[^;]*!important/);
  });

  it('フォーカスした投稿内の操作では背景に対して3:1以上のコントラストの枠を表示する', () => {
    const tokensSource = readSource(TOKENS_PATH);
    const timelineSource = readSource(TIMELINE_COLUMN_PATH);
    const commonFocusColor = tokensSource.match(/--ui-color-focus:\s*#([0-9a-f]{6})/i);
    const columnBlock = timelineSource.match(/\.column\s*\{([^}]*)\}/);
    const focusWrapperBlock = timelineSource.match(/\.focus-post-wrapper\s*\{([^}]*)\}/);
    const focusColor = focusWrapperBlock?.[1].match(/--ui-color-focus:\s*#([0-9a-f]{6})/i);
    const overlay = focusWrapperBlock?.[1].match(/background-color:\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
    const columnColor = columnBlock?.[1].match(/background-color:\s*rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);

    expect(focusColor).to.not.equal(null);
    expect(columnBlock).to.not.equal(null);
    expect(focusWrapperBlock).to.not.equal(null);
    expect(columnColor).to.not.equal(null);
    expect(commonFocusColor).to.not.equal(null);
    expect(overlay).to.not.equal(null);

    const focusRgb = focusColor[1].match(/.{2}/g).map((value) => parseInt(value, 16));
    const columnRgb = columnColor.slice(1).map(Number);
    const commonFocusRgb = commonFocusColor[1].match(/.{2}/g).map((value) => parseInt(value, 16));
    const alpha = Number(overlay[4]);
    const effectiveBackground = columnRgb.map((channel, index) => Number(overlay[index + 1]) * alpha + channel * (1 - alpha));
    expect(contrastRatio(commonFocusRgb, columnRgb)).to.be.at.least(3);
    expect(contrastRatio(focusRgb, effectiveBackground)).to.be.at.least(3);
  });
});
