import { useState, useEffect, useCallback } from 'react';

export interface AudioDevice {
    deviceId: string;
    label: string;
    isDefault?: boolean;
}

export function useAudioDevices() {
    const [devices, setDevices] = useState<AudioDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDevices = useCallback(async () => {
        if (!navigator.mediaDevices) {
            setError('Media devices API not available');
            setLoading(false);
            return;
        }

        try {
            // Request permission to get device labels
            const stream = await navigator.mediaDevices
                .getUserMedia({ audio: true })
                .catch(() => null);

            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }

            // Enumerate devices
            const allDevices = await navigator.mediaDevices.enumerateDevices();

            // Filter audio inputs and remove virtual devices
            const seenDeviceIds = new Set<string>();
            const audioInputs = allDevices
                .filter((device) => device.kind === 'audioinput')
                .filter((device) => {
                    const lowerLabel = device.label.toLowerCase();

                    // Skip virtual devices
                    if (
                        lowerLabel.includes('virtual') ||
                        lowerLabel.includes('teams') ||
                        lowerLabel.includes('zoom audio') ||
                        lowerLabel.includes('discord')
                    ) {
                        return false;
                    }

                    // Skip "Default" entries - we'll add our own
                    if (lowerLabel.startsWith('default')) {
                        return false;
                    }

                    // Skip duplicate device IDs
                    if (seenDeviceIds.has(device.deviceId)) {
                        return false;
                    }
                    seenDeviceIds.add(device.deviceId);

                    return true;
                })
                .map((device) => ({
                    deviceId: device.deviceId,
                    label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
                }));

            // Find actual default device name
            const defaultDevice = allDevices.find(
                (device) =>
                    device.kind === 'audioinput' &&
                    device.label.toLowerCase().startsWith('default')
            );

            let defaultName = '';
            if (defaultDevice) {
                const match = defaultDevice.label.match(
                    /Default\s*[-–]\s*(.+)|Default\s*\((.+)\)/i
                );
                if (match) {
                    defaultName = match[1] || match[2] || '';
                }
            }

            // Add system default as first option
            const devicesWithDefault: AudioDevice[] = [
                {
                    deviceId: 'default',
                    label: defaultName
                        ? `System Default (${defaultName})`
                        : 'System Default',
                    isDefault: true,
                },
                ...audioInputs,
            ];

            setDevices(devicesWithDefault);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch audio devices:', err);
            setError('Failed to access microphone. Please grant permission.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDevices();

        // Listen for device changes (plug/unplug)
        const handleDeviceChange = () => {
            console.log('🎤 [AudioDevices] Device change detected');
            fetchDevices();
        };

        navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

        return () => {
            navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
        };
    }, [fetchDevices]);

    return { devices, loading, error, refetch: fetchDevices };
}
