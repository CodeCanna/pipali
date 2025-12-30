import { Hono } from 'hono';
import {
    isAnonMode,
    isAuthenticated,
    storeTokens,
    clearTokens,
    getPlatformUserInfo,
    getPlatformUrl,
    syncPlatformModels,
    syncPlatformWebTools,
} from '../auth';

const auth = new Hono();

// OAuth callback - receives tokens from platform after browser OAuth
auth.get('/callback', async (c) => {
    const accessToken = c.req.query('access_token');
    const refreshToken = c.req.query('refresh_token');
    const expiresIn = c.req.query('expires_in');
    const error = c.req.query('error');

    if (error) {
        console.error('[Auth] OAuth callback error:', error);
        return c.html(getAuthErrorHtml(error));
    }

    if (!accessToken || !refreshToken) {
        console.error('[Auth] Missing tokens in callback');
        return c.html(getAuthErrorHtml('Missing authentication tokens'));
    }

    // Calculate expiry
    const expiresAt = expiresIn
        ? new Date(Date.now() + parseInt(expiresIn, 10) * 1000)
        : new Date(Date.now() + 15 * 60 * 1000); // Default 15 minutes

    try {
        // Store tokens
        await storeTokens({ accessToken, refreshToken, expiresAt });
        console.log('[Auth] Tokens stored successfully');

        // Sync platform models and web tools in background
        syncPlatformModels().catch(err => console.error('[Auth] Failed to sync platform models:', err));
        syncPlatformWebTools().catch(err => console.error('[Auth] Failed to sync platform web tools:', err));

        // Redirect to home page after successful auth
        return c.redirect('/');
    } catch (err) {
        console.error('[Auth] Failed to store tokens:', err);
        return c.html(getAuthErrorHtml('Failed to store authentication tokens'));
    }
});

// Get current auth status
auth.get('/status', async (c) => {
    const anonMode = isAnonMode();
    const authenticated = await isAuthenticated();

    let userInfo = null;
    if (authenticated && !anonMode) {
        userInfo = await getPlatformUserInfo();
    }

    return c.json({
        anonMode,
        authenticated,
        user: userInfo,
    });
});

// Logout - clear stored tokens
auth.post('/logout', async (c) => {
    try {
        await clearTokens();
        console.log('[Auth] User logged out');
        return c.json({ success: true });
    } catch (err) {
        console.error('[Auth] Logout error:', err);
        return c.json({ error: 'Failed to logout' }, 500);
    }
});

// Get OAuth URL for Google sign-in
auth.get('/oauth/google/url', async (c) => {
    const platformUrl = getPlatformUrl();
    const callbackUrl = c.req.query('callback_url') || `${new URL(c.req.url).origin}/api/auth/callback`;
    const oauthUrl = `${platformUrl}/auth/oauth/google/authorize?redirect_uri=${encodeURIComponent(callbackUrl)}`;
    return c.json({ url: oauthUrl });
});

// Get platform URL for email auth
auth.get('/platform-url', async (c) => {
    return c.json({ url: getPlatformUrl() });
});

// HTML templates for OAuth callback
function getAuthErrorHtml(error: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Authentication Failed</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #0a0a0a;
            color: #fafafa;
        }
        .card {
            background: #171717;
            padding: 3rem;
            border-radius: 1rem;
            border: 1px solid #262626;
            text-align: center;
            max-width: 400px;
        }
        .icon {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: #ef4444;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0 auto 1.5rem;
        }
        .icon svg { width: 40px; height: 40px; color: white; }
        h1 { color: #fafafa; margin: 0 0 1rem; font-size: 1.5rem; }
        p { color: #a1a1aa; margin: 0; line-height: 1.6; }
        .error {
            background: #1c1917;
            border: 1px solid #991b1b;
            border-radius: 0.5rem;
            padding: 1rem;
            margin-top: 1rem;
            color: #fca5a5;
            font-size: 0.875rem;
        }
        a {
            display: inline-block;
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: #262626;
            color: #fafafa;
            text-decoration: none;
            border-radius: 0.5rem;
        }
        a:hover { background: #363636; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </div>
        <h1>Authentication Failed</h1>
        <p>Something went wrong during authentication.</p>
        <div class="error">${error}</div>
        <a href="/login">Try Again</a>
    </div>
</body>
</html>`;
}

export default auth;
