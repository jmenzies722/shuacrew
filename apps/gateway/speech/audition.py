"""Development benchmark only; generated samples stay outside the repository."""
import argparse
import json
import time
from pathlib import Path

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

SAMPLE = "Hi, I'm Shua. You've got a few things on your mind. Let's pick the most important one, and take it from there. What would you like to get done?"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model")
    parser.add_argument("output")
    parser.add_argument("--voice", default="Ryan")
    parser.add_argument("--count", type=int, default=5)
    args = parser.parse_args()
    dest = Path(args.output)
    dest.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    model = load_model(args.model)
    print(json.dumps({"load_seconds": time.monotonic() - started}), flush=True)
    for i in range(args.count):
        started = time.monotonic()
        first = None
        chunks = []
        for result in model.generate_custom_voice(text=SAMPLE, speaker=args.voice, language="English", instruct="Speak naturally in a warm, calm conversational tone.", stream=True, streaming_interval=0.32):
            audio = np.asarray(result.audio)
            if first is None:
                first = time.monotonic() - started
            chunks.append(audio)
        audio = np.concatenate(chunks)
        sf.write(dest / f"{args.voice.lower()}-{i}.wav", audio, result.sample_rate)
        print(json.dumps({"voice": args.voice, "iteration": i, "first_seconds": first, "elapsed_seconds": time.monotonic()-started, "audio_seconds": len(audio)/result.sample_rate, "peak_gb": mx.get_peak_memory()/1e9}), flush=True)
