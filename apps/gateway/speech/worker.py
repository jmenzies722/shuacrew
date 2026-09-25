"""Local-only speech worker. stdout is a bounded JSON-line protocol, never logs."""
import base64
import contextlib
import io
import json
import math
from pathlib import Path
import re
import sys

MANIFEST = json.loads(Path(__file__).with_name("manifest.json").read_text())
VOICES = {voice["id"]: voice for voice in MANIFEST["voices"]}

def validate_request(raw):
    if not isinstance(raw, dict):
        raise ValueError("Invalid request")
    request_id, voice, text, speed = (raw.get(k) for k in ("id", "voiceId", "text", "speed"))
    if not isinstance(request_id, str) or not re.fullmatch(r"[\w-]{1,80}", request_id):
        raise ValueError("Invalid ID")
    if not isinstance(voice, str) or voice not in VOICES:
        raise ValueError("Unknown voice")
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 600:
        raise ValueError("Invalid text length")
    if isinstance(speed, bool) or not isinstance(speed, (float, int)) or not math.isfinite(speed) or not .8 <= speed <= 1.2:
        raise ValueError("Invalid speed")
    return {"id": request_id, "voiceId": voice, "text": text.strip(), "speed": speed}

def main(home):
    # Imports and inference may print; reserve the original stdout for protocol only.
    output = sys.stdout
    def send(value):
        output.write(json.dumps(value) + "\n")
        output.flush()
    model, engine, states = None, None, {}
    send({"type": "ready"})
    for line in sys.stdin:
        request_id = None
        try:
            if len(line) > 16000:
                raise ValueError("Oversized request")
            raw = json.loads(line)
            request_id = raw.get("id")
            request = validate_request(raw)
            voice = VOICES[request["voiceId"]]
            with contextlib.redirect_stdout(sys.stderr):
                import numpy as np
                import soundfile as sf
                if voice["engine"] != engine:
                    # Avoid holding both engines' weights at once.
                    model, states = None, {}
                    import gc
                    gc.collect()
                    if voice["engine"] == "qwen":
                        from mlx_audio.tts.utils import load_model
                        model = load_model(str(home / "models" / MANIFEST["models"]["qwen"]["directory"]))
                    else:
                        import torch
                        torch.set_num_threads(2)
                        from pocket_tts import TTSModel
                        model = TTSModel.load_model()
                    engine = voice["engine"]
                if raw.get("warmup") is True:
                    if engine == "pocket" and voice["speaker"] not in states:
                        states[voice["speaker"]] = model.get_state_for_audio_prompt(voice["speaker"])
                    send({"id": request_id, "type": "done"})
                    continue
                if engine == "qwen":
                    chunks = ((np.asarray(result.audio), result.sample_rate) for result in model.generate_custom_voice(text=request["text"], speaker=voice["speaker"], language="English", instruct="Speak naturally in a warm, calm conversational tone.", stream=True, streaming_interval=.32))
                else:
                    if voice["speaker"] not in states:
                        states[voice["speaker"]] = model.get_state_for_audio_prompt(voice["speaker"])
                    chunks = ((chunk.numpy(), model.sample_rate) for chunk in model.generate_audio_stream(states[voice["speaker"]], request["text"]))
                total = 0
                for audio, rate in chunks:
                    wav = io.BytesIO()
                    sf.write(wav, audio, rate, format="WAV", subtype="PCM_16")
                    data = wav.getvalue()
                    total += len(data)
                    if total > 16 * 1024 * 1024:
                        raise ValueError("Audio limit exceeded")
                    send({"id": request_id, "type": "audio", "data": base64.b64encode(data).decode("ascii")})
            send({"id": request_id, "type": "done"})
        except Exception:
            # Do not leak paths, text or model diagnostics through errors.
            send({"id": request_id, "type": "error"})

if __name__ == "__main__":
    main(Path(sys.argv[1]))
