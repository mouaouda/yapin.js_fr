# Login with Yapin’

Let people log in to your website with their Yapin’ account, using the OAuth2 authorization code flow. Your site never sees their password, only what they agree to share.

> This is in testing on Yapin’, so only some people can make apps for now.

## Setup

1. In **Settings → Developer → Login with Yapin’**, make an app. You get a client ID and a client secret. The secret is shown once; keep it on your server.
2. Add your redirect URL, like `https://my.site/callback`. It must match exactly. It must be https, except `http://localhost` and `http://127.0.0.1`, which work for testing.

## The flow

```js
import { OAuth2Client } from 'yapin.js';

const oauth = new OAuth2Client({
  clientId: process.env.YAPIN_CLIENT_ID,
  clientSecret: process.env.YAPIN_CLIENT_SECRET,
  redirectURI: 'https://my.site/callback',
});

// 1. Send them to Yapin’
app.get('/login', (req, res) => {
  req.session.state = OAuth2Client.generateState();
  res.redirect(oauth.generateAuthURL({ state: req.session.state }));
});

// 2. They come back with ?code=…&state=… (or ?error=access_denied if they said no)
app.get('/callback', async (req, res) => {
  if (req.query.error) return res.send('Login cancelled');
  if (req.query.state !== req.session.state) return res.status(400).send('Bad state');

  const token = await oauth.exchangeCode(req.query.code);   // the code works once, for 60 seconds
  const user = await oauth.fetchUser(token.accessToken);   // { id, username, displayName, avatarURL }

  req.session.userId = user.id; // use the id as the account key; usernames can change
  res.redirect('/');
});
```

`exchangeCode` returns `{ accessToken, tokenType, expiresIn, expiresAt, scope, raw }`. Tokens start with `yo_` and last 30 days. There are no refresh tokens yet, so send people through the login again when one runs out. A token stops working early if the person removes your app in **Settings → Authorized Apps**.

## Apps without a server (PKCE)

Mobile, desktop and single-page apps can't keep a secret. Leave it out and use PKCE:

```js
const oauth = new OAuth2Client({ clientId, redirectURI });
const pkce = OAuth2Client.generatePKCE();           // keep pkce.verifier until the callback
const url = oauth.generateAuthURL({ state, codeChallenge: pkce.challenge });
// …later
const token = await oauth.exchangeCode(code, { codeVerifier: pkce.verifier });
```

Only S256 is supported, which is what `generatePKCE` makes. Apps with a server can use PKCE too.

## Details

- **Scopes:** only `identify`, which gives the id, username, display name (or `null`) and profile picture URL (or `null`). No email, no messages, no posting.
- **Errors:** `exchangeCode` and `fetchUser` throw a `YapinError` with code `OAuth2Error`, plus `status` and `oauthError` (like `invalid_grant`).
- **Limits:** 120 token requests a minute per IP. `/me` allows 300 a minute per IP and 120 per token.
- **Rules:** up to 10 apps per person and 10 redirect URLs per app. Your app shows as not made by Yapin’. Don't pretend to be Yapin’.
