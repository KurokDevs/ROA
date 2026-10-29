// Genera los iconos PNG de la PWA a partir del SVG (usa Playwright/Chromium).
// Uso: node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const targets = [
  { file: 'pwa-192x192.png', size: 192, pad: 0, radius: true },
  { file: 'pwa-512x512.png', size: 512, pad: 0, radius: true },
  { file: 'apple-touch-icon.png', size: 180, pad: 0, radius: false },
  { file: 'maskable-512x512.png', size: 512, pad: 0.14, radius: false }
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  // iOS y maskable recortan el icono: se dibuja a sangre, sin esquinas redondeadas.
  const body = t.radius ? svg : svg.replace('rx="16"', 'rx="0"');
  const inner = Math.round(t.size * (1 - t.pad * 2));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:${t.radius ? 'transparent' : '#0a0a0a'};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
    <div style="width:${inner}px;height:${inner}px">${body.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: new URL(`../public/${t.file}`, import.meta.url).pathname, omitBackground: t.radius });
  console.log('✓', t.file);
}
await browser.close();
