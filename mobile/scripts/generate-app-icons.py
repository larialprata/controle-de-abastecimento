"""Gera ícones do app a partir do PNG da bomba de combustível (fundo branco sólido)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "app-icon-source.png"
ASSETS = ROOT / "assets"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
WHITE_RGBA = (255, 255, 255, 255)

LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

ADAPTIVE_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def load_src_flat() -> Image.Image:
    """Achata transparência do PNG original em fundo branco."""
    raw = Image.open(SRC).convert("RGBA")
    flat = Image.new("RGBA", raw.size, WHITE_RGBA)
    flat.paste(raw, (0, 0), raw)
    return flat


def compose_on_white(icon: Image.Image, size: int, padding_ratio: float) -> Image.Image:
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    max_dim = int(size * (1 - 2 * padding_ratio))
    scaled = icon.copy()
    scaled.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    x = (size - scaled.width) // 2
    y = (size - scaled.height) // 2
    layer = Image.new("RGBA", (size, size), WHITE_RGBA)
    layer.paste(scaled, (x, y), scaled)
    canvas.paste(layer, (0, 0), layer)
    return canvas


def save_webp_rgb(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(path, format="WEBP", quality=95, method=6)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Arquivo fonte não encontrado: {SRC}")

    icon = load_src_flat()

    main_icon = compose_on_white(icon, 1024, 0.12)
    foreground = compose_on_white(icon, 1024, 0.18)
    monochrome = foreground.copy()
    splash = compose_on_white(icon, 1024, 0.1)
    favicon = compose_on_white(icon, 48, 0.1)

    ASSETS.mkdir(parents=True, exist_ok=True)
    main_icon.save(ASSETS / "icon.png", format="PNG", optimize=True)
    foreground.save(ASSETS / "android-icon-foreground.png", format="PNG", optimize=True)
    monochrome.save(ASSETS / "android-icon-monochrome.png", format="PNG", optimize=True)
    splash.save(ASSETS / "splash-icon.png", format="PNG", optimize=True)
    favicon.save(ASSETS / "favicon.png", format="PNG", optimize=True)

    white_bg = Image.new("RGB", (1, 1), (255, 255, 255))

    for folder, size in LAUNCHER_SIZES.items():
        out_dir = ANDROID_RES / folder
        launcher = compose_on_white(icon, size, 0.12)
        save_webp_rgb(launcher, out_dir / "ic_launcher.webp")
        save_webp_rgb(launcher, out_dir / "ic_launcher_round.webp")

    for folder, size in ADAPTIVE_SIZES.items():
        out_dir = ANDROID_RES / folder
        fg = compose_on_white(icon, size, 0.18)
        bg = white_bg.resize((size, size), Image.Resampling.NEAREST)
        save_webp_rgb(fg, out_dir / "ic_launcher_foreground.webp")
        save_webp_rgb(bg, out_dir / "ic_launcher_background.webp")
        save_webp_rgb(fg, out_dir / "ic_launcher_monochrome.webp")

    print("Ícones gerados com sucesso (fundo branco sólido).")


if __name__ == "__main__":
    main()
