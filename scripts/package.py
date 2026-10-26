"""Build a LiteLoader installation ZIP from an explicit runtime allowlist."""
from pathlib import Path
import json
import re
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8-sig"))
version = manifest["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
    raise SystemExit("Invalid plugin version")

for injected in manifest["injects"].values():
    resolved = (root / injected).resolve()
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise SystemExit(f"Missing or invalid entrypoint: {injected}")

paths = [root / "manifest.json", root / "README.md", root / "LICENSE", root / "THIRD_PARTY_NOTICES.md"]
paths.extend(sorted(path for path in (root / "src").iterdir() if path.is_file() and path.suffix in {".js", ".cjs", ".mjs"}))
destination = root / "dist" / f"qq-sync-translator-{version}.zip"
destination.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in paths:
        if not path.is_file():
            raise SystemExit(f"Required release file missing: {path.name}")
        archive.write(path, path.relative_to(root).as_posix())
with zipfile.ZipFile(destination) as archive:
    if "manifest.json" not in archive.namelist() or archive.testzip():
        raise SystemExit("Release ZIP validation failed")
print(destination)
