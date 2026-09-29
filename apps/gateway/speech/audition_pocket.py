"""Development-only comparison against the same public audition sentence."""
import json
import time
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
from pocket_tts import TTSModel

SAMPLE = "Hi, I'm Shua. You've got a few things on your mind. Let's pick the most important one, and take it from there. What would you like to get done?"
torch.set_num_threads(2)
started = time.monotonic()
model = TTSModel.load_model()
print(json.dumps({"load_seconds": time.monotonic()-started}), flush=True)
dest = Path.home() / ".shuacrew/speech/auditions"
dest.mkdir(parents=True, exist_ok=True)
for voice in ["marius", "charles", "michael", "george"]:
    state = model.get_state_for_audio_prompt(voice)
    for i in range(2):
        started = time.monotonic()
        first = None
        chunks = []
        for chunk in model.generate_audio_stream(state, SAMPLE):
            if first is None: first = time.monotonic()-started
            chunks.append(chunk.numpy())
        audio = np.concatenate(chunks)
        sf.write(dest / f"pocket-{voice}-{i}.wav", audio, model.sample_rate)
        print(json.dumps({"voice":voice,"iteration":i,"first_seconds":first,"elapsed_seconds":time.monotonic()-started,"audio_seconds":len(audio)/model.sample_rate}), flush=True)
