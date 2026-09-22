#!/usr/bin/env python3
"""Download, normalize, and package all animal clips in the catalog."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
PROCESSING_VERSION = "1"


GERMAN_FOLDING = str.maketrans({"ä": "a", "ö": "o", "ü": "u", "ß": "ss"})


def german_sort_key(animal: dict) -> str:
    return animal["nameDe"].lower().translate(GERMAN_FOLDING)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def duration_ms(path: Path) -> int:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(result.stdout.strip()) * 1000)


def validate_catalog(catalog: dict) -> None:
    animals = catalog.get("animals")
    if not isinstance(animals, list) or not animals:
        raise ValueError("The catalog must contain at least one animal.")

    animal_ids: set[str] = set()
    source_ids: set[str] = set()
    for animal in animals:
        animal_id = animal.get("id")
        name = animal.get("name")
        name_de = animal.get("nameDe")
        sources = animal.get("sources")
        if not isinstance(animal_id, str) or not animal_id:
            raise ValueError("Every animal needs an id.")
        if animal_id in animal_ids:
            raise ValueError(f"Duplicate animal id: {animal_id}")
        animal_ids.add(animal_id)
        if not isinstance(name, str) or name != name.lower() or not name:
            raise ValueError(f"Animal names must be lowercase: {name!r}")
        if not isinstance(name_de, str) or not name_de.strip():
            raise ValueError(f"Animal {name!r} needs a German name in nameDe.")
        categories = animal.get("categories")
        if categories is not None:
            if not isinstance(categories, list) or not all(
                isinstance(c, str) and c.strip() for c in categories
            ):
                raise ValueError(f"Animal {name!r} has invalid categories.")
        if not isinstance(sources, list) or not sources:
            raise ValueError(f"Animal {name!r} needs at least one source.")
        for source in sources:
            source_id = source.get("youtubeId")
            if not isinstance(source_id, str) or not source_id:
                raise ValueError(f"Animal {name!r} has an invalid YouTube id.")
            if source_id in source_ids:
                raise ValueError(f"Duplicate YouTube id: {source_id}")
            source_ids.add(source_id)


def process_clip(source: dict, cache: Path) -> Path:
    source_id = source["youtubeId"]
    cached_clip = cache / f"{source_id}.mp4"
    if cached_clip.exists():
        return cached_clip

    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary_name:
        temporary = Path(temporary_name)
        download_template = temporary / "source.%(ext)s"
        command = [
            "yt-dlp",
            "--no-playlist",
            "--js-runtimes",
            "node",
            "--format",
            "bv*[height<=720]+ba/b[height<=720]/b",
            "--merge-output-format",
            "mp4",
            "--output",
            str(download_template),
        ]
        if proxy := os.environ.get("YTDLP_PROXY"):
            command.extend(["--proxy", proxy])
        command.append(source["url"])
        run(command)
        downloaded = next(temporary.glob("source.*"), None)
        if downloaded is None:
            raise RuntimeError(f"yt-dlp did not create a file for {source_id}.")

        pending = cache / f"{source_id}.pending.mp4"
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(downloaded),
                "-vf",
                "scale='min(720,iw)':-2,fps=30",
                "-c:v",
                "libx264",
                "-profile:v",
                "main",
                "-level",
                "3.1",
                "-pix_fmt",
                "yuv420p",
                "-preset",
                "medium",
                "-crf",
                "23",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-movflags",
                "+faststart",
                str(pending),
            ]
        )
        pending.replace(cached_clip)

    return cached_clip


def extract_cover(clip: Path, output: Path) -> None:
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            "1",
            "-i",
            str(clip),
            "-frames:v",
            "1",
            "-vf",
            "scale='min(720,iw)':-2",
            "-q:v",
            "3",
            str(output),
        ]
    )


def asset(url_base: str, path: Path) -> dict:
    return {
        "url": f"{url_base}/{path.name}",
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
    }


def build(catalog_path: Path, output: Path, cache: Path, release_base: str) -> dict:
    catalog = json.loads(catalog_path.read_text())
    validate_catalog(catalog)
    output.mkdir(parents=True, exist_ok=True)

    manifest_animals = []
    for animal in sorted(catalog["animals"], key=german_sort_key):
        manifest_clips = []
        first_clip: Path | None = None

        for source in animal["sources"]:
            cached_clip = process_clip(source, cache / PROCESSING_VERSION)
            clip_name = f"{animal['id']}-{source['youtubeId']}.mp4"
            clip_path = output / clip_name
            shutil.copy2(cached_clip, clip_path)
            first_clip = first_clip or clip_path
            manifest_clips.append(
                {
                    "id": source["youtubeId"],
                    **asset(release_base, clip_path),
                    "durationMs": duration_ms(clip_path),
                }
            )

        cover_path = output / f"{animal['id']}.jpg"
        if first_clip is None:
            raise ValueError(f"Animal {animal['name']!r} does not have a clip.")
        extract_cover(first_clip, cover_path)

        manifest_animal = {
            "id": animal["id"],
            "name": animal["name"],
            "nameDe": animal["nameDe"],
            "cover": asset(release_base, cover_path),
            "clips": manifest_clips,
        }
        if "categories" in animal:
            manifest_animal["categories"] = animal["categories"]
        manifest_animals.append(manifest_animal)

    catalog_digest = hashlib.sha256(
        (PROCESSING_VERSION + json.dumps(catalog, sort_keys=True)).encode()
    ).hexdigest()[:16]
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "version": catalog_digest,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "animals": manifest_animals,
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--release-base", required=True)
    args = parser.parse_args()
    build(args.catalog, args.output, args.cache, args.release_base.rstrip("/"))


if __name__ == "__main__":
    main()
