import { expect } from 'vitest';
import {
  ANALYSIS_KINDS,
  MAX_ADDITIONAL_PROMPT_BYTES,
  MAX_ADDITIONAL_PROMPT_CODE_POINTS,
  MAX_SPEECH_PROMPT_BYTES,
  buildSettingPayload,
  isRevisionConflict,
  normalizeAdditionalPrompt,
  validateAdditionalPrompt,
  validateAnalysisKind,
} from '@/features/analysis/settings';

describe('AI解析設定の入力と送信データ', () => {
  it('5種類の解析kindだけを許可する', () => {
    expect(ANALYSIS_KINDS).to.deep.equal([
      'vision',
      'audioScene',
      'speech',
      'video',
      'conversation',
    ]);
    ANALYSIS_KINDS.forEach((kind) => expect(validateAnalysisKind(kind)).to.equal(true));
    expect(validateAnalysisKind('unknown')).to.equal(false);
  });

  it('プロンプトをNFC正規化してtrimする', () => {
    expect(normalizeAdditionalPrompt('  e\u0301  ')).to.equal('\u00e9');
    expect(validateAdditionalPrompt('  e\u0301  ', 'vision')).to.deep.equal({
      valid: true,
      value: '\u00e9',
      codePoints: 1,
      bytes: 2,
      error: null,
    });
  });

  it('絵文字などのサロゲートペアを1文字としてプロンプトの上限を判定する', () => {
    const accepted = '\ud83d\ude00'.repeat(MAX_ADDITIONAL_PROMPT_CODE_POINTS);
    const rejected = `${accepted}\ud83d\ude00`;

    expect(validateAdditionalPrompt(accepted, 'vision').valid).to.equal(true);
    expect(validateAdditionalPrompt(rejected, 'vision').error).to.equal('tooManyCodePoints');
  });

  it('UTF-8のバイト数上限と文字起こし固有の上限を判定する', () => {
    const generalTooLarge = 'a'.repeat(MAX_ADDITIONAL_PROMPT_BYTES + 1);
    const speechAccepted = 'a'.repeat(MAX_SPEECH_PROMPT_BYTES);
    const speechRejected = `${speechAccepted}a`;

    expect(validateAdditionalPrompt(generalTooLarge, 'vision').error).to.equal('tooManyCodePoints');
    expect(validateAdditionalPrompt('\u0800'.repeat(2000), 'vision').valid).to.equal(true);
    expect(validateAdditionalPrompt(speechAccepted, 'speech').valid).to.equal(true);
    expect(validateAdditionalPrompt(speechRejected, 'speech').error).to.equal('speechTooManyBytes');
  });

  it('string以外のプロンプトを拒否する', () => {
    expect(validateAdditionalPrompt(null, 'vision')).to.deep.equal({
      valid: false,
      value: null,
      codePoints: 0,
      bytes: 0,
      error: 'invalidType',
    });
  });

  it('共通設定の作成データにはバックエンドで許可された項目名だけを使う', () => {
    expect(
      buildSettingPayload({
        scope: 'common',
        form: {
          tagId: 'tag-1',
          analysisKind: 'vision',
          additionalPrompt: '  prompt  ',
          resultUserId: 'user-1',
        },
      })
    ).to.deep.equal({
      category_tag: 'tag-1',
      analysis_kind: 'vision',
      additional_prompt: 'prompt',
      result_user: 'user-1',
    });
  });

  it('フロア・ルームの設定には選択したresult_userを必ず含める', () => {
    const payload = buildSettingPayload({
      scope: 'room',
      floorId: 'floor-1',
      roomId: 'room-1',
      form: {
        tagId: 'tag-1',
        analysisKind: 'speech',
        additionalPrompt: '',
        resultUserId: 'user-2',
      },
    });

    expect(payload).to.deep.equal({
      floor_id: 'floor-1',
      room_id: 'room-1',
      room_tag: 'tag-1',
      analysis_kind: 'speech',
      additional_prompt: '',
      result_user: 'user-2',
    });
  });

  it('共通設定の更新は競合防止用のリビジョンを含め、削除状態を送らない', () => {
    expect(buildSettingPayload({
      scope: 'common',
      form: {
        _id: 'setting-1',
        tagId: 'tag-1',
        analysisKind: 'video',
        additionalPrompt: 'before',
        resultUserId: 'user-1',
        revision: 3,
        deleteFlg: true,
      },
    })).to.deep.equal({
      _id: 'setting-1',
      category_tag: 'tag-1',
      analysis_kind: 'video',
      additional_prompt: 'before',
      result_user: 'user-1',
      revision: 3,
    });
  });

  it('HTTP 409またはCONFLICTコードだけをリビジョンの競合として扱う', () => {
    expect(isRevisionConflict({ response: { status: 409 } })).to.equal(true);
    expect(isRevisionConflict({ response: { status: 400, data: { error: { code: 'CONFLICT' } } } })).to.equal(true);
    expect(isRevisionConflict({ response: { status: 400, data: { error: { code: 'INVALID_PARAMS' } } } })).to.equal(false);
  });
});
