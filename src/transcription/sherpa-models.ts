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
//
// ⚠️ Marked "not recommended" in the model picker. The small Fast Conformer
// streaming models (~120MB) we have access to are noticeably less accurate
// than the offline Parakeet TDT 0.6B (600MB) — they misrecognize "going to",
// "eight", and similar on natural speech. Hybrid mode (stream + offline
// re-decode) was tried and removed: it paid the offline-decode cost on
// Fn-up *on top of* the streaming overhead, making it slower than offline
// alone with no accuracy win.
//
// Kept here for completeness (and for future evaluation of larger streaming
// models if/when they're published in sherpa-onnx ONNX format).
export const STREAMING_MODELS: SherpaModel[] = [
    {
        id: 'sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-1040ms',
        name: 'NeMo Streaming Fast Conformer EN — ⚠️ NOT RECOMMENDED (low accuracy)',
        description: 'EXPERIMENTAL. Small streaming Fast Conformer (~120MB). Live partial transcripts during speech, but noticeably less accurate than the offline Parakeet TDT 0.6B. Misses words like "going to" and confuses "eight"/"at" on natural speech. Stick with Parakeet TDT unless you specifically need live partials.',
        size: '120MB',
        language: 'English',
        kind: 'online-transducer',
        urls: {
            encoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-1040ms/resolve/main/encoder.onnx',
            decoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-1040ms/resolve/main/decoder.onnx',
            joiner: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-1040ms/resolve/main/joiner.onnx',
            tokens: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-1040ms/resolve/main/tokens.txt'
        }
    }
];

export const ALL_SHERPA_MODELS: SherpaModel[] = [...PARAKEET_MODELS, ...STREAMING_MODELS];

export const DEFAULT_PARAKEET_MODEL = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8';
export const DEFAULT_STREAMING_MODEL = 'sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-1040ms';

// Lightweight text normalization for streaming model output. The Fast
// Conformer model returns lowercase tokens with no punctuation; this
// gives users readable sentences without a separate ML punctuation
// model. Keep it conservative — over-aggressive normalization risks
// "fixing" things the user actually said.
export function normalizeStreamingText(text: string): string {
    if (!text) return text;
    let out = text.trim();
    if (!out) return out;

    // Capitalize first letter of the whole utterance
    out = out[0].toUpperCase() + out.slice(1);

    // Capitalize standalone "i" → "I"
    out = out.replace(/\bi\b/g, 'I');
    out = out.replace(/\bi'(m|ve|d|ll|re)\b/g, (_m, suffix) => `I'${suffix}`);

    // Capitalize first letter after sentence-ending punctuation + space
    out = out.replace(/([.!?])\s+([a-z])/g, (_m, p, c) => `${p} ${c.toUpperCase()}`);

    // Add a period at the end if the user clearly ended a sentence
    // (long enough, doesn't already end in punctuation)
    if (out.length > 3 && !/[.!?,;:]$/.test(out)) {
        out += '.';
    }

    return out;
}

export function findSherpaModel(modelId: string): SherpaModel | undefined {
    return ALL_SHERPA_MODELS.find(m => m.id === modelId);
}
