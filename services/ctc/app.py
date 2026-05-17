import json
import os
import pathlib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()


class AlignRequest(BaseModel):
    audio_path: str
    text_path: str
    language: str
    output_dir: str


@app.post("/align")
def align(req: AlignRequest):
    model_path = os.environ.get("CTC_MODEL_PATH", "/data/ctc")
    model_file = os.path.join(model_path, "model.onnx")

    from ctc_forced_aligner import (
        load_audio,
        generate_emissions,
        preprocess_text,
        get_alignments,
        get_spans,
        postprocess_results,
        AlignmentSingleton,
    )

    try:
        aligner = AlignmentSingleton(model_path=model_file)
        audio_waveform = load_audio(req.audio_path)

        with open(req.text_path, "r", encoding="utf-8") as f:
            text = f.read().replace("\n", " ").strip()

        if not text:
            raise HTTPException(status_code=422, detail="empty text")

        emissions, stride = generate_emissions(aligner.alignment_model, audio_waveform)
        tokens_starred, text_starred = preprocess_text(text, romanize=True, language=req.language)
        segments, scores, blank_token = get_alignments(emissions, tokens_starred, aligner.alignment_tokenizer)
        spans = get_spans(tokens_starred, segments, blank_token)
        word_timestamps = postprocess_results(text_starred, spans, stride, scores)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = [
        {"word": w["text"], "start": w["start"], "end": w["end"]}
        for w in word_timestamps
    ]

    os.makedirs(req.output_dir, exist_ok=True)
    audio_base = pathlib.Path(req.audio_path).stem
    out_path = os.path.join(req.output_dir, f"{audio_base}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f)

    return result


@app.get("/health")
def health():
    return {"ok": True}
