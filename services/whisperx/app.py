import json
import os
import pathlib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

LANG_MAP = {
    "eng": "en", "zho": "zh", "jpn": "ja", "kor": "ko",
    "rus": "ru", "ara": "ar", "heb": "he", "spa": "es",
    "fra": "fr", "deu": "de", "ita": "it", "por": "pt",
    "nld": "nl", "pol": "pl", "tur": "tr", "swe": "sv",
    "nor": "no", "fin": "fi", "dan": "da", "ces": "cs",
    "hun": "hu", "ron": "ro", "ukr": "uk", "tha": "th",
    "ind": "id", "vie": "vi", "cat": "ca", "hrv": "hr",
}


class AlignRequest(BaseModel):
    audio_path: str
    text_path: str
    language: str
    output_dir: str


@app.post("/align")
def align(req: AlignRequest):
    import whisperx

    lang = LANG_MAP.get(req.language, req.language[:2])
    device = "cuda" if os.environ.get("WHISPERX_USE_GPU", "0") == "1" else "cpu"

    try:
        audio = whisperx.load_audio(req.audio_path)
        duration = len(audio) / 16000.0

        with open(req.text_path, "r", encoding="utf-8") as f:
            text = f.read().replace("\n", " ").strip()

        if not text:
            raise HTTPException(status_code=422, detail="empty text")

        model_a, metadata = whisperx.load_align_model(language_code=lang, device=device)
        segments = [{"text": text, "start": 0.0, "end": duration}]
        result = whisperx.align(segments, model_a, metadata, audio, device, return_char_alignments=False)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    words = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            word = w.get("word", "").strip()
            if word and "start" in w and "end" in w:
                words.append({"word": word, "start": float(w["start"]), "end": float(w["end"])})

    os.makedirs(req.output_dir, exist_ok=True)
    audio_base = pathlib.Path(req.audio_path).stem
    out_path = os.path.join(req.output_dir, f"{audio_base}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(words, f)

    return words


@app.get("/health")
def health():
    return {"ok": True}
