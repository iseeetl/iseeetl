const { runServer } = require('./bootstrap/startServer');

if (require.main === module) {
  void runServer();
}

module.exports = {
  runServer,
};
