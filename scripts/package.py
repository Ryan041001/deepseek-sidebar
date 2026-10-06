"""Build an installable source ZIP; exclude tests, dependencies and local files."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / "dist"
out.mkdir(exist_ok=True)
manifest = json.loads((root / "manifest.json").read_text())
archive = out / f"deepseek-sidebar-{manifest['version']}.zip"
files = ["manifest.json", "background.js", "shared.js", "content.js",
         "sidepanel.html", "sidepanel.css", "sidepanel.js", "README.md", "README.en.md",
         "LICENSE", "NOTICE.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md",
         "docs/PRIVACY.md", "docs/ARCHITECTURE.md", "docs/TESTING.md", "icons/icon.svg"]
files += [f"icons/icon{size}.png" for size in (16, 32, 48, 128)]
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for name in files:
        z.write(root / name, name)
print(archive)
