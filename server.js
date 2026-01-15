const express = require('express');
const {google} = require('googleapis');
// Load local .env in development
try { require('dotenv').config(); } catch (e) {}
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('cookie-session');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
// Session keys should come from environment in production. You can set
// SESSION_KEYS as a comma-separated list of secrets.
const SESSION_KEYS = process.env.SESSION_KEYS ? process.env.SESSION_KEYS.split(',') : ['devkey1','devkey2'];
app.use(session({
  name: 'session',
  keys: SESSION_KEYS,
  maxAge: 24 * 60 * 60 * 1000
}));

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.readonly', 'email', 'profile'];

// Microsoft/Outlook scopes (stub)
const MS_SCOPES = ['offline_access', 'User.Read', 'Mail.ReadWrite'];

// Load client id/secret from env
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, `${BASE_URL}/auth/google/callback`);
}

app.get('/auth/google', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send('OAuth client not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  const oauth2Client = createOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  // Log the URL so you can inspect the redirect_uri being sent to Google
  console.log('Generated Google auth URL:', url);
  // Also expose a non-redirecting debug endpoint to inspect the URL
  // (useful when debugging redirect_uri_mismatch)
  // GET /debug/authurl will return the same URL as JSON
  res.redirect(url);
});

app.get('/debug/authurl', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({error: 'oauth-not-configured'});
  const oauth2Client = createOAuthClient();
  const url = oauth2Client.generateAuthUrl({access_type: 'offline', scope: SCOPES});
  res.json({authUrl: url});
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    console.log('OAuth callback query:', req.query);
    if (!req.query.code) return res.status(400).send('Missing code in callback');
    const oauth2Client = createOAuthClient();
    // attempt token exchange, with one retry on transient errors
    let tokens;
    try {
      ({tokens} = await oauth2Client.getToken(req.query.code));
    } catch (firstErr) {
      console.error('First token exchange error:', firstErr && firstErr.message);
      // if connection reset or transient network issue, try once more after short delay
      if (firstErr && firstErr.code && String(firstErr.code).toLowerCase().includes('econnreset')) {
        console.log('Detected ECONNRESET, retrying token exchange after 500ms...');
        await new Promise(r => setTimeout(r, 500));
        ({tokens} = await oauth2Client.getToken(req.query.code));
      } else {
        throw firstErr;
      }
    }
    oauth2Client.setCredentials(tokens);
    req.session.tokens = tokens;
    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error stack:', err && err.stack ? err.stack : err);
    // provide a slightly friendlier message for network errors
    if (err && err.code && String(err.code).toLowerCase().includes('econnreset')) {
      return res.status(502).send('Auth failed: network connection reset when contacting Google token endpoint (ECONNRESET). Check network/proxy/firewall.');
    }
    res.status(500).send('Auth failed: ' + (err.message || String(err)));
  }
});

// Debug endpoint to inspect important env values (safe for local use)
app.get('/debug/env', (req, res) => {
  res.json({CLIENT_ID: !!CLIENT_ID, CLIENT_SECRET: !!CLIENT_SECRET, BASE_URL});
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.tokens) return res.status(401).json({error: 'not-authenticated'});
  next();
}

app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials(req.session.tokens);
    const oauth2 = google.oauth2({auth: oauth2Client, version: 'v2'});
    const me = await oauth2.userinfo.get();
    res.json(me.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'profile-error'});
  }
});

// Outlook/Microsoft OAuth stub (instructions only)
app.get('/auth/microsoft', (req, res) => {
  res.status(501).send('Microsoft integration is a stub in this demo. See README for setup steps.');
});

app.post('/api/gmail/search', requireAuth, async (req, res) => {
  const {query} = req.body;
  if (!query) return res.status(400).json({error: 'missing-query'});
  try {
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials(req.session.tokens);
    const gmail = google.gmail({version: 'v1', auth: oauth2Client});
    const listRes = await gmail.users.messages.list({userId: 'me', q: query, maxResults: 200});
    const messages = listRes.data.messages || [];
    const items = [];
    for (const m of messages) {
      const msg = await gmail.users.messages.get({userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject','From','Date']});
      items.push({id: m.id, threadId: m.threadId, snippet: msg.data.snippet, payload: msg.data.payload, headers: msg.data.payload?.headers});
    }
    res.json({items});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'search-failed'});
  }
});

app.post('/api/gmail/delete', requireAuth, async (req, res) => {
  const {ids, mode} = req.body; // ids array, mode: 'trash' or 'delete'
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({error: 'no-ids'});
  try {
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials(req.session.tokens);
    const gmail = google.gmail({version: 'v1', auth: oauth2Client});
    const results = [];
    for (const id of ids) {
      try {
        if (mode === 'delete') {
          await gmail.users.messages.delete({userId: 'me', id});
          results.push({id, status: 'deleted'});
        } else {
          await gmail.users.messages.trash({userId: 'me', id});
          results.push({id, status: 'trashed'});
        }
      } catch (e) {
        results.push({id, status: 'error', error: e.message});
      }
    }
    res.json({results});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'delete-failed'});
  }
});

app.get('/api/logout', (req, res) => {
  req.session = null;
  res.json({ok: true});
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
