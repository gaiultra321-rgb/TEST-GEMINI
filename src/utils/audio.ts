/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts a Float32Array sample buffer from Web Audio API to standard 16-bit PCM ArrayBuffer.
 */
export function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    // Convert to 16-bit range
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/**
 * Converts an ArrayBuffer to a Base64 string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * High-fidelity, scheduled PCM player that plays continuous 16-bit PCM float raw audio chunks
 * without overlaps, gaps, or buffer issues.
 */
export class PCMChunkPlayer {
  private audioCtx: AudioContext;
  private nextStartTime: number = 0;
  private sampleRate: number;
  private sources: AudioBufferSourceNode[] = [];
  private onVolumeChange?: (vol: number) => void;

  constructor(audioCtx: AudioContext, sampleRate: number = 24000, onVolumeChange?: (vol: number) => void) {
    this.audioCtx = audioCtx;
    this.sampleRate = sampleRate;
    this.nextStartTime = this.audioCtx.currentTime;
    this.onVolumeChange = onVolumeChange;
  }

  /**
   * Schedules a raw PCM base64-encoded sound chunk.
   */
  public playChunk(base64Data: string) {
    const floatBuffer = this.base64ToFloat32Array(base64Data);
    if (floatBuffer.length === 0) return;

    // Conduct a fast RMS signal envelope check to feed visual waveforms
    if (this.onVolumeChange) {
      let sum = 0;
      const length = floatBuffer.length;
      for (let i = 0; i < length; i++) {
        sum += floatBuffer[i] * floatBuffer[i];
      }
      const rms = Math.sqrt(sum / length) || 0;
      // Scale RMS slightly to make small speak ranges visible
      const scaledVol = Math.min(1.0, rms * 4.5);
      this.onVolumeChange(scaledVol);

      // Reset volume after the chunk duration ends
      const durationMs = (length / this.sampleRate) * 1000;
      setTimeout(() => {
        if (this.sources.length === 0 && this.onVolumeChange) {
          this.onVolumeChange(0);
        }
      }, durationMs);
    }

    // Create a 1-channel buffer at our desired sample rate
    const audioBuffer = this.audioCtx.createBuffer(1, floatBuffer.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(floatBuffer);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);
    
    this.sources.push(source);

    // Timeline planning
    const now = this.audioCtx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.03; // Minimal delay tolerance buffer
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;

    // Clean up references to stopped nodes
    source.onended = () => {
      this.sources = this.sources.filter((s) => s !== source);
    };
  }

  /**
   * Instantly interrupts playback. Resets play streams and stops active buffers.
   */
  public interrupt() {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Safe intercept in case source is already stopped
      }
    });
    this.sources = [];
    this.nextStartTime = this.audioCtx.currentTime;
  }

  /**
   * Decodes Base64 to Float32 array representing wave data
   */
  private base64ToFloat32Array(base64: string): Float32Array {
    try {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Convert Int16 bytes to Float32 entries [-1.0, 1.0]
      const int16Buffer = new Int16Array(bytes.buffer);
      const float32Buffer = new Float32Array(int16Buffer.length);
      for (let i = 0; i < int16Buffer.length; i++) {
        float32Buffer[i] = int16Buffer[i] / 32768.0;
      }
      return float32Buffer;
    } catch (e) {
      console.error("PCM decoding error:", e);
      return new Float32Array(0);
    }
  }
}

/**
 * Decodes and executes single full PCM sequence playbacks.
 */
export function playPCMSequence(
  audioCtx: AudioContext,
  base64PCM: string,
  sampleRate: number = 24000
): Promise<AudioBufferSourceNode> {
  try {
    const binaryString = window.atob(base64PCM);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Buffer = new Int16Array(bytes.buffer);
    const float32Buffer = new Float32Array(int16Buffer.length);
    for (let i = 0; i < int16Buffer.length; i++) {
      float32Buffer[i] = int16Buffer[i] / 32768.0;
    }

    const audioBuffer = audioCtx.createBuffer(1, float32Buffer.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Buffer);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();

    return Promise.resolve(source);
  } catch (e) {
    return Promise.reject(e);
  }
}
