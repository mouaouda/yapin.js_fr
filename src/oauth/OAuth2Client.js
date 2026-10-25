import { createHash, randomBytes } from 'node:crypto';
import { SiteURL } from '../util/Constants.js';
import { ErrorCodes, YapinError } from '../errors/index.js';

const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Login with Yapin’ (OAuth2 authorization code flow, `identify` scope).
 *
 *   const oauth = new OAuth2Client({ clientId, clientSecret, redirectURI: 'https://my.site/callback' });
 *   const state = OAuth2Client.generateState();             // keep it in the visitor's session
 *   res.redirect(oauth.generateAuthURL({ state }));
 *   // in /callback, after checking state:
 *   const token = await oauth.exchangeCode(req.query.code);
 *   const user = await oauth.fetchUser(token.accessToken);   // { id, username, displayName, avatarURL }
 *
 * Apps without a server (mobile, desktop, single page) leave out clientSecret and use PKCE.
 */
export class OAuth2Client {
  constructor({ clientId, clientSecret, redirectURI, baseURL = SiteURL, fetch: fetchImpl } = {}) {
    if (!clientId || !redirectURI) throw new TypeError('OAuth2Client needs clientId and redirectURI');
    this.clientId = clientId;
    Object.defineProperty(this, 'clientSecret', { value: clientSecret ?? null, enumerable: false });
    this.redirectURI = redirectURI;
    this.baseURL = baseURL.replace(/\/$/, '');
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  static generateState(bytes = 24) {
    return base64url(randomBytes(bytes));
  }

  /** { verifier, challenge, method: 'S256' }: send `challenge` in the link, `verifier` when exchanging. */
  static generatePKCE() {
    const verifier = base64url(randomBytes(48));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    return { verifier, challenge, method: 'S256' };
  }

  generateAuthURL({ state, scope = 'identify', codeChallenge } = {}) {
    if (!state) throw new TypeError('Pass a random state (OAuth2Client.generateState()) and check it in your callback');
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectURI,
      response_type: 'code',
      scope: [].concat(scope).join(' '),
      state,
    });
    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    return `${this.baseURL}/oauth/authorize?${params}`;
  }

  /** Swaps the code (good once, for 60 seconds) for an access token (yo_…, 30 days, no refresh). */
  async exchangeCode(code, { codeVerifier } = {}) {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirectURI, client_id: this.clientId });
    if (this.clientSecret) body.set('client_secret', this.clientSecret);
    if (codeVerifier) body.set('code_verifier', codeVerifier);
    const res = await this.fetch(`${this.baseURL}/api/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new YapinError(ErrorCodes.OAuth2Error, data.error_description ?? data.error ?? `Token request failed (${res.status})`);
      error.status = res.status;
      error.oauthError = data.error;
      throw error;
    }
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
      scope: data.scope,
      raw: data,
    };
  }

  /** Who the token belongs to. Use `id` as the account key: usernames can change. */
  async fetchUser(accessToken) {
    const res = await this.fetch(`${this.baseURL}/api/oauth/me`, { headers: { authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new YapinError(ErrorCodes.OAuth2Error, data.error ?? `/me failed (${res.status})`);
      error.status = res.status;
      throw error;
    }
    return { id: data.id, username: data.username, displayName: data.display_name ?? null, avatarURL: data.avatar_url ?? null, raw: data };
  }
}
