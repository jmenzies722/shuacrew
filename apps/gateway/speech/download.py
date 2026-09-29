"""Explicit setup action only. Inference always runs with HF_HUB_OFFLINE=1."""
import json
import os
from pathlib import Path
import sys

home = Path(sys.argv[1])
os.environ["HF_HUB_CACHE"] = str(home / "models" / "hub")
from huggingface_hub import snapshot_download, hf_hub_download

manifest = json.loads(Path(__file__).with_name("manifest.json").read_text())
# Only the models the voice cast actually uses (Kokoro: ~0.4 GB, voices included).
for name in sorted({voice["engine"] for voice in manifest["voices"]}):
    model = manifest["models"][name]
    snapshot_download(model["repository"], revision=model["revision"], local_dir=home / "models" / model["directory"])
