import json
import os
import pathlib
import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from faster_whisper import WhisperModel

app = FastAPI()

MODEL_SIZE   = os.environ.get("WHISPER_MODEL", "small")
DEVICE       = "cuda" if os.environ.get("WHISPER_USE_GPU", "0") == "1" else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
MODEL_CACHE  = os.environ.get("WHISPER_MODEL_CACHE", "/data/whisper")

LANG_MAP = {
    "eng": "en", "zho": "zh", "jpn": "ja", "kor": "ko",
    "rus": "ru", "ara": "ar", "heb": "he", "spa": "es",
    "fra": "fr", "deu": "de", "ita": "it", "por": "pt",
    "nld": "nl", "pol": "pl", "tur": "tr", "swe": "sv",
    "nor": "no", "fin": "fi", "dan": "da", "ces": "cs",
    "hun": "hu", "ron": "ro", "ukr": "uk", "tha": "th",
    "ind": "id", "vie": "vi", "cat": "ca", "hrv": "hr",
}

_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=MODEL_CACHE,
        )
    return _model


class AlignRequest(BaseModel):
    audio_path: str
    text_path: str
    language: str
    output_dir: str


def _norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def match_lyrics_to_transcript(lrc_words: list, transcript_words: list) -> list:
    """
    Greedy forward scan: for each LRC word find the best-matching transcript
    word starting from the current pointer. Handles repeated choruses because
    the pointer advances past each match, so the 2nd/3rd repetition of a line
    maps to the 2nd/3rd occurrence in the transcript.
    """
    norm_tr = [_norm(w["word"]) for w in transcript_words]
    result = []
    ptr = 0
    fallback = {"word": "", "start": 0.0, "end": 0.0}

    for lrc_word in lrc_words:
        norm_lrc = _norm(lrc_word)

        if not norm_lrc or ptr >= len(transcript_words):
            prev = result[-1] if result else fallback
            result.append({"word": lrc_word, "start": prev["start"], "end": prev["end"]})
            continue

        best_pos = ptr
        best_score = -1
        # Lookahead window: generous to handle transcription insertions/deletions
        search_end = min(ptr + 50, len(transcript_words))

        for i in range(ptr, search_end):
            tr = norm_tr[i]
            if tr == norm_lrc:
                best_pos = i
                best_score = 1.0
                break
            # Jaccard on character sets as fallback similarity
            a, b = set(norm_lrc), set(tr)
            score = len(a & b) / len(a | b) if (a | b) else 0.0
            if score > best_score:
                best_score = score
                best_pos = i

        tw = transcript_words[best_pos]
        result.append({"word": lrc_word, "start": float(tw["start"]), "end": float(tw["end"])})
        ptr = best_pos + 1

    return result


@app.post("/align")
def align(req: AlignRequest):
    lang = LANG_MAP.get(req.language, req.language[:2])

    try:
        with open(req.text_path, "r", encoding="utf-8") as f:
            lyrics_text = f.read().strip()

        if not lyrics_text:
            raise HTTPException(status_code=422, detail="empty lyrics")

        # Transcribe — use lyrics as initial_prompt to bias toward known vocabulary
        segments_iter, _ = get_model().transcribe(
            req.audio_path,
            language=lang,
            word_timestamps=True,
            initial_prompt=lyrics_text,
            condition_on_previous_text=True,
        )

        transcript_words = []
        for seg in segments_iter:
            for w in (seg.words or []):
                word = w.word.strip()
                if word:
                    transcript_words.append({"word": word, "start": w.start, "end": w.end})

        if not transcript_words:
            raise HTTPException(status_code=500, detail="transcription produced no words")

        # Build ordered LRC word list (same order the server will slice by)
        lrc_words = []
        for line in lyrics_text.split("\n"):
            lrc_words.extend(line.strip().split())

        # Match each LRC word to its transcript timestamp
        result = match_lyrics_to_transcript(lrc_words, transcript_words)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    os.makedirs(req.output_dir, exist_ok=True)
    audio_base = pathlib.Path(req.audio_path).stem
    out_path = os.path.join(req.output_dir, f"{audio_base}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f)

    return result


@app.get("/health")
def health():
    return {"ok": True}
