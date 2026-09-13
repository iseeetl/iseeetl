const { OAuth2Client } = require('google-auth-library');

let googleClient = null;

const verifyGoogleIdToken = async ({ idToken, audience }) => {
  if (!googleClient) googleClient = new OAuth2Client();
  const ticket = await googleClient.verifyIdToken({ idToken, audience });
  return ticket.getPayload();
};

module.exports = { verifyGoogleIdToken };
