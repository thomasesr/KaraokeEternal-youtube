#!/usr/bin/env python3
"""CLI wrapper for whisperx forced alignment. Same interface as ctc_align.py."""
import argparse
import json
import os
import sys

# ISO 639-2/3 → ISO 639-1 mapping (whisperx uses 2-letter codes)
LANG_MAP = {
    'eng': 'en', 'zho': 'zh', 'jpn': 'ja', 'kor': 'ko',
    'rus': 'ru', 'ara': 'ar', 'heb': 'he', 'spa': 'es',
    'fra': 'fr', 'deu': 'de', 'ita': 'it', 'por': 'pt',
    'nld': 'nl', 'pol': 'pl', 'tur': 'tr', 'swe': 'sv',
    'nor': 'no', 'fin': 'fi', 'dan': 'da', 'ces': 'cs',
    'hun': 'hu', 'ron': 'ro', 'ukr': 'uk', 'tha': 'th',
    'ind': 'id', 'vie': 'vi', 'cat': 'ca', 'hrv': 'hr',
}

def main():
    p = argparse.ArgumentParser(description='whisperx forced alignment CLI shim')
    p.add_argument('--audio_path', required=True)
    p.add_argument('--text_path', required=True)
    p.add_argument('--language', default='eng')
    p.add_argument('--output_dir', required=True)
    p.add_argument('--device', default='cpu')
    args = p.parse_args()

    import whisperx

    lang = LANG_MAP.get(args.language, args.language[:2])

    audio = whisperx.load_audio(args.audio_path)
    duration = len(audio) / 16000.0

    with open(args.text_path, 'r', encoding='utf-8') as f:
        text = f.read().replace('\n', ' ').strip()

    if not text:
        print('whisperx_align: empty text', file=sys.stderr)
        sys.exit(1)

    model_a, metadata = whisperx.load_align_model(
        language_code=lang,
        device=args.device,
    )

    segments = [{'text': text, 'start': 0.0, 'end': duration}]
    result = whisperx.align(
        segments,
        model_a,
        metadata,
        audio,
        args.device,
        return_char_alignments=False,
    )

    words = []
    for seg in result.get('segments', []):
        for w in seg.get('words', []):
            word = w.get('word', '').strip()
            if word and 'start' in w and 'end' in w:
                words.append({'word': word, 'start': float(w['start']), 'end': float(w['end'])})

    os.makedirs(args.output_dir, exist_ok=True)
    audio_base = os.path.splitext(os.path.basename(args.audio_path))[0]
    out_path = os.path.join(args.output_dir, f'{audio_base}.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(words, f)

if __name__ == '__main__':
    main()
