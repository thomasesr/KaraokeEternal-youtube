FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir faster-whisper

COPY app.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV WHISPER_MODEL=small \
    WHISPER_USE_GPU=0 \
    WHISPER_MODEL_CACHE=/data/whisper

VOLUME ["/data", "/shared-tmp"]
EXPOSE 5002
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5002/health')" || exit 1
ENTRYPOINT ["./entrypoint.sh"]
