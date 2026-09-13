jest.mock('../../../../services/timeline/transcription.service', () => ({
  transcribeBuffer: jest.fn(),
}));

const transcriptionService = require('../../../../services/timeline/transcription.service');
const controller = require('../../../../controllers/timeline/transcription.controller.js');

describe('文字起こしのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', user_id: 'user1', role: 'user' }) => ({ body, jwtPayload });
  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('文字起こし', () => {
    test('ファイル・本文・認証情報を渡し、文字起こし結果をtextに入れて返す', async () => {
      const body = { language: 'ja' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      req.file = { buffer: Buffer.from('dummy') };
      const res = makeRes();
      const next = makeNext();

      transcriptionService.transcribeBuffer.mockResolvedValue('こんにちは');

      await controller.transcribe(req, res, next);

      expect(transcriptionService.transcribeBuffer).toHaveBeenCalledWith(req.file, body, jwt);
      expect(res.json).toHaveBeenCalledWith({ text: 'こんにちは' });
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { language: 'en' };
      const req = makeReq(body, { sub: 'u1', user_id: 'u1' });
      req.file = { buffer: Buffer.from('dummy') };
      const res = makeRes();
      const next = makeNext();

      const err = { response: { data: { error: 'bad request' } } };
      transcriptionService.transcribeBuffer.mockRejectedValue(err);

      await controller.transcribe(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });

    test('responseが未定義のエラーもnextへ渡す', async () => {
      const req = makeReq({}, { sub: 'u1', user_id: 'u1' });
      req.file = {};
      const res = makeRes();
      const next = makeNext();

      const err = new Error('transcribe failed');
      transcriptionService.transcribeBuffer.mockRejectedValue(err);

      await controller.transcribe(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
