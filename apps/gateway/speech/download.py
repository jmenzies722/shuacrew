"""Explicit setup action only. Inference always runs with HF_HUB_OFFLINE=1."""
import json
import os
from pathlib import Path
import sys

home = Path(sys.argv[1])
os.environ["HF_HUB_CACHE"] = str(home / "models" / "hub")
from huggingface_hub import snapshot_download, hf_hub_download

manifest = json.loads(Path(__file__).with_name("manifest.json").read_text())
model = manifest["models"]["qwen"]
snapshot_download(model["repository"], revision=model["revision"], local_dir=home / "models" / model["directory"])
# Exact assets consumed by pocket-tts 3.3.0's English configuration.
hf_hub_download("kyutai/pocket-tts-without-voice-cloning", "languages/english/model.safetensors", revision="e7205b6ee50e654a5ea19f0e9df2b0813b05e921")
hf_hub_download("kyutai/pocket-tts-without-voice-cloning", "languages/english/tokenizer.json", revision="00eac05ed3d16bdc3f6b5d598874019c34a89214")
for voice in ["charles", "paul"]:
    hf_hub_download("kyutai/pocket-tts-without-voice-cloning", f"languages/english/embeddings/{voice}.safetensors", revision="4e1e0a3e611c51c0b4ed8174fc10f32a54644303")
