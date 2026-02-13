export interface SherpaModel {
    id: string;
    name: string;
    description: string;
    size: string;
    language: string;
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
        urls: {
            encoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/encoder.int8.onnx',
            decoder: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/decoder.int8.onnx',
            joiner: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/joiner.int8.onnx',
            tokens: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/tokens.txt'
        }
    }
];

export const DEFAULT_PARAKEET_MODEL = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8';
