"""Compatibility entry point: render both selected SVG icon variants."""
from pathlib import Path
import subprocess

script = Path(__file__).resolve().with_name("render-icons.mjs")
subprocess.run(["node", str(script)], check=True)
