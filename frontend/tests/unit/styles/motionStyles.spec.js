import fs from 'fs';
import path from 'path';
import { expect } from 'vitest';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const UI_COMPONENTS_PATH = path.join(SRC_ROOT, 'styles', 'ui-components.css');

describe('動きを抑える利用者設定', () => {
  it('継続する進捗アニメーションをprefers-reduced-motionで停止する', () => {
    const source = fs.readFileSync(UI_COMPONENTS_PATH, 'utf8');
    const reducedMotionBlock = source.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.ui-progress--indeterminate \.ui-progress__indicator\s*\{([^}]*)\}\s*\}/
    );

    expect(source).to.match(/\.ui-progress--indeterminate \.ui-progress__indicator\s*\{[^}]*animation:/);
    expect(reducedMotionBlock).to.not.equal(null);
    expect(reducedMotionBlock[1]).to.include('animation: none;');
  });

  it('reduced-motion時にも進捗の現在位置を視覚表示する', () => {
    const source = fs.readFileSync(UI_COMPONENTS_PATH, 'utf8');
    const reducedMotionBlock = source.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.ui-progress--indeterminate \.ui-progress__indicator\s*\{([^}]*)\}\s*\}/
    );

    expect(reducedMotionBlock).to.not.equal(null);
    expect(reducedMotionBlock[1]).to.match(/transform:\s*translateX\([^)]*\);/);
  });
});
