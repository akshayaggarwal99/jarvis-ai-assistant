export interface SherpaModel {
    id: string;
    name: string;
    description: string;
    size: string;
    language: string;
    urls: {
        model: string;
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
            model: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/model.int8.onnx',
            tokens: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/tokens.txt'
        }
    }
];

export const DEFAULT_PARAKEET_MODEL = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8';
