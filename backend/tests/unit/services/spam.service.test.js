jest.mock('../../../models/Spam', () => ({
  paginate: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  find: jest.fn(() => ({
    select: jest.fn(),
  })),
}));

const Spam = require('../../../models/Spam');
const spamService = require('../../../services/spam.service');

describe('spamのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('スパムの一覧取得', () => {
    beforeEach(() => {
      Spam.paginate.mockResolvedValue({ docs: [] });
    });

    test('検索なしで取得', async () => {
      await expect(spamService.getSpamList({ page: 3 })).resolves.toEqual({ docs: [] });

      expect(Spam.paginate).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ page: 3, limit: 10, sort: { created_at: 'desc' } })
      );
    });

    test('検索語ありで取得', async () => {
      const keyword = 'a+b';
      await spamService.getSpamList({ page: 1, search: keyword });

      const passedQuery = Spam.paginate.mock.calls[0][0];
      expect(passedQuery.word).toMatchObject({
        $regex: 'a\\+b',
        $options: expect.stringContaining('i'),
      });
    });
  });

  describe('スパム作成', () => {
    const userId = 'uid1';

    beforeEach(() => {
      Spam.create.mockResolvedValue({ _id: 's1' });
    });

    test('指定された語句でスパムを作成する', async () => {
      const body = { word: 'bad' };
      await expect(spamService.createSpam(body, userId)).resolves.toEqual({ _id: 's1' });
      expect(Spam.create).toHaveBeenCalledWith({ user: userId, word: 'bad' });
    });
  });

  describe('スパム更新', () => {
    beforeEach(() => {
      Spam.findByIdAndUpdate.mockResolvedValue({ _id: 's2', word: 'upd' });
    });

    test('更新（runValidators/new 指定）', async () => {
      const body = { _id: 's2', word: 'evil' };
      await spamService.updateSpam(body);
      expect(Spam.findByIdAndUpdate).toHaveBeenCalledWith('s2', { word: 'evil' }, { new: true, runValidators: true });
    });
  });

  describe('スパム削除', () => {
    beforeEach(() => {
      Spam.findByIdAndDelete.mockResolvedValue({ _id: 's3' });
    });

    test('削除', async () => {
      await spamService.deleteSpam({ _id: 's3' });
      expect(Spam.findByIdAndDelete).toHaveBeenCalledWith('s3');
    });
  });

  describe('スパム語句の置換', () => {
    test('対象文字列が空 → 空文字返却', async () => {
      await expect(spamService.replaceSpams('')).resolves.toBe('');
      expect(Spam.find).not.toHaveBeenCalled();
    });

    test('スパムワードを *** へ置換', async () => {
      const spams = [{ word: 'bad' }, { word: 'a+b' }];

      const selectMock = jest.fn().mockResolvedValue(spams);
      Spam.find.mockReturnValue({ select: selectMock });

      const originalText = 'BAD and a+b plus Bad!';
      const expected = '*** and *** plus ***!';

      await expect(spamService.replaceSpams(originalText)).resolves.toBe(expected);

      expect(Spam.find).toHaveBeenCalled();
      expect(selectMock).toHaveBeenCalledWith({ word: 1 });
    });
  });
});
