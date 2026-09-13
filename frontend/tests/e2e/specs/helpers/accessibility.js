const assertAccessibilityIntegrity = (
  browser,
  { rootSelector = 'body', label = 'ページ', checkControlNames = false } = {}
) => {
  browser.execute(
    function (selector, shouldCheckControlNames) {
      const root = document.querySelector(selector);
      if (!root) {
        return {
          rootFound: false,
          duplicateIds: [],
          missingReferences: [],
          unnamedControls: [],
        };
      }

      const elementsWithIds = Array.from(document.querySelectorAll('[id]')).filter((element) => element.id);
      const idCounts = elementsWithIds.reduce((counts, element) => {
        counts[element.id] = (counts[element.id] || 0) + 1;
        return counts;
      }, {});
      const duplicateIds = Object.entries(idCounts)
        .filter(([, count]) => count > 1)
        .map(([id, count]) => `${id}:${count}`);
      const referenceAttributes = [
        'aria-activedescendant',
        'aria-controls',
        'aria-describedby',
        'aria-details',
        'aria-errormessage',
        'aria-labelledby',
        'aria-owns',
        'for',
      ];
      const missingReferences = [];

      Array.from(root.querySelectorAll('*')).forEach((element) => {
        referenceAttributes.forEach((attribute) => {
          const value = element.getAttribute(attribute);
          if (!value) return;
          value
            .split(/\s+/)
            .filter(Boolean)
            .forEach((id) => {
              if (idCounts[id] !== 1) {
                const source = element.id || element.getAttribute('data-testid') || element.tagName.toLowerCase();
                missingReferences.push(`${source}:${attribute}=${id}:count=${idCounts[id] || 0}`);
              }
            });
        });
      });

      const isVisible = (element) =>
        !!(element.getClientRects().length && window.getComputedStyle(element).visibility !== 'hidden');
      const referencedText = (element, attribute) =>
        (element.getAttribute(attribute) || '')
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => elementsWithIds.find((candidate) => candidate.id === id))
          .filter(Boolean)
          .map((candidate) => candidate.textContent.trim())
          .filter(Boolean)
          .join(' ');
      const labelText = (element) => {
        const explicitLabels = element.id
          ? Array.from(document.querySelectorAll('label[for]')).filter(
              (candidate) => candidate.getAttribute('for') === element.id
            )
          : [];
        const wrappingLabel = element.closest('label');
        return explicitLabels
          .concat(wrappingLabel ? [wrappingLabel] : [])
          .map((candidate) => candidate.textContent.trim())
          .filter(Boolean)
          .join(' ');
      };
      const accessibleName = (element) => {
        const imageAlternatives = Array.from(element.querySelectorAll?.('img[alt]') || [])
          .map((image) => image.getAttribute('alt').trim())
          .filter(Boolean)
          .join(' ');
        const inputType = (element.getAttribute('type') || '').toLowerCase();
        const valueName = ['button', 'reset', 'submit'].includes(inputType)
          ? element.getAttribute('value') || ''
          : '';
        return [
          element.getAttribute('aria-label') || '',
          referencedText(element, 'aria-labelledby'),
          labelText(element),
          element.textContent || '',
          imageAlternatives,
          element.getAttribute('title') || '',
          valueName,
        ]
          .join(' ')
          .trim();
      };
      const unnamedControls = shouldCheckControlNames
        ? Array.from(
            root.querySelectorAll(
              'button, a[href], input:not([type="hidden"]):not([aria-hidden="true"]), select, textarea, [role="button"], [role="tab"]'
            )
          )
            .filter((element) => isVisible(element) && !accessibleName(element))
            .map(
              (element) =>
                element.id || element.getAttribute('data-testid') || `${element.tagName.toLowerCase()}.${element.className}`
            )
        : [];

      return {
        rootFound: true,
        duplicateIds,
        missingReferences,
        unnamedControls,
      };
    },
    [rootSelector, checkControlNames],
    (result) => {
      const state = result && result.value ? result.value : { rootFound: false };
      browser.assert.ok(state.rootFound, `アクセシビリティ検証のルート要素が見つかりました（${label}）: ${rootSelector}`);
      browser.assert.deepEqual(state.duplicateIds || [], [], `ドキュメント内のIDが重複していません（${label}）。`);
      browser.assert.deepEqual(state.missingReferences || [], [], `IDの参照先がそれぞれ1件だけあります（${label}）。`);
      if (checkControlNames) {
        browser.assert.deepEqual(state.unnamedControls || [], [], `表示中の操作要素にアクセシブルな名前があります（${label}）。`);
      }
    }
  );
};

module.exports = {
  assertAccessibilityIntegrity,
};
