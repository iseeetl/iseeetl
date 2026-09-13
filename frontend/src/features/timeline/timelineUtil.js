
const TRAILING_URL_PUNCTUATION = /[.,!?;:\u3002\u3001\uff0c\uff01\uff1f\uff1b\uff1a\u2026]+$/u;
const URL_BRACKET_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['\uff08', '\uff09'],
  ['\uff3b', '\uff3d'],
  ['\uff5b', '\uff5d'],
  ['\u3008', '\u3009'],
  ['\u300a', '\u300b'],
  ['\u300c', '\u300d'],
  ['\u300e', '\u300f'],
  ['\u3010', '\u3011'],
  ['\u201c', '\u201d'],
  ['\u2018', '\u2019'],
];

const countCharacter = (value, target) => Array.from(value).filter((character) => character === target).length;

const trimTrailingUrlPunctuation = (candidate) => {
  let value = candidate;
  let changed = true;

  while (changed && value) {
    changed = false;
    const withoutPunctuation = value.replace(TRAILING_URL_PUNCTUATION, '');
    if (withoutPunctuation !== value) {
      value = withoutPunctuation;
      changed = true;
    }

    const pair = URL_BRACKET_PAIRS.find(([, closing]) => value.endsWith(closing));
    if (pair && countCharacter(value, pair[1]) > countCharacter(value, pair[0])) {
      value = value.slice(0, -pair[1].length);
      changed = true;
    }
  }

  return value;
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const appendTextToken = (tokens, value) => {
  if (!value) return;
  const previous = tokens[tokens.length - 1];
  if (previous && previous.type === 'text') {
    previous.value += value;
    return;
  }
  tokens.push({ type: 'text', value });
};

// 本文をHTMLとして解釈せずに描画するため、通常テキストとHTTP・HTTPSリンクに分割する。
export const tokenizeTimelineText = (content) => {
  const source = content == null ? '' : String(content);
  if (!source) return [];

  const tokens = [];
  let cursor = 0;
  const matches = source.matchAll(/https?:\/\/[^\s<>"'`]+/giu);

  for (const match of matches) {
    const start = match.index;
    const candidate = trimTrailingUrlPunctuation(match[0]);
    const prefix = source.slice(0, start);
    const currentWordPrefix = prefix.match(/\S*$/u)?.[0] || '';
    if (!candidate || /^(?:javascript|data):/iu.test(currentWordPrefix) || !isHttpUrl(candidate)) continue;

    appendTextToken(tokens, source.slice(cursor, start));
    tokens.push({ type: 'link', value: candidate, href: candidate });
    cursor = start + candidate.length;
  }

  appendTextToken(tokens, source.slice(cursor));
  return tokens;
};

export default {
  getUsernameOrGuestname(data) {
    return data.user ? data.user.username : data.guest_name;
  },

  isUserIconPresent(data) {
    return !!(data && data.user && data.user.image_name);
  },

  constructImagePath(floorId, roomId, data) {
    const dir = '/media/' + floorId + '/' + roomId;
    const image = data.image_thumbnail_name || data.image_name;
    return dir + '/' + image;
  },

  tokenizeTimelineText(content) {
    return tokenizeTimelineText(content);
  },

  isUserAllowedToEdit(suplement, userId, userRole, roomRole) {
    return (
      userId !== null &&
      (suplement.user._id === userId ||
        userRole === 'Administrator' ||
        roomRole === 'FloorEditor' ||
        roomRole === 'FloorMember')
    );
  },

  isPostOrReplyMatched(post, conditions) {
    if (this.doesDataMatchConditions(post, conditions)) return true;
    return post.replies.some((reply) => this.doesDataMatchConditions(reply, conditions));
  },

  // 表示中にルームタグが削除される場合があるため、現在のタグ一覧で存在を確認する。
  isTagInRoomTags(roomTags, tagId) {
    return roomTags.some((roomTag) => roomTag._id === tagId);
  },

  getTagNameById(tags, tagId) {
    const tag = tags.find((tag) => tag._id === tagId);
    return tag ? tag.name : null;
  },

  doesDataMatchConditions(data, conditions = null) {
    if (conditions === null) return true;

    let result = true;

    if (Array.isArray(conditions.keywordArray) && conditions.keywordArray.length > 0) {
      if (!this.containsKeywords(data, conditions)) {
        result = false;
      }
    }

    if (conditions.userName) {
      if (!this.isUserNameMatch(data, conditions)) {
        result = false;
      }
    }

    if (Array.isArray(conditions.tags) && conditions.tags.length > 0) {
      if (!this.hasTags(data, conditions)) {
        result = false;
      }
    }

    if (conditions.noTags) {
      if (!this.hasNoTags(data, conditions)) {
        result = false;
      }
    }

    if (conditions.animation) {
      if (!this.hasAnimation(data, conditions)) {
        result = false;
      }
    }

    if (conditions.filterMode === 'exclude') {
      // 「表示しない」条件では、一致したデータを除外するため判定結果を反転する。
      return !result;
    } else {
      return result;
    }
  },

  containsKeywords(data, conditions) {
    if (Array.isArray(conditions.keywordArray) && conditions.keywordArray.length > 0) {
      return conditions.logicalOperator === 'or'
        ? conditions.keywordArray.some((keyword) => data.content.toLowerCase().includes(keyword.toLowerCase()))
        : conditions.keywordArray.every((keyword) => data.content.toLowerCase().includes(keyword.toLowerCase()));
    }

    return false;
  },

  isUserNameMatch(data, conditions) {
    if (!data || !conditions.userName) return false;
    const actualUserName = data.user ? data.user.username : data.guest_name;
    return actualUserName && actualUserName === conditions.userName;
  },

  hasTags(data, conditions) {
    if (!data || !Array.isArray(data.room_tags) || !conditions || !Array.isArray(conditions.tags)) {
      return false;
    }

    const objectIdEquals = (id1, id2) => id1.toString() === id2.toString();

    if (conditions.tagSearchOperator === 'or') {
      return conditions.tags.some((tagId) => data.room_tags.some((roomTagId) => objectIdEquals(tagId, roomTagId)));
    } else {
      return conditions.tags.every((tagId) => data.room_tags.some((roomTagId) => objectIdEquals(tagId, roomTagId)));
    }
  },

  hasNoTags(data, conditions) {
    if (!data || !Array.isArray(data.room_tags) || typeof conditions.noTags !== 'boolean') {
      return false;
    }

    return conditions.noTags && data.room_tags.length === 0;
  },

  hasAnimation(data, conditions) {
    if (!data || typeof conditions.animation !== 'boolean') {
      return false;
    }

    return conditions.animation && data.animation != null;
  },
};
