// Renders public/icons/romeli.svg to the PNG sizes Chrome needs (it rejects SVG manifest icons).
// Usage: node scripts/icons.mjs   (requires rsvg-convert, e.g. `brew install librsvg`)
import { execFileSync } from 'node:child_process';

for (const size of [16, 32, 48, 128]) {
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), 'public/icons/romeli.svg', '-o', `src/platform/chrome/icons/romeli-${size}.png`]);
}
