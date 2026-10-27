const fs = require('node:fs');
const path = require('node:path');

// Bundle PDF.js support files locally; no public CDN or external PDF service.
exports.pdfAssetsPlugin = () => {
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const assets = new Map([['pdfjs/LICENSE', path.join(root, 'LICENSE')]]);
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
    for (const name of fs.readdirSync(path.join(root, folder))) {
      if (!fs.statSync(path.join(root, folder, name)).isFile()) continue;
      assets.set(`pdfjs/${folder}/${name}`, path.join(root, folder, name));
    }
  }
  return {
    name: 'iseeetl-local-pdf-assets',
    generateBundle() {
      for (const [fileName, filename] of assets) this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(filename) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = (req.url || '').split('?')[0].replace(/^\//, '');
        const filename = assets.get(key);
        if (!filename) return next();
        res.setHeader('Content-Type', filename.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        res.end(fs.readFileSync(filename));
      });
    },
  };
};
