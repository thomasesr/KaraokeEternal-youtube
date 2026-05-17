# CPU variant — installs CPU-only torch to avoid pulling CUDA torch
FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-align.txt ./
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir --no-deps whisperx && \
    pip install --no-cache-dir -r requirements-align.txt

COPY app.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

VOLUME ["/data", "/shared-tmp"]
EXPOSE 5002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5002/health')" || exit 1
ENTRYPOINT ["./entrypoint.sh"]
