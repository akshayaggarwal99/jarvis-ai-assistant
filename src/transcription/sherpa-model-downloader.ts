
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { Logger } from '../core/logger';
import { PARAKEET_MODELS } from './sherpa-models';

export class SherpaModelDownloader {
    private modelsDir: string;

    constructor() {
        this.modelsDir = path.join(app.getPath('userData'), 'sherpa-models');
        if (!fs.existsSync(this.modelsDir)) {
            fs.mkdirSync(this.modelsDir, { recursive: true });
        }
    }

    public getDownloadedModels(): string[] {
        if (!fs.existsSync(this.modelsDir)) return [];

        const models = fs.readdirSync(this.modelsDir).filter(modelId => {
            const modelPath = path.join(this.modelsDir, modelId);
            const modelDef = PARAKEET_MODELS.find(m => m.id === modelId);

            if (!modelDef) return false;

            const hasModel = fs.existsSync(path.join(modelPath, 'model.int8.onnx'));
            const hasTokens = fs.existsSync(path.join(modelPath, 'tokens.txt'));

            return hasModel && hasTokens;
        });

        return models;
    }

    public isModelDownloaded(modelId: string): boolean {
        const downloaded = this.getDownloadedModels();
        return downloaded.includes(modelId);
    }

    public async downloadModel(
        modelId: string,
        onProgress?: (percent: number, downloadedMB: number, totalMB: number) => void
    ): Promise<boolean> {
        const modelDef = PARAKEET_MODELS.find(m => m.id === modelId);
        if (!modelDef) {
            Logger.error(`[SherpaDownloader] Model definition not found for ${modelId}`);
            return false;
        }

        const modelDir = path.join(this.modelsDir, modelId);
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        try {
            Logger.info(`[SherpaDownloader] Starting download for ${modelId}`);

            // Download model file (main file)
            await this.downloadFile(
                modelDef.urls.model,
                path.join(modelDir, 'model.int8.onnx'),
                (p, d, t) => {
                    if (onProgress) onProgress(p, d, t);
                }
            );

            // Download tokens file (small file)
            await this.downloadFile(
                modelDef.urls.tokens,
                path.join(modelDir, 'tokens.txt')
            );

            Logger.success(`[SherpaDownloader] Successfully downloaded ${modelId}`);
            return true;

        } catch (error) {
            Logger.error(`[SherpaDownloader] Failed to download model ${modelId}:`, error);
            // Cleanup partial download (optional, maybe keep for resume later? For now, keep simple)
            return false;
        }
    }

    private async downloadFile(url: string, destPath: string, onProgress?: (percent: number, downloadedMB: number, totalMB: number) => void): Promise<void> {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);

        const totalSize = parseInt(response.headers.get('content-length') || '0', 10);
        let downloadedSize = 0;

        const fileStream = fs.createWriteStream(destPath);

        return new Promise((resolve, reject) => {
            if (!response.body) {
                reject(new Error('Response body is empty'));
                return;
            }

            response.body.on('data', (chunk: Buffer) => {
                downloadedSize += chunk.length;
                if (onProgress && totalSize > 0) {
                    const percent = Math.round((downloadedSize / totalSize) * 100);
                    const downloadedMB = Math.round(downloadedSize / 1024 / 1024 * 10) / 10;
                    const totalMB = Math.round(totalSize / 1024 / 1024 * 10) / 10;
                    onProgress(percent, downloadedMB, totalMB);
                }
            });

            response.body.pipe(fileStream);

            response.body.on('error', (err) => {
                fileStream.close();
                fs.unlink(destPath, () => { }); // Delete partial file
                reject(err);
            });

            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });

            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => { }); // Delete partial file
                reject(err);
            });
        });
    }
}
