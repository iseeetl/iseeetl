const { clickSingleVisibleAfterExactControls } = require('./dialog-focus');

const clickExactAccountSubmit = (
  browser,
  { expectedInputs, expectedChecks = [], submitSelector, label }
) => {
  const expectedControls = (expectedInputs || []).map(({ selector, value }) => ({
    selector,
    property: 'value',
    value,
  }));
  expectedControls.push(
    ...expectedChecks.map(({ selector, checked }) => ({
      selector,
      property: 'checked',
      value: checked,
    }))
  );

  clickSingleVisibleAfterExactControls(browser, {
    rootSelector: '.view-content',
    expectedControls,
    submitSelector,
    label,
  });
};

const clickExactAccountConfirm = (
  browser,
  { requireNonEmptyTitle = false, submitSelector = '[data-testid="confirm-dialog-confirm"]', label }
) => {
  clickSingleVisibleAfterExactControls(browser, {
    rootSelector: '[data-testid="confirm-dialog"] [role="dialog"]',
    expectedControls: requireNonEmptyTitle
      ? [{ selector: '.dialog-title', property: 'nonEmptyTextContent', value: true }]
      : [],
    submitSelector,
    label,
  });
};

module.exports = {
  clickExactAccountSubmit,
  clickExactAccountConfirm,
};
