/**
 * Gera ícones do app a partir de app-icon-source.png
 * (bomba preta com fundo transparente → fundo branco no launcher).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Jimp } from "jimp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "assets", "app-icon-source.png");
const ASSETS = path.join(ROOT, "assets");

const WHITE = 0xffffffff;
const TRANSPARENT = 0x00000000;

async function loadSource() {
  return Jimp.read(SRC);
}

/** Ícone quadrado com fundo branco sólido (icon.png, splash). */
async function composeOnWhiteBg(source, size, paddingRatio) {
  const canvas = new Jimp({ width: size, height: size, color: WHITE });
  const maxDim = Math.floor(size * (1 - 2 * paddingRatio));
  const scaled = source.clone();
  scaled.contain({ w: maxDim, h: maxDim });
  const x = Math.floor((size - scaled.width) / 2);
  const y = Math.floor((size - scaled.height) / 2);
  canvas.composite(scaled, x, y);
  return canvas;
}

/** Camada adaptativa Android: bomba preta, fundo transparente. */
async function composeForeground(source, size, paddingRatio) {
  const canvas = new Jimp({ width: size, height: size, color: TRANSPARENT });
  const maxDim = Math.floor(size * (1 - 2 * paddingRatio));
  const scaled = source.clone();
  scaled.contain({ w: maxDim, h: maxDim });
  const x = Math.floor((size - scaled.width) / 2);
  const y = Math.floor((size - scaled.height) / 2);
  canvas.composite(scaled, x, y);
  return canvas;
}

async function savePng(img, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await img.write(filePath);
}

async function main() {
  const source = await loadSource();

  const mainIcon = await composeOnWhiteBg(source, 1024, 0.12);
  const foreground = await composeForeground(source, 1024, 0.22);
  const splash = await composeOnWhiteBg(source, 1024, 0.1);
  const favicon = await composeOnWhiteBg(source, 48, 0.08);

  await savePng(mainIcon, path.join(ASSETS, "icon.png"));
  await savePng(foreground, path.join(ASSETS, "android-icon-foreground.png"));
  await savePng(foreground, path.join(ASSETS, "android-icon-monochrome.png"));
  await savePng(splash, path.join(ASSETS, "splash-icon.png"));
  await savePng(favicon, path.join(ASSETS, "favicon.png"));

  console.log("Ícones gerados: bomba preta em fundo branco.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
