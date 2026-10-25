// "Login with Yapin’" on a tiny website, using only node:http.
// Env: YAPIN_CLIENT_ID, YAPIN_CLIENT_SECRET. Redirect URL in the app settings: http://localhost:3000/callback
import http from 'node:http';
import { OAuth2Client } from 'yapin.js';

const oauth = new OAuth2Client({
  clientId: process.env.YAPIN_CLIENT_ID,
  clientSecret: process.env.YAPIN_CLIENT_SECRET,
  redirectURI: 'http://localhost:3000/callback',
});

const pending = new Set(); // states we handed out (use real sessions in production)

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  if (url.pathname === '/login') {
    const state = OAuth2Client.generateState();
    pending.add(state);
    res.writeHead(302, { location: oauth.generateAuthURL({ state }) });
    return res.end();
  }
  if (url.pathname === '/callback') {
    const state = url.searchParams.get('state');
    if (url.searchParams.get('error')) return res.end('Login cancelled.');
    if (!pending.delete(state)) {
      res.statusCode = 400;
      return res.end('Unknown state.');
    }
    try {
      const token = await oauth.exchangeCode(url.searchParams.get('code'));
      const user = await oauth.fetchUser(token.accessToken);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(`<p>Hi ${user.displayName ?? user.username}! Your Yapin’ id is <code>${user.id}</code>.</p>`);
    } catch (error) {
      res.statusCode = 500;
      return res.end(`Login failed: ${error.message}`);
    }
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end('<a href="/login">Log in with Yapin’</a>');
}).listen(3000, () => console.log('Open http://localhost:3000'));
