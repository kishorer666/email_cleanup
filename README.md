# Email Cleanup UI (Gmail example)

This is a minimal prototype web UI that demonstrates scanning and deleting Gmail messages by search query.

Features
- Google OAuth2 sign-in
- Search Gmail using Gmail search syntax
- Preview found messages and delete (move to trash) or permanently delete

Setup

1. Create a Google Cloud project and OAuth credentials (Web application). Set authorized redirect URI to `http://localhost:3000/auth/google/callback`.
2. Set environment variables and install dependencies:

```powershell
cd email-cleanup-ui
npm install
setx GOOGLE_CLIENT_ID "your-client-id"
setx GOOGLE_CLIENT_SECRET "your-client-secret"
# or on current shell only
$env:GOOGLE_CLIENT_ID="your-client-id"
$env:GOOGLE_CLIENT_SECRET="your-client-secret"
node server.js
```

3. Open http://localhost:3000 and connect your Google account.

Notes and next steps
- This prototype only implements Gmail integration. Outlook/Microsoft Graph would be similar but requires additional OAuth scopes and Graph calls.
- Outlook / Microsoft Graph (notes)

- To add Outlook support:
	1. Register an app in Azure AD and create OAuth client id/secret. Add redirect URI `http://localhost:3000/auth/microsoft/callback`.
	2. Use the Microsoft identity platform to obtain an access token with `Mail.ReadWrite` and `offline_access` scopes.
	3. Use Microsoft Graph endpoints `GET /me/messages` with `$search` or OData queries to find messages, and `DELETE /me/messages/{id}` to delete.
	4. Implement token storage and refresh handling similar to the Gmail flow in `server.js`.

- This server keeps OAuth tokens in an unsigned cookie session for demo only — for production, securely store refresh tokens in a database and use HTTPS.
- The app requests `gmail.modify` and `gmail.readonly` scopes. Deletions are performed via Gmail API.
