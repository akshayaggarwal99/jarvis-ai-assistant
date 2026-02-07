export interface SherpaModel {
    id: string;
    name: string;
    description: string;
    size: string;
    language: string;
    isOnline: boolean;
    urls: {
        model?: string;
        tokens: string;
        encoder?: string;
        decoder?: string;
        joiner?: string;
    };
}

export const PARAKEET_MODELS: SherpaModel[] = [
    {
        id: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
        name: 'Parakeet TDT 0.6B (Int8)',
        description: 'NVIDIA Parakeet TDT 0.6B model (Quantized Int8) for fast & accurate English transcription (Offline).',
        size: '600MB',
        language: 'English',
        isOnline: false,
        urls: {
            model: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/model.int8.onnx',
            tokens: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/tokens.txt'
        }
    },
    {
        id: 'sherpa-onnx-streaming-zipformer-en-2023-06-26',
        name: 'Streaming Zipformer (English)',
        description: 'Real-time streaming Zipformer model for fast English transcription.',
        size: '300MB',
        language: 'English',
        isOnline: true,
        urls: {
            encoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/main/encoder-epoch-99-avg-1.onnx',
            decoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/main/decoder-epoch-99-avg-1.onnx',
            joiner: 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/main/joiner-epoch-99-avg-1.onnx',
            tokens: 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/main/tokens.txt'
        }
    }
];

export const DEFAULT_PARAKEET_MODEL = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8';
export const DEFAULT_STREAMING_MODEL = 'sherpa-onnx-streaming-zipformer-en-2023-06-26';

