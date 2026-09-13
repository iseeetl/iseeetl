const toRouteString = (value, trim) => {
  if (value === null || typeof value === 'undefined') return '';
  const routeValue = String(value);
  return trim ? routeValue.trim() : routeValue;
};

export const resolveRoomContextIds = (
  route = {},
  { source = 'both', includePathFallback = false, trim = false } = {}
) => {
  const routeParams = route.params || {};
  const routeQuery = route.query || {};
  const pathMatch =
    includePathFallback && typeof route.path === 'string'
      ? route.path.match(/\/floor\/([^/]+)\/room\/([^/?#]+)/)
      : null;

  const pickRouteValue = (externalKey, pathIndex) => {
    if (source !== 'query') {
      const paramValue = toRouteString(routeParams[externalKey], trim);
      if (paramValue) return paramValue;
    }
    if (source !== 'params') {
      const queryValue = toRouteString(routeQuery[externalKey], trim);
      if (queryValue) return queryValue;
    }
    return pathMatch ? toRouteString(pathMatch[pathIndex], trim) : '';
  };

  return {
    floorId: pickRouteValue('floor_id', 1),
    roomId: pickRouteValue('room_id', 2),
  };
};

export const buildRoomContextQuery = (route, options) => {
  const { floorId, roomId } = resolveRoomContextIds(route, options);
  return {
    ...(floorId ? { floor_id: floorId } : {}),
    ...(roomId ? { room_id: roomId } : {}),
  };
};

export const withRoomContextQuery = (
  destination,
  currentRoute,
  { source = 'both', allowedRouteNames = ['Login', 'Register', 'Terms', 'Privacy', 'CookiePolicy'] } = {}
) => {
  const target = typeof destination === 'string' ? { name: destination } : destination || {};
  const existingQuery = { ...(target.query || {}) };
  if (!target.name || !allowedRouteNames.includes(target.name)) {
    return { ...target, query: Object.keys(existingQuery).length ? existingQuery : undefined };
  }

  const contextQuery = buildRoomContextQuery(currentRoute, {
    source,
    includePathFallback: true,
  });
  const mergedQuery = { ...contextQuery, ...existingQuery };
  return {
    ...target,
    query: Object.keys(mergedQuery).length ? mergedQuery : undefined,
  };
};
