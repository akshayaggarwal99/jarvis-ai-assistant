import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { Logger } from '../core/logger';
import { PARAKEET_MODELS, ALL_SHERPA_MODELS, findSherpaModel, SherpaModel } from './sherpa-models';

// Per-process in-flight dedupe so a duplicate click (or a settings UI race)
// doesn't kick off two simultaneous downloads writing to the same .download
// temp file.
const INFLIGHT_DOWNLOADS = new Map<string, Promise<boolean>>();

// Idle socket timeout — if a chunk doesn't arrive within this window, abort
// and let the caller decide whether to retry. Without this a stalled CDN
// connection hangs the downloader forever.
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

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
            const modelDef = findSherpaModel(modelId);
            if (!modelDef) return false;

            // File names come from the URL basename so .int8.onnx vs .onnx
            // is handled per-model rather than hardcoded.
            const expectedFiles = filesFromModel(modelDef);
            return expectedFiles.every(f => fs.existsSync(path.join(modelPath, f.name)));
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
        const existing = INFLIGHT_DOWNLOADS.get(modelId);
        if (existing) {
            Logger.info(`[SherpaDownloader] Reusing in-flight download for ${modelId}`);
            return existing;
        }
        const run = this.runDownload(modelId, onProgress).finally(() => {
            INFLIGHT_DOWNLOADS.delete(modelId);
        });
        INFLIGHT_DOWNLOADS.set(modelId, run);
        return run;
    }

    private async runDownload(
        modelId: string,
        onProgress?: (percent: number, downloadedMB: number, totalMB: number) => void
    ): Promise<boolean> {
        const modelDef = findSherpaModel(modelId);
        if (!modelDef) {
            Logger.error(`[SherpaDownloader] Model definition not found for ${modelId}`);
            return false;
        }

        const modelDir = path.join(this.modelsDir, modelId);
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        try {
            Logger.info(`[SherpaDownloader] Starting download for ${modelId} (${modelDef.kind})`);

            const filesToDownload = filesFromModel(modelDef);

            // We'll track progress by file count for simplicity, or just pass through individual file progress
            // Since files vary wildly in size (encoder ~600MB, others small), we should ideally weigh them.
            // For now, let's treat encoder as 95% of the work.

            // Actually, we can just download them one by one.

            for (const fileInfo of filesToDownload) {
                const filePath = path.join(modelDir, fileInfo.name);
                if (fs.existsSync(filePath)) {
                    Logger.info(`[SherpaDownloader] File already exists: ${filePath}`);
                    continue;
                }

                Logger.info(`[SherpaDownloader] Downloading ${fileInfo.name}...`);
                const success = await this.downloadFile(
                    fileInfo.url,
                    filePath,
                    (p, d, t) => {
                        // Only report progress for the large files (encoder/decoder) to avoid jumping around?
                        // Or just report it. The user will see it jump.
                        // Let's just report it.
                        if (onProgress) onProgress(p, d, t);
                    }
                );

                if (!success) {
                    Logger.error(`[SherpaDownloader] Failed to download ${fileInfo.name}`);
                    return false;
                }
            }

            Logger.success(`[SherpaDownloader] Successfully downloaded ${modelId}`);
            return true;

        } catch (error) {
            Logger.error(`[SherpaDownloader] Failed to download model ${modelId}:`, error);
            return false;
        }
    }

    private downloadFile(
        url: string,
        destPath: string,
        onProgress?: (percent: number, downloadedMB: number, totalMB: number) => void
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const tempPath = destPath + '.download';
            // If a stale .download from an interrupted run is sitting around,
            // remove it so we don't append on top of it.
            try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* best-effort */ }
            const file = fs.createWriteStream(tempPath);
            let settled = false;
            const finish = (ok: boolean) => {
                if (settled) return;
                settled = true;
                try { file.end(); } catch { /* */ }
                if (!ok) {
                    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* */ }
                }
                resolve(ok);
            };

            const downloadWithRedirects = (currentUrl: string, redirectCount = 0) => {
                if (redirectCount > 5) {
                    Logger.error(`[SherpaDownloader] Too many redirects for ${url}`);
                    finish(false);
                    return;
                }

                const lib = currentUrl.startsWith('https') ? https : http;
                const request = lib.get(currentUrl, (response) => {
                    if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
                        const redirectUrl = response.headers.location;
                        if (redirectUrl) {
                            const nextUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, currentUrl).toString();
                            downloadWithRedirects(nextUrl, redirectCount + 1);
                            return;
                        }
                    }

                    if (response.statusCode !== 200) {
                        Logger.error(`[SherpaDownloader] Download failed with status: ${response.statusCode}`);
                        finish(false);
                        return;
                    }

                    const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
                    let downloadedBytes = 0;

                    response.on('data', (chunk) => {
                        downloadedBytes += chunk.length;
                        file.write(chunk);
                        if (onProgress) {
                            const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
                            const downloadedMB = Math.round(downloadedBytes / 1024 / 1024 * 10) / 10;
                            const totalMB = Math.round(totalBytes / 1024 / 1024 * 10) / 10;
                            onProgress(percent, downloadedMB, totalMB);
                        }
                    });

                    response.on('end', () => {
                        if (totalBytes > 0 && downloadedBytes < totalBytes) {
                            Logger.error(`[SherpaDownloader] Short read: ${downloadedBytes}/${totalBytes} bytes`);
                            finish(false);
                            return;
                        }
                        file.end();
                        // Small delay to ensure the write stream flushed.
                        setTimeout(() => {
                            try {
                                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                                fs.renameSync(tempPath, destPath);
                                resolve(true);
                            } catch (error) {
                                Logger.error(`[SherpaDownloader] Failed to save file to ${destPath}:`, error);
                                finish(false);
                            }
                        }, 200);
                    });

                    response.on('error', (err) => {
                        Logger.error(`[SherpaDownloader] Stream error:`, err);
                        finish(false);
                    });
                });

                // Idle timeout: if the server stops sending data, abort.
                request.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => {
                    Logger.error(`[SherpaDownloader] Download stalled for ${currentUrl}`);
                    request.destroy(new Error('download idle timeout'));
                });

                request.on('error', (err) => {
                    Logger.error(`[SherpaDownloader] Request error:`, err);
                    finish(false);
                });
            };

            downloadWithRedirects(url);
        });
    }
}

// Derive the on-disk filename for each URL from its basename. Lets streaming
// models (encoder.onnx) and offline int8 models (encoder.int8.onnx) coexist
// without hardcoding the filename per model. Token files are always
// `tokens.txt` regardless of source.
function filesFromModel(model: SherpaModel): { url: string; name: string }[] {
    const basename = (u: string) => {
        try { return new URL(u).pathname.split('/').pop() || 'unknown'; }
        catch { return u.split('/').pop() || 'unknown'; }
    };
    return [
        { url: model.urls.encoder, name: basename(model.urls.encoder) },
        { url: model.urls.decoder, name: basename(model.urls.decoder) },
        { url: model.urls.joiner, name: basename(model.urls.joiner) },
        { url: model.urls.tokens, name: 'tokens.txt' }
    ];
}
