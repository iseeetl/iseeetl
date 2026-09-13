const { buildReq, runValidators } = require('./_helpers');
const {
  validateAIAnalysisSearch,
  validateAdditionalPrompt,
  validateAllowedBodyFields,
  validateAnalysisKind,
  validateCanonicalPage,
  validateResultUserSearch,
  validateRevision,
} = require('../../../validates/aiAnalysisSetting.validate');

describe('AI解析設定の入力検証', () => {
  test('リクエスト本文は既知の項目だけを含む通常のオブジェクトを受け付ける', async () => {
    const valid = buildReq({ body: { analysis_kind: 'vision' } });
    const extra = buildReq({ body: { analysis_kind: 'vision', internal_meta: true } });
    const array = buildReq({ body: [] });

    expect(
      (await runValidators(validateAllowedBodyFields(['analysis_kind']), valid)).isEmpty()
    ).toBe(true);
    expect(
      (await runValidators(validateAllowedBodyFields(['analysis_kind']), extra)).isEmpty()
    ).toBe(false);
    expect(
      (await runValidators(validateAllowedBodyFields(['analysis_kind']), array)).isEmpty()
    ).toBe(false);
  });

  test.each(['vision', 'audioScene', 'speech', 'video', 'conversation'])(
    '解析種別として%sを受け付ける',
    async (analysisKind) => {
      const req = buildReq({ body: { analysis_kind: analysisKind } });
      expect((await runValidators(validateAnalysisKind(), req)).isEmpty()).toBe(true);
    }
  );

  test.each([undefined, null, 1, 'unknown'])('不正な解析種別%pを拒否する', async (analysisKind) => {
    const req = buildReq({ body: { analysis_kind: analysisKind } });
    expect((await runValidators(validateAnalysisKind(), req)).isEmpty()).toBe(false);
  });

  test('追加プロンプトは検証前にNFCで正規化し、前後の空白を除去する', async () => {
    const req = buildReq({
      body: { analysis_kind: 'vision', additional_prompt: '  e\u0301  ' },
    });

    const result = await runValidators(validateAdditionalPrompt(), req);

    expect(result.isEmpty()).toBe(true);
    expect(req.body.additional_prompt).toBe('é');
  });

  test('追加プロンプトは空文字と2000文字までを受け付ける', async () => {
    const empty = buildReq({ body: { analysis_kind: 'vision', additional_prompt: '   ' } });
    const boundary = buildReq({
      body: { analysis_kind: 'vision', additional_prompt: '😀'.repeat(2000) },
    });

    expect((await runValidators(validateAdditionalPrompt(), empty)).isEmpty()).toBe(true);
    expect(empty.body.additional_prompt).toBe('');
    expect((await runValidators(validateAdditionalPrompt(), boundary)).isEmpty()).toBe(true);
  });

  test.each([
    [1, 'non-string'],
    ['x'.repeat(2001), 'more than 2000 code points'],
    ['😀'.repeat(2001), 'more than 8000 UTF-8 bytes'],
  ])('不正な追加プロンプト%sを拒否する（%s）', async (additionalPrompt) => {
    const req = buildReq({
      body: { analysis_kind: 'vision', additional_prompt: additionalPrompt },
    });

    expect((await runValidators(validateAdditionalPrompt(), req)).isEmpty()).toBe(false);
  });

  test('文字起こしのプロンプトは224バイトを受け付け、225バイトを拒否する', async () => {
    const boundary = buildReq({
      body: { analysis_kind: 'speech', additional_prompt: 'a'.repeat(224) },
    });
    const over = buildReq({
      body: { analysis_kind: 'speech', additional_prompt: 'a'.repeat(225) },
    });

    expect((await runValidators(validateAdditionalPrompt(), boundary)).isEmpty()).toBe(true);
    expect((await runValidators(validateAdditionalPrompt(), over)).isEmpty()).toBe(false);
  });

  test.each([
    ['1', 1],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('リビジョンとして正の安全な整数%pを受け付け、明示的に数値へ変換する', async (input, expected) => {
    const req = buildReq({ body: { revision: input } });

    expect((await runValidators(validateRevision(), req)).isEmpty()).toBe(true);
    expect(req.body.revision).toBe(expected);
  });

  test.each(['0', '-1', '1.5', String(Number.MAX_SAFE_INTEGER + 1), '01x']) (
    '不正なリビジョン%pを拒否する',
    async (revision) => {
      const req = buildReq({ body: { revision } });
      expect((await runValidators(validateRevision(), req)).isEmpty()).toBe(false);
    }
  );

  test.each([
    ['1', 1],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('ページ番号として正規の10進表記の安全な整数%pを受け付ける', async (input, expected) => {
    const req = buildReq({ body: { page: input } });

    expect((await runValidators(validateCanonicalPage(), req)).isEmpty()).toBe(true);
    expect(req.body.page).toBe(expected);
  });

  test.each([
    1,
    '0',
    '01',
    '+1',
    '1.0',
    ' 1 ',
    String(Number.MAX_SAFE_INTEGER + 1),
  ])('ページ番号が正規表記または安全な整数でない場合は拒否する: %p', async (page) => {
    const req = buildReq({ body: { page } });
    expect((await runValidators(validateCanonicalPage(), req)).isEmpty()).toBe(false);
  });

  test('共通設定の検索語は前後の空白を除去し、nullと上限内の文字列を受け付ける', async () => {
    const text = buildReq({ body: { search: '  Vision  ' } });
    const nullable = buildReq({ body: { search: null } });
    const tooLong = buildReq({ body: { search: 'x'.repeat(101) } });

    expect((await runValidators(validateAIAnalysisSearch(), text)).isEmpty()).toBe(true);
    expect(text.body.search).toBe('Vision');
    expect((await runValidators(validateAIAnalysisSearch(), nullable)).isEmpty()).toBe(true);
    expect((await runValidators(validateAIAnalysisSearch(), tooLong)).isEmpty()).toBe(false);
  });

  test('結果ユーザの検索語は前後の空白を除去した文字列とし、nullを拒否する', async () => {
    const text = buildReq({ body: { search: '  alice  ' } });
    const nullable = buildReq({ body: { search: null } });

    expect((await runValidators(validateResultUserSearch(), text)).isEmpty()).toBe(true);
    expect(text.body.search).toBe('alice');
    expect((await runValidators(validateResultUserSearch(), nullable)).isEmpty()).toBe(false);
  });

});
