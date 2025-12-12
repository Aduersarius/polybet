const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'geoip-lite', 'data');
const dest = path.join(__dirname, '..', '.next', 'server', 'data');

function copyGeoipData() {
    if (!fs.existsSync(src)) {
        console.warn('[geoip-lite] data source not found at', src);
        return;
    }
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);
    for (const file of files) {
        const from = path.join(src, file);
        const to = path.join(dest, file);
        fs.copyFileSync(from, to);
    }
    console.log(`[geoip-lite] copied ${files.length} data files to ${dest}`);
}

copyGeoipData();
