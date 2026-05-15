#!/usr/bin/env python3
"""CLI wrapper for ctc_forced_aligner v1.0.2 (onnxruntime-based, no CLI binary)."""
import argparse
import json
import os
import sys

def main():
    p = argparse.ArgumentParser(description='CTC forced alignment CLI shim')
    p.add_argument('--audio_path', required=True)
    p.add_argument('--text_path', required=True)
    p.add_argument('--language', default='eng')
    p.add_argument('--output_dir', required=True)
    p.add_argument('--device', default='cpu')  # kept for CLI compat; ONNX backend ignores it
    args = p.parse_args()

    from ctc_forced_aligner import (
        load_audio,
        generate_emissions,
        preprocess_text,
        get_alignments,
        get_spans,
        postprocess_results,
        AlignmentSingleton,
    )

    model_dir = os.environ.get(
        'CTC_MODEL_PATH',
        os.path.join(os.path.expanduser('~'), 'ctc_forced_aligner'),
    )
    aligner = AlignmentSingleton(model_path=os.path.join(model_dir, 'model.onnx'))

    audio_waveform = load_audio(args.audio_path)

    with open(args.text_path, 'r', encoding='utf-8') as f:
        text = f.read().replace('\n', ' ').strip()

    emissions, stride = generate_emissions(aligner.alignment_model, audio_waveform)
    tokens_starred, text_starred = preprocess_text(text, romanize=True, language=args.language)
    segments, scores, blank_token = get_alignments(
        emissions, tokens_starred, aligner.alignment_tokenizer
    )
    spans = get_spans(tokens_starred, segments, blank_token)
    word_timestamps = postprocess_results(text_starred, spans, stride, scores)

    # Normalize to {word, start, end} — library uses 'text' key
    result = [
        {'word': w['text'], 'start': w['start'], 'end': w['end']}
        for w in word_timestamps
    ]

    os.makedirs(args.output_dir, exist_ok=True)
    audio_base = os.path.splitext(os.path.basename(args.audio_path))[0]
    out_path = os.path.join(args.output_dir, f'{audio_base}.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f)

if __name__ == '__main__':
    main()
