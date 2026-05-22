/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AppMode = "live" | "walkie-talkie";

export type SessionState = "idle" | "connecting" | "active" | "error";

export type SpeechState = "idle" | "listening" | "processing" | "speaking";

export interface ChatMessage {
  id: string;
  role: "user" | "model" | "system";
  text: string;
  transcriptType?: "audio-transcribed" | "live-text";
  timestamp: Date;
  audioUrl?: string; // Optional audio playbacks for histories
}

export interface VoiceConfig {
  voiceName: "Zephyr" | "Puck" | "Charon" | "Kore" | "Fenrir";
  systemInstruction: string;
}

export interface ConfigCheckResponse {
  status: "ready" | "needs_key";
  message: string;
}
