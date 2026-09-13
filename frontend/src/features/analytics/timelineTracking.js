import {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_PARAMETER_ALLOWLIST,
  buildAnalyticsEventPayload,
  classifyAnalyticsSpeechSpeedBucket,
  normalizeAnalyticsPageResource,
  normalizeAnalyticsResourceId,
  normalizeAnalyticsResourceLabel,
} from './contract.js';

const MISSING = Symbol('missing');
const VALID_CONTENT_TYPES = new Set(['post', 'reply', 'post_supplement', 'reply_supplement']);
const SUPPLEMENT_TYPES = new Set(['post_supplement', 'reply_supplement']);
const VALID_ACTIONS = new Set(['create', 'update', 'delete']);
const BOOLEAN_FILTER_KEYS = Object.freeze([
  ['no_tags', 'noTags'],
  ['animation', 'animation'],
]);
const BOOLEAN_DISPLAY_KEYS = Object.freeze([
  ['display_name', 'displayName'],
  ['display_date', 'displayDate'],
  ['display_tag', 'displayTag'],
  ['display_supplement', 'displaySupplement'],
  ['display_action_button', 'displayActionButton'],
  ['enable_text_animation', 'enableTextAnimation'],
  ['display_user_kick_button', 'displayUserKickButton'],
]);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const readOwnValue = (record, key) => {
  if (!isRecord(record)) return MISSING;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : MISSING;
  } catch (_error) {
    return MISSING;
  }
};

const normalizeRawRoomId = (value) => {
  return normalizeAnalyticsResourceId('room', value);
};

const normalizeTagId = (value) => {
  const candidate = typeof value === 'string' ? value : readOwnValue(value, '_id');
  return normalizeAnalyticsResourceId('tag', candidate);
};

const normalizeTagIds = (values) => {
  if (!Array.isArray(values)) return null;
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const id = normalizeTagId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
};

const asBooleanSetting = (value) => (typeof value === 'boolean' ? String(value) : null);

const hasText = (value) => typeof value === 'string' && value.trim() !== '';

const presentationTypeFor = ({ content, action, response, before }) => {
  if (!VALID_CONTENT_TYPES.has(content) || !VALID_ACTIONS.has(action)) return null;
  if (SUPPLEMENT_TYPES.has(content)) return 'static';

  const entity = action === 'delete' ? before : response;
  const animation = readOwnValue(entity, 'animation');
  if (animation === null) return 'static';
  return animation === 'move-and-erase' ? 'flow' : null;
};

export const createTimelineTracker = ({
  track,
  getCurrentRoomId,
  activatePageResource = (_room, onPageViewSent) => {
    if (typeof onPageViewSent === 'function') onPageViewSent();
    return true;
  },
  cancelPageResource = () => true,
} = {}) => {
  if (
    typeof track !== 'function' ||
    typeof getCurrentRoomId !== 'function' ||
    typeof activatePageResource !== 'function' ||
    typeof cancelPageResource !== 'function'
  ) {
    throw new TypeError('createTimelineTracker requires analytics callback functions');
  }

  let generation = 0;
  let pendingRoomId = null;
  let context = null;
  let timelineViewSent = false;
  let pageResourceCancellationPending = true;
  const tokens = new WeakMap();

  const currentRoomId = () => {
    try {
      return normalizeRawRoomId(getCurrentRoomId());
    } catch (_error) {
      return null;
    }
  };

  const issueToken = (phase, roomId) => {
    const token = Object.freeze({ generation, roomId });
    tokens.set(token, Object.freeze({ phase, generation, roomId }));
    return token;
  };

  const readToken = (token, phase) => {
    if (!isRecord(token)) return null;
    const metadata = tokens.get(token);
    return metadata?.phase === phase ? metadata : null;
  };

  const buildTrackPayload = (eventName, parameters) => {
    const candidate = { ...parameters, visitor_type: 'guest' };
    const validated = buildAnalyticsEventPayload(eventName, candidate);
    if (!validated) return null;

    const payload = {};
    ANALYTICS_EVENT_PARAMETER_ALLOWLIST[eventName].forEach((name) => {
      if (name !== 'visitor_type' && Object.prototype.hasOwnProperty.call(validated, name)) {
        payload[name] = validated[name];
      }
    });
    return Object.freeze(payload);
  };

  const send = (eventName, parameters = {}) => {
    try {
      const payload = buildTrackPayload(eventName, parameters);
      return payload && track(eventName, payload) === true ? 1 : 0;
    } catch (_error) {
      return 0;
    }
  };

  const hasCurrentContext = (metadata) =>
    context !== null &&
    metadata.generation === generation &&
    metadata.roomId === context.roomId &&
    currentRoomId() === context.roomId;

  const withContext = (parameters = {}) => ({ ...context.parameters, ...parameters });

  const tagParameters = (tagId) => {
    const parameters = { tag_id: tagId };
    const name = context.tagNames.get(tagId);
    if (name) parameters.tag_name = name;
    return parameters;
  };

  const reportTagDiff = (content, beforeTagIds, afterTagIds) => {
    const before = normalizeTagIds(beforeTagIds);
    const after = normalizeTagIds(afterTagIds);
    if (!before || !after) return 0;

    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    let sent = 0;
    before.forEach((tagId) => {
      if (!afterSet.has(tagId)) {
        sent += send(
          ANALYTICS_EVENTS.TIMELINE_TAG_CHANGE,
          withContext({ content_type: content, tag_action: 'remove', ...tagParameters(tagId) })
        );
      }
    });
    after.forEach((tagId) => {
      if (!beforeSet.has(tagId)) {
        sent += send(
          ANALYTICS_EVENTS.TIMELINE_TAG_CHANGE,
          withContext({ content_type: content, tag_action: 'add', ...tagParameters(tagId) })
        );
      }
    });
    return sent;
  };

  const reportContentChange = (operation) => {
    const content = readOwnValue(operation, 'content');
    const action = readOwnValue(operation, 'action');
    const response = readOwnValue(operation, 'response');
    const before = readOwnValue(operation, 'before');
    const presentationType = presentationTypeFor({ content, action, response, before });
    let sent = 0;

    if (presentationType) {
      sent += send(
        ANALYTICS_EVENTS.TIMELINE_CONTENT_CHANGE,
        withContext({
          content_type: content,
          action_type: action,
          presentation_type: presentationType,
        })
      );
    }

    const mediaType = readOwnValue(operation, 'newMainMediaType');
    if (action !== 'delete' && mediaType !== MISSING) {
      sent += send(
        ANALYTICS_EVENTS.TIMELINE_MEDIA_ATTACH,
        withContext({ content_type: content, action_type: action, media_type: mediaType })
      );
    }

    const beforeTagIds = readOwnValue(operation, 'beforeTagIds');
    const afterTagIds = readOwnValue(operation, 'afterTagIds');
    if (beforeTagIds !== MISSING && afterTagIds !== MISSING) {
      sent += reportTagDiff(content, beforeTagIds, afterTagIds);
    }
    return sent;
  };

  const reportReactionChange = (operation) =>
    send(
      ANALYTICS_EVENTS.TIMELINE_REACTION_CHANGE,
      withContext({
        content_type: readOwnValue(operation, 'content'),
        reaction_action: readOwnValue(operation, 'action'),
        reaction_type: readOwnValue(operation, 'reactionType'),
      })
    );

  const reportQuickTextUse = (operation) => {
    const quickText = readOwnValue(operation, 'quickText');
    const quickTextId = normalizeAnalyticsResourceId('quick_text', readOwnValue(quickText, '_id'));
    const quickTextLabel = normalizeAnalyticsResourceLabel(readOwnValue(quickText, 'label'));
    const parameters = {
      content_type: readOwnValue(operation, 'content'),
      quick_text_id: quickTextId,
    };
    if (quickTextLabel) parameters.quick_text_label = quickTextLabel;
    return send(ANALYTICS_EVENTS.TIMELINE_QUICK_TEXT_USE, withContext(parameters));
  };

  const sendSetting = (eventName, key, value) => {
    if (value === null || value === MISSING) return 0;
    return send(eventName, withContext({ setting_key: key, setting_value: value }));
  };

  const reportFilterChange = (operation) => {
    const action = readOwnValue(operation, 'action');
    let sent = send(
      ANALYTICS_EVENTS.TIMELINE_FILTER_CHANGE,
      withContext({ action_type: action })
    );
    if (!['create', 'update'].includes(action)) return sent;

    const filter = readOwnValue(operation, 'filter');
    if (!isRecord(filter)) return sent;
    const conditions = readOwnValue(filter, 'conditions');
    if (conditions !== null && !isRecord(conditions)) return sent;

    const settings = [];
    let tagIds = [];
    if (conditions !== null) {
      const keywordArray = readOwnValue(conditions, 'keywordArray');
      const keywordUsed = Array.isArray(keywordArray)
        ? keywordArray.some(hasText)
        : hasText(readOwnValue(conditions, 'keyword'));
      const userNameUsed = hasText(readOwnValue(conditions, 'userName'));
      const tags = normalizeTagIds(readOwnValue(conditions, 'tags'));
      tagIds = Array.isArray(tags) ? tags : [];
      const tagUsed = tagIds.length > 0;

      settings.push(
        ['filter_mode', readOwnValue(conditions, 'filterMode')],
        ['show_range', readOwnValue(conditions, 'showRange')],
        ['keyword_used', String(keywordUsed)],
        ['user_name_used', String(userNameUsed)],
        ['tag_used', String(tagUsed)]
      );
      BOOLEAN_FILTER_KEYS.forEach(([analyticsKey, sourceKey]) => {
        settings.push([analyticsKey, asBooleanSetting(readOwnValue(conditions, sourceKey))]);
      });
      if (keywordUsed) settings.push(['keyword_operator', readOwnValue(conditions, 'logicalOperator')]);
      if (tagUsed) settings.push(['tag_operator', readOwnValue(conditions, 'tagSearchOperator')]);
    } else {
      settings.push(
        ['keyword_used', 'false'],
        ['user_name_used', 'false'],
        ['tag_used', 'false'],
        ['no_tags', 'false'],
        ['animation', 'false']
      );
    }
    settings.push(
      ['web_push', asBooleanSetting(readOwnValue(filter, 'webPush'))],
      ['show_user_icon', asBooleanSetting(readOwnValue(filter, 'showUserIcon'))]
    );
    settings.forEach(([key, value]) => {
      sent += sendSetting(ANALYTICS_EVENTS.TIMELINE_FILTER_SETTING, key, value);
    });
    tagIds.forEach((tagId) => {
      sent += send(
        ANALYTICS_EVENTS.TIMELINE_FILTER_TAG,
        withContext({ action_type: action, ...tagParameters(tagId) })
      );
    });
    return sent;
  };

  const reportDisplaySave = (operation) => {
    let sent = send(ANALYTICS_EVENTS.TIMELINE_DISPLAY_SAVE, withContext());
    const settings = readOwnValue(operation, 'settings');
    if (!isRecord(settings)) return sent;

    sent += sendSetting(
      ANALYTICS_EVENTS.TIMELINE_DISPLAY_SETTING,
      'speech_speed_bucket',
      classifyAnalyticsSpeechSpeedBucket(readOwnValue(settings, 'speechSpeed'))
    );
    BOOLEAN_DISPLAY_KEYS.forEach(([analyticsKey, sourceKey]) => {
      sent += sendSetting(
        ANALYTICS_EVENTS.TIMELINE_DISPLAY_SETTING,
        analyticsKey,
        asBooleanSetting(readOwnValue(settings, sourceKey))
      );
    });
    sent += sendSetting(
      ANALYTICS_EVENTS.TIMELINE_DISPLAY_SETTING,
      'animation_speed',
      readOwnValue(settings, 'animationSpeed')
    );
    return sent;
  };

  const beginRoom = (roomId) => {
    generation += 1;
    context = null;
    timelineViewSent = false;
    pageResourceCancellationPending = true;
    pendingRoomId = normalizeRawRoomId(roomId);
    return pendingRoomId ? issueToken('begin', pendingRoomId) : null;
  };

  const activateRoom = (token, details) => {
    try {
      const metadata = readToken(token, 'begin');
      if (!metadata) return false;
      tokens.delete(token);
      if (
        metadata.generation !== generation ||
        metadata.roomId !== pendingRoomId ||
        currentRoomId() !== metadata.roomId
      ) {
        return false;
      }

      const room = readOwnValue(details, 'room');
      const roomTags = readOwnValue(details, 'roomTags');
      const rawRoomId = normalizeRawRoomId(readOwnValue(room, '_id'));
      const parameters = normalizeAnalyticsPageResource('timeline', room);
      if (
        rawRoomId !== metadata.roomId ||
        !parameters ||
        !Array.isArray(roomTags)
      ) {
        return false;
      }

      const tagNames = new Map();
      roomTags.forEach((roomTag) => {
        const tagId = normalizeTagId(roomTag);
        if (!tagId || tagNames.has(tagId)) return;
        tagNames.set(tagId, normalizeAnalyticsResourceLabel(readOwnValue(roomTag, 'name')));
      });
      const nextContext = Object.freeze({
        generation,
        roomId: rawRoomId,
        parameters,
        tagNames,
      });
      const activeGeneration = generation;
      context = nextContext;
      pendingRoomId = null;
      const reportTimelineView = () => {
        if (
          timelineViewSent ||
          generation !== activeGeneration ||
          context !== nextContext ||
          currentRoomId() !== rawRoomId
        ) {
          return false;
        }
        timelineViewSent = true;
        return send(ANALYTICS_EVENTS.TIMELINE_VIEW, withContext()) === 1;
      };
      if (activatePageResource(room, reportTimelineView) !== true) {
        context = null;
        return false;
      }
      return true;
    } catch (_error) {
      context = null;
      return false;
    }
  };

  const clear = () => {
    generation += 1;
    pendingRoomId = null;
    context = null;
    timelineViewSent = false;
    if (pageResourceCancellationPending) {
      pageResourceCancellationPending = false;
      try {
        cancelPageResource();
      } catch (_error) {
        // 計測の後処理に失敗しても、タイムラインの終了処理を続ける。
      }
    }
    return true;
  };

  const capture = () => {
    if (!context || currentRoomId() !== context.roomId) return null;
    return issueToken('capture', context.roomId);
  };

  const report = (token, operation) => {
    try {
      const metadata = readToken(token, 'capture');
      if (!metadata || !hasCurrentContext(metadata) || !isRecord(operation)) return 0;
      const kind = readOwnValue(operation, 'kind');
      if (kind === 'content_change') return reportContentChange(operation);
      if (kind === 'tag_change') {
        return reportTagDiff(
          readOwnValue(operation, 'content'),
          readOwnValue(operation, 'beforeTagIds'),
          readOwnValue(operation, 'afterTagIds')
        );
      }
      if (kind === 'reaction_change') return reportReactionChange(operation);
      if (kind === 'quick_text_use') return reportQuickTextUse(operation);
      if (kind === 'filter_change') return reportFilterChange(operation);
      if (kind === 'display_save') return reportDisplaySave(operation);
      return 0;
    } catch (_error) {
      return 0;
    }
  };

  return Object.freeze({ beginRoom, activateRoom, clear, capture, report });
};
