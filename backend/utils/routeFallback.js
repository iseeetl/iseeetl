const normalizePath = (value) => {
  if (typeof value !== 'string') return '';
  const [pathname] = value.split('?');
  return pathname || '';
};

const shouldReturnNotFoundOnFallback = (path) => {
  const pathname = normalizePath(path);
  if (pathname === '/') return true;
  return pathname === '/api' || pathname.startsWith('/api/');
};

module.exports = {
  shouldReturnNotFoundOnFallback,
};
