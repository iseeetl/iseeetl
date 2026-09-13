const mongoose = require('mongoose');

const Chat = require('../../../models/Chat');

const objectId = () => new mongoose.Types.ObjectId();

describe('タイムラインのAI解析用スキーマ項目', () => {
  const buildPost = () => ({
    floor: objectId(),
    room: objectId(),
    content: 'source',
  });

  test('投稿と返信のソースリビジョンは明示した場合だけ保存し、安全な整数に制限する', () => {
    const legacy = new Chat({
      ...buildPost(),
      replies: [{ content: 'legacy reply' }],
    });
    expect(legacy.analysis_source_revision).toBeUndefined();
    expect(legacy.replies[0].analysis_source_revision).toBeUndefined();

    const created = new Chat({
      ...buildPost(),
      analysis_source_revision: 1,
      replies: [{ content: 'new reply', analysis_source_revision: 1 }],
    });
    expect(created.validateSync()).toBeUndefined();

    created.analysis_source_revision = Number.MAX_SAFE_INTEGER + 1;
    created.replies[0].analysis_source_revision = -1;
    const validationError = created.validateSync();
    expect(validationError.errors.analysis_source_revision).toBeDefined();
    expect(validationError.errors['replies.0.analysis_source_revision']).toBeDefined();
  });

  test('旧形式の種別だけのメタデータを許可し、来歴の4項目はすべて設定するか未設定にする', () => {
    const legacy = new Chat({
      ...buildPost(),
      supplementaries: [{ content: 'legacy', meta: { analysis_kind: 'vision' } }],
    });
    expect(legacy.validateSync()).toBeUndefined();

    const complete = new Chat({
      ...buildPost(),
      supplementaries: [
        {
          content: 'complete',
          meta: {
            analysis_kind: 'conversation',
            analysis_setting: objectId(),
            analysis_setting_revision: 2,
            analysis_trigger_tag: objectId(),
            analysis_source_revision: 3,
          },
        },
      ],
    });
    expect(complete.validateSync()).toBeUndefined();

    const partial = new Chat({
      ...buildPost(),
      supplementaries: [
        {
          content: 'partial',
          meta: {
            analysis_kind: 'speech',
            analysis_setting: objectId(),
          },
        },
      ],
    });
    const validationError = partial.validateSync();
    expect(validationError.errors['supplementaries.0.meta.analysis_setting']).toBeDefined();
  });

  test('返信の付加情報でも来歴の4項目はすべて設定するか未設定にする', () => {
    const complete = new Chat({
      ...buildPost(),
      replies: [
        {
          content: 'reply',
          supplementaries: [
            {
              content: 'complete',
              meta: {
                analysis_kind: 'speech',
                analysis_setting: objectId(),
                analysis_setting_revision: 1,
                analysis_trigger_tag: objectId(),
                analysis_source_revision: 1,
              },
            },
          ],
        },
      ],
    });
    expect(complete.validateSync()).toBeUndefined();

    const partial = new Chat({
      ...buildPost(),
      replies: [
        {
          content: 'reply',
          supplementaries: [
            {
              content: 'partial',
              meta: {
                analysis_kind: 'speech',
                analysis_source_revision: 1,
              },
            },
          ],
        },
      ],
    });
    const validationError = partial.validateSync();
    expect(validationError.errors['replies.0.supplementaries.0.meta.analysis_source_revision']).toBeDefined();
  });

  test.each([
    ['投稿', (meta) => ({ supplementaries: [{ content: 'post supplement', meta }] })],
    [
      '返信',
      (meta) => ({
        replies: [
          {
            content: 'reply',
            supplementaries: [{ content: 'reply supplement', meta }],
          },
        ],
      }),
    ],
  ])('%sの付加情報で来歴の4項目を設定する場合は解析種別も必須にする', (_name, nested) => {
    const chat = new Chat({
      ...buildPost(),
      ...nested({
        analysis_setting: objectId(),
        analysis_setting_revision: 1,
        analysis_trigger_tag: objectId(),
        analysis_source_revision: 1,
      }),
    });

    expect(chat.validateSync()).toBeDefined();
  });
});
