// `kind` lets the rest of the code branch on which sherpa-onnx recognizer
// to use: `offline-transducer` → OfflineRecognizer (full-utterance decode),
// `online-transducer` → OnlineRecognizer (streaming chunked decode with
// live partials and near-zero end-of-utterance latency).
export type SherpaModelKind = 'offline-transducer' | 'online-transducer';

export interface SherpaModel {
    id: string;
    name: string;
    description: string;
    size: string;
    language: string;
    kind: SherpaModelKind;
    urls: {
        encoder: string;
        decoder: string;
        joiner: string;
        tokens: string;
    };
}

export const PARAKEET_MODELS: SherpaModel[] = [
    {
        id: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
        name: 'Parakeet TDT 0.6B (Int8)',
        description: 'NVIDIA Parakeet TDT 0.6B model (Quantized Int8) for fast & accurate English transcription.',
        size: '600MB',
        language: 'English',
        kind: 'offline-transducer',
        urls: {
            encoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/encoder.int8.onnx',
            decoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/decoder.int8.onnx',
            joiner: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/joiner.int8.onnx',
            tokens: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/tokens.txt'
        }
    }
];

// Streaming models for live transcription via sherpa-onnx OnlineRecognizer.
// Pasting verified URLs is the safer pattern — these were picked from the
// sherpa-onnx model zoo on Hugging Face. Verify before merging by curl-HEAD'ing
// each URL; sherpa-onnx repo naming can drift across releases.
export const STREAMING_MODELS: SherpaModel[] = [
    {
        id: 'sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms',
        name: 'NeMo Streaming Fast Conformer EN (480ms)',
        description: 'NVIDIA NeMo streaming Fast Conformer Transducer — live partial transcripts with ~480ms chunk latency. Same vendor family as Parakeet, smaller (~120MB).',
        size: '120MB',
        language: 'English',
        kind: 'online-transducer',
        urls: {
            encoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms/resolve/main/encoder.onnx',
            decoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms/resolve/main/decoder.onnx',
            joiner: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms/resolve/main/joiner.onnx',
            tokens: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms/resolve/main/tokens.txt'
        }
    }
];

export const ALL_SHERPA_MODELS: SherpaModel[] = [...PARAKEET_MODELS, ...STREAMING_MODELS];

export const DEFAULT_PARAKEET_MODEL = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8';
export const DEFAULT_STREAMING_MODEL = 'sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms';

export function findSherpaModel(modelId: string): SherpaModel | undefined {
    return ALL_SHERPA_MODELS.find(m => m.id === modelId);
}
