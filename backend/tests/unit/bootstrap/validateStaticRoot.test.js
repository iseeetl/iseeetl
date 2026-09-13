const { validateStaticRoot } = require('../../../bootstrap/validateStaticRoot');

test.each(['missing', 'directory', 'entry', 'access'])('productionの%s不備を拒否する', (kind) => {
  const fs = {
    statSync: jest.fn((file) => ({ isDirectory: () => kind !== 'directory', isFile: () => kind !== 'entry' && file.endsWith('index.html') })),
    accessSync: jest.fn(() => { if (kind === 'access') throw new Error('denied'); }),
  };
  expect(() => validateStaticRoot({ nodeEnv: 'production', distRoot: kind === 'missing' ? null : '/fixture/dist' }, fs)).toThrow(/DIST_PATH/);
});

test('productionの正常な入口を確認し、開発環境では既定動作を維持する', () => {
  const fs = { statSync: jest.fn(() => ({ isDirectory: () => true, isFile: () => true })), accessSync: jest.fn() };
  validateStaticRoot({ nodeEnv: 'development' }, fs);
  expect(fs.statSync).not.toHaveBeenCalled();
  validateStaticRoot({ nodeEnv: 'production', distRoot: '/fixture/dist' }, fs);
  expect(fs.accessSync).toHaveBeenCalledTimes(2);
});
