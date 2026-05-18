import os
import pathlib
import subprocess
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()


class SeparateRequest(BaseModel):
    audio_path: str


@app.post("/separate")
def separate(req: SeparateRequest):
    model = os.environ.get("SPLEETER_MODEL", "2stems")
    data = os.environ.get("SPLEETER_DATA", "/data/spleeter")
    config = os.path.join(data, "pretrained_models", model, f"{model}.json")
    output_dir = str(pathlib.Path(req.audio_path).parent)
    use_gpu = os.environ.get("SPLEETER_USE_GPU", "0") == "1"

    env = os.environ.copy()
    if use_gpu:
        env["TF_FORCE_GPU_ALLOW_GROWTH"] = "1"
    else:
        env["CUDA_VISIBLE_DEVICES"] = ""
        env["TF_CPP_MIN_LOG_LEVEL"] = "2"

    os.makedirs(output_dir, exist_ok=True)

    result = subprocess.run(
        ["spleeter", "separate", "-p", config, "-c", "mp3", "-o", output_dir, req.audio_path],
        capture_output=True,
        env=env,
        timeout=600,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")[-2000:]
        raise HTTPException(status_code=500, detail=stderr)

    base = pathlib.Path(req.audio_path).stem
    stem_dir = pathlib.Path(output_dir) / base
    return {
        "accompaniment": str(stem_dir / "accompaniment.mp3"),
        "vocals": str(stem_dir / "vocals.mp3"),
    }


@app.get("/health")
def health():
    return {"ok": True}
