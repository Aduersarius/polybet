// Ensures grouped segment manifest exists where Vercel packaging expects it.
// Copies the root client-reference manifest into the (app) group folder if missing.
const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), '.next', 'server', 'app');
const src = path.join(root, 'page_client-reference-manifest.js');
const destDir = path.join(root, '(app)');
const dest = path.join(destDir, 'page_client-reference-manifest.js');

if (fs.existsSync(src)) {
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    console.log(`[fix-client-ref-manifest] Copied manifest to ${dest}`);
  } else {
    console.log('[fix-client-ref-manifest] Destination already exists, skipping copy.');
  }
} else {
  console.warn('[fix-client-ref-manifest] Source manifest not found:', src);
}
