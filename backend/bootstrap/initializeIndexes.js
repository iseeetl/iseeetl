const initializeIndexes = async (models = [
  require('../models/User'),
  require('../models/FloorMember'),
  require('../models/RoomMember'),
  require('../models/KickedUser'),
]) => {
  await Promise.all(models.map(async (model) => {
    try {
      await model.init();
    } catch (error) {
      // 重複エラーに含まれるメールアドレスなどの保存値をログへ出さない。
      const databaseCode = Number.isInteger(error?.code) ? error.code : 'unknown';
      const failure = new Error(`Index initialization failed: model=${model.modelName} databaseCode=${databaseCode}`);
      failure.code = 'INDEX_INITIALIZATION_FAILED';
      throw failure;
    }
  }));
};

module.exports = { initializeIndexes };
