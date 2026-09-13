(function attachWebAppManifest(root, factory) {
  'use strict';

  var api = factory();
  var isCommonJs = typeof module === 'object' && module && module.exports;

  if (isCommonJs) {
    module.exports = api;
  }

  if (root && !isCommonJs) {
    root.ISeeeWebAppManifest = api;
    if (root.document && root.location) {
      api.initializeManifestLink(root.document, root.location);
    }
  }
})(typeof window !== 'undefined' ? window : null, function createWebAppManifestApi() {
  'use strict';

  var HOME_MANIFEST_HREF = '/manifest.json';
  var SHORTCUT_MANIFEST_HREF = '/shortcut-manifest.json';
  var MANIFEST_LINK_ID = 'web-app-manifest';
  var FLOOR_PATH_PATTERN = /^\/floor\/[0-9a-f]{24}$/i;
  var ROOM_PATH_PATTERN = /^\/floor\/[0-9a-f]{24}\/room\/[0-9a-f]{24}$/i;
  var pageLoadManifestHref = null;

  function resolveManifestHref(locationLike) {
    var location = locationLike || {};
    var pathname = typeof location.pathname === 'string' ? location.pathname : '/';
    var hasQuery = typeof location.search === 'string' && location.search.length > 0;
    var hasHash = typeof location.hash === 'string' && location.hash.length > 0;
    var isShortcutPath = FLOOR_PATH_PATTERN.test(pathname) || ROOM_PATH_PATTERN.test(pathname);

    if (hasQuery || hasHash || !isShortcutPath) {
      return HOME_MANIFEST_HREF;
    }

    return SHORTCUT_MANIFEST_HREF + '?target=' + encodeURIComponent(pathname);
  }

  function resolveManifestLink(documentObject) {
    var link = documentObject.getElementById(MANIFEST_LINK_ID);
    if (!link && typeof documentObject.querySelector === 'function') {
      link = documentObject.querySelector('link[rel="manifest"]');
    }
    if (link) return link;

    link = documentObject.createElement('link');
    link.id = MANIFEST_LINK_ID;
    link.rel = 'manifest';
    documentObject.head.appendChild(link);
    return link;
  }

  function updateManifestLink(documentObject, locationLike) {
    if (!documentObject || !documentObject.head) return HOME_MANIFEST_HREF;

    var href = resolveManifestHref(locationLike);
    var link = resolveManifestLink(documentObject);
    if (link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
    return href;
  }

  function initializeManifestLink(documentObject, locationLike) {
    pageLoadManifestHref = updateManifestLink(documentObject, locationLike);
    return pageLoadManifestHref;
  }

  function isIosSafari(navigatorLike) {
    var navigatorObject = navigatorLike || {};
    var userAgent = typeof navigatorObject.userAgent === 'string' ? navigatorObject.userAgent : '';
    var isIosDevice = /iPad|iPhone|iPod/i.test(userAgent);
    var isIpadosDesktopMode = /Macintosh/i.test(userAgent) && Number(navigatorObject.maxTouchPoints) > 1;
    var isSafari = /Safari/i.test(userAgent) && /Version\//i.test(userAgent);
    var isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);

    return (isIosDevice || isIpadosDesktopMode) && isSafari && !isOtherIosBrowser;
  }

  function isStandalone(navigatorLike, matchMediaLike) {
    if (navigatorLike && navigatorLike.standalone === true) return true;
    if (typeof matchMediaLike !== 'function') return false;

    try {
      return matchMediaLike('(display-mode: standalone)').matches === true;
    } catch (error) {
      return false;
    }
  }

  function shouldReloadForManifest(locationLike, navigatorLike, matchMediaLike) {
    var currentManifestHref = resolveManifestHref(locationLike);
    var isShortcutManifest = currentManifestHref.indexOf(SHORTCUT_MANIFEST_HREF + '?') === 0;

    if (!isShortcutManifest || !pageLoadManifestHref || pageLoadManifestHref === currentManifestHref) {
      return false;
    }

    return isIosSafari(navigatorLike) && !isStandalone(navigatorLike, matchMediaLike);
  }

  return {
    HOME_MANIFEST_HREF: HOME_MANIFEST_HREF,
    SHORTCUT_MANIFEST_HREF: SHORTCUT_MANIFEST_HREF,
    resolveManifestHref: resolveManifestHref,
    updateManifestLink: updateManifestLink,
    initializeManifestLink: initializeManifestLink,
    shouldReloadForManifest: shouldReloadForManifest,
  };
});
