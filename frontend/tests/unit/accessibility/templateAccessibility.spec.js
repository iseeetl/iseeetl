import fs from 'fs';
import path from 'path';
import { parse } from '@vue/compiler-sfc';
import { expect } from 'vitest';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const ID_REFERENCE_ATTRIBUTES = new Set([
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-labelledby',
  'aria-owns',
  'for',
]);

const collectVueFiles = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .reduce((files, entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return files.concat(collectVueFiles(entryPath));
      if (entry.isFile() && entry.name.endsWith('.vue')) files.push(entryPath);
      return files;
    }, []);

const staticAttribute = (node, name) =>
  node.props?.find((property) => property.type === 6 && property.name === name && property.value)?.value.content;

const hasAttribute = (node, name) =>
  node.props?.some(
    (property) => property.type === 6 ? property.name === name : property.arg?.type === 4 && property.arg.content === name
  );

const walkElements = (node, visit) => {
  if (!node) return;
  if (node.type === 1) visit(node);
  (node.children || []).forEach((child) => walkElements(child, visit));
};

const analyzeTemplate = (filePath) => {
  const relativeFile = path.relative(SRC_ROOT, filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const template = parse(source, { filename: filePath }).descriptor.template;
  const ids = new Map();
  const references = [];
  const missingImageAlternatives = [];
  const unnamedIconButtons = [];

  if (!template?.ast) {
    return { relativeFile, duplicateIds: [], missingReferences: [], missingImageAlternatives, unnamedIconButtons };
  }

  walkElements(template.ast, (node) => {
    const id = staticAttribute(node, 'id');
    if (id) ids.set(id, (ids.get(id) || 0) + 1);

    node.props?.forEach((property) => {
      if (property.type !== 6 || !property.value || !ID_REFERENCE_ATTRIBUTES.has(property.name)) return;
      property.value.content
        .split(/\s+/u)
        .filter(Boolean)
        .forEach((reference) => references.push({ attribute: property.name, reference, line: node.loc.start.line }));
    });

    if (node.tag === 'img' && !hasAttribute(node, 'alt') && !hasAttribute(node, 'aria-hidden')) {
      missingImageAlternatives.push(node.loc.start.line);
    }

    const iconOnly = node.tag === 'UiButton' && (hasAttribute(node, 'iconOnly') || hasAttribute(node, 'icon-only'));
    if (iconOnly && !hasAttribute(node, 'aria-label') && !hasAttribute(node, 'aria-labelledby')) {
      unnamedIconButtons.push(node.loc.start.line);
    }
  });

  return {
    relativeFile,
    duplicateIds: Array.from(ids.entries())
      .filter(([, count]) => count > 1)
      .map(([id, count]) => ({ id, count })),
    missingReferences: references.filter(({ reference }) => !ids.has(reference)),
    missingImageAlternatives,
    unnamedIconButtons,
  };
};

describe('Vueテンプレートのアクセシビリティ', () => {
  const analyses = collectVueFiles(SRC_ROOT).map(analyzeTemplate);

  it('コンポーネント内の静的IDが重複せず、ID参照の対象が存在する', () => {
    const failures = analyses
      .filter(({ duplicateIds, missingReferences }) => duplicateIds.length || missingReferences.length)
      .map(({ relativeFile, duplicateIds, missingReferences }) => ({
        file: relativeFile,
        duplicateIds,
        missingReferences,
      }));

    expect(failures).to.deep.equal([]);
  });

  it('画像にaltまたはaria-hiddenを指定する', () => {
    const failures = analyses
      .filter(({ missingImageAlternatives }) => missingImageAlternatives.length)
      .map(({ relativeFile, missingImageAlternatives }) => ({ file: relativeFile, lines: missingImageAlternatives }));

    expect(failures).to.deep.equal([]);
  });

  it('アイコンだけのUiButtonに読み上げ用の名前を指定する', () => {
    const failures = analyses
      .filter(({ unnamedIconButtons }) => unnamedIconButtons.length)
      .map(({ relativeFile, unnamedIconButtons }) => ({ file: relativeFile, lines: unnamedIconButtons }));

    expect(failures).to.deep.equal([]);
  });
});
