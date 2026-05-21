"""
VoxCPM TTS FastAPI server for Google Cloud Run (GPU).

Endpoints:
  GET  /              -> health check
  GET  /healthz       -> readiness probe
  POST /tts           -> JSON: { text, prompt_text?, prompt_wav_b64?, cfg_value?, inference_timesteps? }
                          returns: audio/wav bytes
"""
import base64
import io
import logging
import os
import tempfile
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("voxcpm")

app = FastAPI(title="VoxCPM TTS Worker")

_model = None
_model_path = os.environ.get("VOXCPM_MODEL_PATH", "/models/VoxCPM-0.5B")


def get_model():
    global _model
    if _model is None:
        log.info("Loading VoxCPM model from %s ...", _model_path)
        from voxcpm import VoxCPM  # imported lazily so /healthz responds fast
        device = "cuda" if torch.cuda.is_available() else "cpu"
        log.info("Using device: %s", device)
        _model = VoxCPM.from_pretrained(_model_path)
        try:
            _model.to(device)
        except Exception:
            pass
        log.info("VoxCPM model loaded.")
    return _model


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    prompt_text: Optional[str] = Field(default=None, max_length=4000)
    prompt_wav_b64: Optional[str] = Field(default=None, description="Base64 WAV bytes for voice cloning")
    cfg_value: float = Field(default=2.0, ge=1.0, le=5.0)
    inference_timesteps: int = Field(default=10, ge=4, le=50)
    normalize: bool = True
    denoise: bool = True


@app.get("/")
def root():
    return {"service": "voxcpm-tts", "ok": True}


@app.get("/healthz")
def healthz():
    return {"ok": True, "cuda": torch.cuda.is_available()}


@app.post("/tts")
def tts(req: TTSRequest):
    try:
        model = get_model()
    except Exception as e:
        log.exception("Model load failed")
        raise HTTPException(status_code=500, detail=f"Model load failed: {e}")

    prompt_wav_path = None
    try:
        if req.prompt_wav_b64:
            try:
                wav_bytes = base64.b64decode(req.prompt_wav_b64)
            except Exception:
                raise HTTPException(status_code=400, detail="prompt_wav_b64 is not valid base64")
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            tmp.write(wav_bytes)
            tmp.flush()
            tmp.close()
            prompt_wav_path = tmp.name

        log.info("Generating: text_len=%d prompt=%s cfg=%.2f steps=%d",
                 len(req.text), bool(prompt_wav_path), req.cfg_value, req.inference_timesteps)

        wav = model.generate(
            text=req.text,
            prompt_text=req.prompt_text,
            prompt_wav_path=prompt_wav_path,
            cfg_value=req.cfg_value,
            inference_timesteps=req.inference_timesteps,
            normalize=req.normalize,
            denoise=req.denoise,
        )

        if isinstance(wav, tuple):
            wav = wav[0]
        wav = np.asarray(wav, dtype=np.float32).squeeze()

        buf = io.BytesIO()
        sf.write(buf, wav, 16000, format="WAV", subtype="PCM_16")
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:
        log.exception("TTS generation failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if prompt_wav_path and os.path.exists(prompt_wav_path):
            try:
                os.unlink(prompt_wav_path)
            except Exception:
                pass