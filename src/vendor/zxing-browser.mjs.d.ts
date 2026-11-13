export class BrowserQRCodeReader {
  constructor(hints?: unknown, options?: {
    delayBetweenScanAttempts?: number;
    delayBetweenScanSuccess?: number;
    tryPlayVideoTimeout?: number;
  });

  decodeFromVideoDevice(
    deviceId: string | undefined,
    videoElement: HTMLVideoElement,
    callback: (result?: { getText?: () => string }, error?: unknown, controls?: { stop: () => void }) => void
  ): Promise<{ stop: () => void }>;
}
