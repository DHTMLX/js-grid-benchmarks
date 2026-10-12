import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { ROOT, VENDOR_DIR, VIEWER_DIR } from '../core/paths.js';
import { DATA_SERVER_URL, VIEWER_PORT } from '../core/ports.js';

const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
};

function vendorMiddleware(req, res, next) {
    const rawPath = req.url?.split('?')[0] || '';
    if (!rawPath.startsWith('/vendor/')) return next();

    const relativePath = decodeURIComponent(rawPath.slice('/vendor/'.length));
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(normalized) || normalized.startsWith('..')) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    const filePath = path.join(VENDOR_DIR, normalized);
    if (!filePath.startsWith(VENDOR_DIR)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.statusCode = 404;
            res.end('Not found');
            return;
        }

        res.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
    });
}

export default defineConfig({
    root: VIEWER_DIR,
    // The dataset server port has one definition, in src/core/ports.js. The browser cannot
    // read the environment, so the resolved URL is substituted in at serve time.
    define: {
        __DATA_SERVER_URL__: JSON.stringify(DATA_SERVER_URL),
    },
    // Allow imports from the project root so adapters can reach ../core/, ../utils/, etc.
    server: {
        port: VIEWER_PORT,
        fs: {
            allow: [ROOT],
        },
    },
    plugins: [{
        name: 'vendor-static',
        configureServer(server) {
            server.middlewares.use(vendorMiddleware);
        },
    }],
});
