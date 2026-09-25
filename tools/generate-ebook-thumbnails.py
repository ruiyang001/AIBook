#!/usr/bin/env python3
"""Regenerate the ebook's slider thumbnails without modifying its artwork.

Run with Python and Pillow installed: python tools/generate-ebook-thumbnails.py
Pillow is only needed for this optional asset-generation step, never at runtime.
"""

from pathlib import Path

from PIL import Image, ImageOps


ARTWORK = Path(__file__).resolve().parents[1] / "pics"
WIDTH = 200


def main():
    destination = ARTWORK / "thumbnails"
    destination.mkdir(exist_ok=True)
    sources = [ARTWORK / "FrontCover.png", ARTWORK / "BackCover.png"]
    sources.extend(
        sorted(
            (path for path in ARTWORK.glob("Page*.*") if path.stem[4:].isdigit()),
            key=lambda path: int(path.stem[4:]),
        )
    )

    total = 0
    for source in sources:
        with Image.open(source) as original:
            artwork = ImageOps.exif_transpose(original).convert("RGB")
            height = round(artwork.height * WIDTH / artwork.width)
            thumbnail = artwork.resize((WIDTH, height), Image.Resampling.LANCZOS)
            output = destination / (source.stem + ".webp")
            thumbnail.save(output, "WEBP", quality=78, method=6)
        size = output.stat().st_size
        total += size
        print(f"{output.name}: {WIDTH}x{height}, {size:,} bytes")

    print(f"Generated {len(sources)} thumbnails; {total:,} bytes total.")


if __name__ == "__main__":
    main()
