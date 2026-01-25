
import { createHash } from 'crypto';

/**
 * Generates a deterministic avatars with random gradients and "blots"
 * based on a seed string (e.g. user email or ID).
 * Returns a base64 encoded SVG data URI.
 */
export function generateAvatar(seed: string, size = 120): string {
    // Simple seeded RNG
    const hash = createHash('sha256').update(seed).digest('hex');
    let hashIdx = 0;

    const getByte = () => {
        const val = parseInt(hash.substring(hashIdx, hashIdx + 2), 16);
        hashIdx = (hashIdx + 2) % hash.length;
        return val;
    };

    const getFloat = () => getByte() / 255;

    const getRange = (min: number, max: number) => min + getFloat() * (max - min);

    // Helper for HSL colors
    const getRandomColor = (minS = 60, maxS = 90, minL = 50, maxL = 70) => {
        const h = Math.floor(getRange(0, 360));
        const s = Math.floor(getRange(minS, maxS));
        const l = Math.floor(getRange(minL, maxL));
        return `hsl(${h}, ${s}%, ${l}%)`;
    };

    // 1. Background Gradient
    const bgAngle = Math.floor(getRange(0, 360));
    const bgStart = getRandomColor(40, 80, 20, 40); // Darker/richer for background
    const bgEnd = getRandomColor(40, 80, 20, 40);

    // 2. Generate Blots
    const blotCount = 3 + Math.floor(getRange(0, 3)); // 3 to 5 blots
    let blots = '';

    for (let i = 0; i < blotCount; i++) {
        const r = getRange(size * 0.2, size * 0.5); // Radius 20-50% of size
        const cx = getRange(0, size);
        const cy = getRange(0, size);
        const color = getRandomColor(70, 100, 50, 80); // Brighter for blots
        const opacity = getRange(0.4, 0.7);

        blots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}" filter="url(#blur)" />`;
    }

    // 3. Construct SVG
    const svg = `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${bgAngle})">
        <stop offset="0%" stop-color="${bgStart}" />
        <stop offset="100%" stop-color="${bgEnd}" />
      </linearGradient>
      <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${size / 6}" />
      </filter>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)" />
    ${blots}
  </svg>
  `.trim().replace(/\s+/g, ' ');

    // 4. Return as Data URI
    const base64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
}
