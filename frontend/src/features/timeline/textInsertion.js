export const insertTextAtSelection = ({ value, insertText, selection }) => {
  const currentValue = value || '';

  if (!selection) {
    return {
      value: currentValue + insertText,
      selection: null,
      usedSelection: false,
    };
  }

  const nextPosition = selection.start + insertText.length;
  return {
    value: currentValue.slice(0, selection.start) + insertText + currentValue.slice(selection.end),
    selection: { start: nextPosition, end: nextPosition },
    usedSelection: true,
  };
};
