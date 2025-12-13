import { Hono } from 'hono';
import { serveStatic } from 'hono/bun'
import {
    EMBEDDED_INDEX_HTML,
    EMBEDDED_STYLES_CSS,
    EMBEDDED_APP_JS,
    IS_COMPILED_BINARY,
} from '../embedded-assets';

const app = new Hono();

if (IS_COMPILED_BINARY) {
    // Serve embedded assets from memory
    app.get('/', (c) => {
        return c.html(EMBEDDED_INDEX_HTML);
    });

    app.get('/styles.css', (c) => {
        return c.text(EMBEDDED_STYLES_CSS, 200, {
            'Content-Type': 'text/css',
        });
    });

    app.get('/dist/app.js', (c) => {
        return c.text(EMBEDDED_APP_JS, 200, {
            'Content-Type': 'application/javascript',
        });
    });

    // Fallback for any other routes - serve index.html for SPA routing
    app.get('*', (c) => {
        return c.html(EMBEDDED_INDEX_HTML);
    });
} else {
    // Development mode - serve from disk
    app.get('/', serveStatic({ path: './src/client/index.html' }));
    app.get('*', serveStatic({ root: './src/client' }));
}

export default app;