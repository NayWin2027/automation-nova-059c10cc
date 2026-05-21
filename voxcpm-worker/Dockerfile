# VoxCPM TTS Worker — Google Cloud Run GPU (NVIDIA L4)
FROM pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/models \
    TRANSFORMERS_CACHE=/models \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg libsndfile1 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-bake model weights into image -> fast cold start
RUN python -c "from huggingface_hub import snapshot_download; \
    snapshot_download(repo_id='openbmb/VoxCPM-0.5B', local_dir='/models/VoxCPM-0.5B', local_dir_use_symlinks=False)" || echo "Model will download on first request"

COPY server.py .

EXPOSE 8080
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--timeout-keep-alive", "300"]