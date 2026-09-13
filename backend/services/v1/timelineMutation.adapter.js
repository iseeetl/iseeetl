const AppError = require('../../utils/appError');
const { isMongoId } = require('../../utils/safePath');

const invalidParams = () => new AppError({ code: 'INVALID_PARAMS' });
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const MEDIA_GROUPS = {
  image: ['image_name', 'image_thumbnail_name', 'image_caption'],
  video: [
    'video_name',
    'video_thumbnail_name',
    'video_subtitle_originalname',
    'video_subtitle_name',
  ],
  audio: ['audio_name', 'audio_title', 'audio_description'],
};
const MEDIA_MAIN_FIELDS = {
  image: 'image_name',
  video: 'video_name',
  audio: 'audio_name',
};
const MEDIA_STRING_LIMITS = {
  image_caption: 200,
  video_subtitle_originalname: 100,
  audio_title: 200,
  audio_description: 200,
};

function assertBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalidParams();
}

function requireId(body, field) {
  if (!isMongoId(body[field])) throw invalidParams();
  return body[field].toLowerCase();
}

function copyContent(body, target, { required = true } = {}) {
  if (!hasOwn(body, 'content')) {
    if (required) throw invalidParams();
    return;
  }
  if (typeof body.content !== 'string' || body.content.length > 400) throw invalidParams();
  target.content = body.content;
}

function copyRoomTags(body, target, { nullMeansPreserve = false } = {}) {
  if (!hasOwn(body, 'room_tags')) return;
  if (body.room_tags === null) {
    if (!nullMeansPreserve) target.room_tags = [];
    return;
  }
  if (!Array.isArray(body.room_tags) || body.room_tags.some((id) => !isMongoId(id))) {
    throw invalidParams();
  }
  target.room_tags = body.room_tags;
}

function copyAnimation(body, target, { nullMeansPreserve = false } = {}) {
  if (!hasOwn(body, 'animation')) return;
  if (body.animation === null) {
    if (!nullMeansPreserve) target.animation = null;
    return;
  }
  if (body.animation !== 'move-and-erase') throw invalidParams();
  target.animation = body.animation;
}

function normalizedNullableString(value, field = null) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw invalidParams();
  const maxLength = MEDIA_STRING_LIMITS[field];
  if (maxLength !== undefined && value.length > maxLength) throw invalidParams();
  return value;
}

function copyMedia(body, target, { create = false } = {}) {
  const requested = Object.entries(MEDIA_MAIN_FIELDS)
    .filter(([, mainField]) => hasOwn(body, mainField) && normalizedNullableString(body[mainField]))
    .map(([group]) => group);
  if (requested.length > 1) throw invalidParams();

  for (const [group, fields] of Object.entries(MEDIA_GROUPS)) {
    const mainField = MEDIA_MAIN_FIELDS[group];
    const mainProvided = hasOwn(body, mainField);
    const ancillaryValues = fields.slice(1).map((field) => ({
      field,
      provided: hasOwn(body, field),
      value: hasOwn(body, field) ? normalizedNullableString(body[field], field) : null,
    }));
    const nonEmptyAncillaryProvided = ancillaryValues.some(({ provided, value }) => provided && value);

    if (!mainProvided) {
      if (create && nonEmptyAncillaryProvided) throw invalidParams();
      if (!create) {
        for (const { field, provided, value } of ancillaryValues) {
          if (provided) target[field] = value;
        }
      }
      continue;
    }

    const mainValue = normalizedNullableString(body[mainField]);
    if (!mainValue) {
      if (nonEmptyAncillaryProvided) throw invalidParams();
      for (const field of fields) target[field] = null;
      continue;
    }

    target[mainField] = mainValue;
    for (const { field, provided, value } of ancillaryValues) {
      if (create || provided) target[field] = provided ? value : null;
    }

    if (create && group === 'image' && !target.image_thumbnail_name) throw invalidParams();
    if (create && group === 'video' && !target.video_thumbnail_name) throw invalidParams();
    if (
      create &&
      group === 'video' &&
      Boolean(target.video_subtitle_name) !== Boolean(target.video_subtitle_originalname)
    ) {
      throw invalidParams();
    }
  }
}

function baseCreate(body, { tags = false, animation = false } = {}) {
  assertBody(body);
  const target = {
    room_id: requireId(body, 'room_id'),
    content: undefined,
    lang: 'ja',
  };
  copyContent(body, target);
  if (tags) copyRoomTags(body, target);
  if (animation) {
    copyAnimation(body, target);
    if (!hasOwn(target, 'animation')) target.animation = null;
  }
  copyMedia(body, target, { create: true });
  return target;
}

function baseUpdate(body, { tags = false, animation = false, replySemantics = false } = {}) {
  assertBody(body);
  const target = {
    room_id: requireId(body, 'room_id'),
    lang: 'ja',
  };
  copyContent(body, target);
  if (tags) copyRoomTags(body, target, { nullMeansPreserve: replySemantics });
  if (animation) copyAnimation(body, target, { nullMeansPreserve: replySemantics });
  copyMedia(body, target);
  return target;
}

function adaptPostCreate(body) {
  const target = baseCreate(body, { tags: true, animation: true });
  target.floor_id = requireId(body, 'floor_id');
  return target;
}

function adaptPostUpdate(body) {
  return { ...baseUpdate(body, { tags: true, animation: true }), _id: requireId(body, 'post_id') };
}

function adaptPostDelete(body) {
  assertBody(body);
  return { room_id: requireId(body, 'room_id'), _id: requireId(body, 'post_id') };
}

function adaptPostSupplementCreate(body) {
  return { ...baseCreate(body), post_id: requireId(body, 'post_id') };
}

function adaptPostSupplementUpdate(body) {
  return {
    ...baseUpdate(body),
    post_id: requireId(body, 'post_id'),
    _id: requireId(body, 'supplement_id'),
  };
}

function adaptPostSupplementDelete(body) {
  assertBody(body);
  return {
    room_id: requireId(body, 'room_id'),
    post_id: requireId(body, 'post_id'),
    _id: requireId(body, 'supplement_id'),
  };
}

function adaptReplyCreate(body) {
  return {
    ...baseCreate(body, { tags: true, animation: true }),
    post_id: requireId(body, 'post_id'),
    notify_all: false,
  };
}

function adaptReplyUpdate(body) {
  return {
    ...baseUpdate(body, { tags: true, animation: true, replySemantics: true }),
    post_id: requireId(body, 'post_id'),
    _id: requireId(body, 'reply_id'),
    notify_all: false,
  };
}

function adaptReplyDelete(body) {
  assertBody(body);
  return {
    room_id: requireId(body, 'room_id'),
    post_id: requireId(body, 'post_id'),
    _id: requireId(body, 'reply_id'),
  };
}

function adaptReplySupplementCreate(body) {
  return {
    ...baseCreate(body),
    post_id: requireId(body, 'post_id'),
    reply_id: requireId(body, 'reply_id'),
  };
}

function adaptReplySupplementUpdate(body) {
  return {
    ...baseUpdate(body),
    post_id: requireId(body, 'post_id'),
    reply_id: requireId(body, 'reply_id'),
    _id: requireId(body, 'supplement_id'),
  };
}

function adaptReplySupplementDelete(body) {
  assertBody(body);
  return {
    room_id: requireId(body, 'room_id'),
    post_id: requireId(body, 'post_id'),
    reply_id: requireId(body, 'reply_id'),
    _id: requireId(body, 'supplement_id'),
  };
}

module.exports = {
  adaptPostCreate,
  adaptPostDelete,
  adaptPostSupplementCreate,
  adaptPostSupplementDelete,
  adaptPostSupplementUpdate,
  adaptPostUpdate,
  adaptReplyCreate,
  adaptReplyDelete,
  adaptReplySupplementCreate,
  adaptReplySupplementDelete,
  adaptReplySupplementUpdate,
  adaptReplyUpdate,
};
