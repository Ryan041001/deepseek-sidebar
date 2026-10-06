"""Compatibility entry point: render the selected icons/icon.svg, not a new icon."""
from pathlib import Path
import subprocess

script = Path(__file__).resolve().with_name("render-icons.mjs")
subprocess.run(["node", str(script)], check=True)
