"""Gera ícones do app a partir do PNG da bomba de combustível (fundo branco, ícone preto)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "app-icon-source.png"
ASSETS = ROOT / "assets"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
WHITE_RGBA = (255, 255, 255, 255)
BLACK_RGBA = (0, 0, 0, 255)
BG_RGBA = WHITE_RGBA
BG_RGB = (255, 255, 255)


def load_src_inverted() -> Image.Image:
    """Converte ícone branco em fundo preto → ícone preto em fundo branco."""
    raw = Image.open(SRC).convert("RGBA")
    w, h = raw.size
    out = Image.new("RGBA", (w, h), WHITE_RGBA)
    gray = raw.convert("L")
    mask = gray.point(lambda p: 255 if p > 48 else 0)
    black_layer = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    out.paste(black_layer, (0, 0), mask)
    return out


def compose_on_bg(icon: Image.Image, size: int, padding_ratio: float) -> Image.Image:
    canvas = Image.new("RGB", (size, size), BG_RGB)
    max_dim = int(size * (1 - 2 * padding_ratio))
    scaled = icon.copy()
    scaled.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    x = (size - scaled.width) // 2
    y = (size - scaled.height) // 2
    layer = Image.new("RGBA", (size, size), BG_RGBA)
    layer.paste(scaled, (x, y), scaled)
    canvas.paste(layer, (0, 0), layer)
    return canvas


def save_webp_rgb(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(path, format="WEBP", quality=95, method=6)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Arquivo fonte não encontrado: {SRC}")

    icon = load_src_inverted()

    main_icon = compose_on_bg(icon, 1024, 0.12)
    foreground = compose_on_bg(icon, 1024, 0.18)
    monochrome = foreground.copy()
    splash = compose_on_bg(icon, 1024, 0.1)
    favicon = compose_on_bg(icon, 48, 0.1)

    ASSETS.mkdir(parents=True, exist_ok=True)
    main_icon.save(ASSETS / "icon.png", format="PNG", optimize=True)
    foreground.save(ASSETS / "android-icon-foreground.png", format="PNG", optimize=True)
    monochrome.save(ASSETS / "android-icon-monochrome.png", format="PNG", optimize=True)
    splash.save(ASSETS / "splash-icon.png", format="PNG", optimize=True)
    favicon.save(ASSETS / "favicon.png", format="PNG", optimize=True)

    print("Ícones gerados com sucesso (fundo branco, ícone preto).")


if __name__ == "__main__":
    main()
