"""
Local voice adapter for Robo Rhyme Royale (XTTS-v2, free and open source).

Run it on the SAME computer as the game server so it can read the saved household
recordings in ../voices. It only listens on 127.0.0.1.

  pip install coqui-tts fastapi "uvicorn[standard]" soundfile numpy
  COQUI_TOS_AGREED=1 uvicorn xtts_adapter:app --host 127.0.0.1 --port 8020

Then start the game with:
  VOICE_API_URL=http://127.0.0.1:8020/synthesize npm start

First run downloads the model (about 2 GB). XTTS-v2 is licensed for non-commercial use.
Only use voices of people who agreed to it.
"""
import io
import os
import re

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from TTS.api import TTS

VOICES_DIR = os.environ.get("VOICES_DIR", os.path.join(os.path.dirname(__file__), "..", "voices"))
API_KEY = os.environ.get("VOICE_API_KEY")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading XTTS-v2 on {device} ...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
app = FastAPI()


class Req(BaseModel):
    text: str
    voice_id: str


@app.post("/synthesize")
def synthesize(req: Req, authorization: str = Header(None)):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(401, "Unauthorized")
    if not UUID.match(req.voice_id):
        raise HTTPException(400, "Bad voice id")
    ref = os.path.join(VOICES_DIR, req.voice_id + ".wav")
    if not os.path.exists(ref):
        raise HTTPException(404, "Voice not found")
    wav = tts.tts(text=req.text[:300], speaker_wav=ref, language="en")
    buf = io.BytesIO()
    sf.write(buf, np.asarray(wav, dtype=np.float32), 24000, format="WAV")
    return Response(buf.getvalue(), media_type="audio/wav")
