const { deleteQuickTextGroup } = require('./quickTextDeletion');
const AppError = require('../../utils/appError');
const { isGoogleTranslateEnabled } = require('../../config/featureFlags');
const translationService = require('../translation.service');

async function getNextOrder(model, filter) {
  const last = await model.findOne(filter).sort({ order: -1 }).select('order').lean();
  return (last?.order || 0) + 1;
}

function buildQuickTextService({
  groupModel,
  itemModel,
  listContext,
  mutationContext,
  buildGroupFilter,
  buildItemFilter,
  allowLangFilter = false,
}) {
  const listGroups = async (params) => {
    await listContext(params);
    const filter = buildGroupFilter(params);
    return groupModel.find(filter).sort({ order: 1, created_at: 1, _id: 1 }).lean();
  };

  const createGroup = async (params) => {
    const context = await mutationContext(params);
    const targets = Array.isArray(context.floor?.target_langs) ? context.floor.target_langs : [];
    const translations = isGoogleTranslateEnabled()
      ? await translationService.translateQuickTextGroup(
          context.user._id,
          { title: params.title, lang: params.lang },
          targets
        )
      : [];

    const nextOrder = await getNextOrder(groupModel, buildGroupFilter(params));
    const createData = {
      floor: context.floor._id,
      user: context.user._id,
      order: nextOrder,
      title: params.title,
      lang: params.lang,
      translations,
    };
    if (context.room) createData.room = context.room._id;

    return groupModel.create(createData);
  };

  const updateGroup = async (params) => {
    const context = await mutationContext(params);
    const groupFilter = { _id: params.id, ...buildGroupFilter(params) };
    const g = await groupModel.findOne(groupFilter);
    if (!g) throw new AppError({ code: 'NOT_FOUND' });

    const updateData = {};
    let needTranslate = false;

    if (typeof params.order !== 'undefined') updateData.order = params.order;
    if (typeof params.title !== 'undefined') {
      updateData.title = params.title;
      needTranslate = true;
    }
    if (typeof params.lang !== 'undefined') {
      updateData.lang = params.lang;
      needTranslate = true;
    }

    if (needTranslate && isGoogleTranslateEnabled()) {
      const targets = Array.isArray(context.floor?.target_langs) ? context.floor.target_langs : [];
      updateData.translations = await translationService.translateQuickTextGroup(
        context.user._id,
        { title: updateData.title ?? g.title, lang: updateData.lang ?? g.lang },
        targets
      );
    }

    return groupModel.findByIdAndUpdate(params.id, updateData, { new: true, runValidators: true });
  };

  const deleteGroup = async (params) => {
    await mutationContext(params);

    return deleteQuickTextGroup({ groupModel, itemModel,
      filter: { _id: params.id, ...buildGroupFilter(params) } });
  };

  const listItems = async (params) => {
    await listContext(params);

    const groupFilter = { _id: params.groupId, ...buildGroupFilter(params) };
    const exists = await groupModel.exists(groupFilter);
    if (!exists) throw new AppError({ code: 'INVALID_PARAMS' });

    const q = buildItemFilter(params);
    if (allowLangFilter && params.lang) q.lang = params.lang;

    return itemModel.find(q).sort({ order: 1, created_at: 1, _id: 1 }).lean();
  };

  const createItem = async (params) => {
    const context = await mutationContext(params);

    const groupFilter = { _id: params.groupId, ...buildGroupFilter(params) };
    const exists = await groupModel.exists(groupFilter);
    if (!exists) throw new AppError({ code: 'INVALID_PARAMS' });

    const targets = Array.isArray(context.floor?.target_langs) ? context.floor.target_langs : [];
    const translations = isGoogleTranslateEnabled()
      ? await translationService.translateQuickTextItem(
          context.user._id,
          { label: params.label, lang: params.lang },
          targets
        )
      : [];

    const nextOrder = await getNextOrder(itemModel, buildItemFilter(params));
    const createData = {
      floor: context.floor._id,
      group: params.groupId,
      order: nextOrder,
      label: params.label,
      lang: params.lang,
      translations,
    };
    if (context.room) createData.room = context.room._id;

    const created = await itemModel.create(createData);
    if (!await groupModel.exists(groupFilter)) {
      await itemModel.deleteOne({ _id: created._id });
      throw new AppError({ code: 'NOT_FOUND' });
    }
    return created;
  };

  const updateItem = async (params) => {
    const context = await mutationContext(params);
    const itemFilter = { _id: params.id, ...buildItemFilter(params) };
    const it = await itemModel.findOne(itemFilter);
    if (!it) throw new AppError({ code: 'NOT_FOUND' });

    const updateData = {};
    let needTranslate = false;

    if (typeof params.order !== 'undefined') updateData.order = params.order;
    if (typeof params.label !== 'undefined') {
      updateData.label = params.label;
      needTranslate = true;
    }
    if (typeof params.lang !== 'undefined') {
      updateData.lang = params.lang;
      needTranslate = true;
    }

    if (needTranslate && isGoogleTranslateEnabled()) {
      const targets = Array.isArray(context.floor?.target_langs) ? context.floor.target_langs : [];
      updateData.translations = await translationService.translateQuickTextItem(
        context.user._id,
        { label: updateData.label ?? it.label, lang: updateData.lang ?? it.lang },
        targets
      );
    }

    return itemModel.findByIdAndUpdate(params.id, updateData, { new: true, runValidators: true });
  };

  const deleteItem = async (params) => {
    await mutationContext(params);

    const deleted = await itemModel.findOneAndDelete({ _id: params.id, ...buildItemFilter(params) });
    if (!deleted) throw new AppError({ code: 'NOT_FOUND' });
    return { ok: true, deletedItemId: String(params.id) };
  };

  return {
    listGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    listItems,
    createItem,
    updateItem,
    deleteItem,
  };
}

module.exports = {
  buildQuickTextService,
};
