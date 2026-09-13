const expectPath = (schema, path) => {
  const field = schema.path(path);
  expect(field).toBeDefined();
  return field;
};

const expectRequired = (schema, path) => {
  const field = expectPath(schema, path);
  expect(field.isRequired).toBe(true);
};

const expectDefault = (schema, path, expected) => {
  const field = expectPath(schema, path);
  expect(field.defaultValue).toBe(expected);
};

const expectEnum = (schema, path, expected) => {
  const field = expectPath(schema, path);
  expect(field.options.enum).toEqual(expected);
};

const expectMinMax = (schema, path, min, max) => {
  const field = expectPath(schema, path);
  const minKey = field.options.min !== undefined ? 'min' : 'minlength';
  const maxKey = field.options.max !== undefined ? 'max' : 'maxlength';
  if (min !== undefined) expect(field.options[minKey]).toBe(min);
  if (max !== undefined) expect(field.options[maxKey]).toBe(max);
};

const expectTrim = (schema, path, expected = true) => {
  const field = expectPath(schema, path);
  expect(field.options.trim).toBe(expected);
};

const expectMatch = (schema, path, regex) => {
  const field = expectPath(schema, path);
  const actual = field.options.match ? field.options.match[0] : undefined;
  expect(actual && actual.toString()).toBe(regex.toString());
};

const matchObject = (target, matcher) => {
  if (!matcher || Object.keys(matcher).length === 0) return true;
  return Object.keys(matcher).every((key) => {
    const expected = matcher[key];
    const actual = target ? target[key] : undefined;
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      return matchObject(actual || {}, expected);
    }
    return Object.is(actual, expected);
  });
};

const expectIndex = (schema, fields, options = {}) => {
  const indexes = schema.indexes();
  const found = indexes.some(([indexFields, indexOptions]) => {
    return matchObject(indexFields, fields) && matchObject(indexOptions, options);
  });
  expect(found).toBe(true);
};

module.exports = {
  expectPath,
  expectRequired,
  expectDefault,
  expectEnum,
  expectMinMax,
  expectTrim,
  expectMatch,
  expectIndex,
};
