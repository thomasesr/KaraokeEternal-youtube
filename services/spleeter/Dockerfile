# CPU variant — spleeter-thomasesr requires Python <=3.11 (norbert dependency)
FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV SPLEETER_DATA=/data/spleeter \
    SPLEETER_MODEL=2stems \
    SPLEETER_OUTPUT_DIR=/data/stems

VOLUME ["/data", "/shared-tmp"]
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')" || exit 1
ENTRYPOINT ["./entrypoint.sh"]
