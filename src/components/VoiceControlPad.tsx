/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { AppMode, SessionState, SpeechState } from "../types";
import { Mic, MicOff, Play, Square, Loader2, VolumeX, ShieldAlert, Headset, Settings2, Sparkles, HelpCircle } from "lucide-react";

interface VoiceControlPadProps {
  mode: AppMode;
  onModeChange: (newMode: AppMode) => void;
  sessionState: SessionState;
  speechState: SpeechState;
  onStartLive: () => void;
  onStopLive: () => void;
  onStartRecordingWalkie: () => void;
  onStopRecordingWalkie: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  errorMessage: string | null;
}

export function VoiceControlPad({
  mode,
  onModeChange,
  sessionState,
  speechState,
  onStartLive,
  onStopLive,
  onStartRecordingWalkie,
  onStopRecordingWalkie,
  isMuted,
  onToggleMute,
  errorMessage
}: VoiceControlPadProps) {
  const [recordDuration, setRecordDuration] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Track recording length for Walkie-Talkie
  useEffect(() => {
    if (speechState === "listening" && mode === "walkie-talkie") {
      setRecordDuration(0);
      timerRef.current = window.setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [speechState, mode]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="space-y-5">
      {/* Selector between Live Stream vs Walkie Talkie */}
      <div className="flex bg-[#0a0a0a]/50 p-1 rounded-xl border border-white/10 backdrop-blur-xs">
        <button
          onClick={() => {
            if (sessionState !== "active") onModeChange("live");
          }}
          disabled={sessionState === "active"}
          className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            mode === "live"
              ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/10"
              : "text-white/40 hover:text-white/80 disabled:opacity-30"
          }`}
          id="btn-mode-live"
        >
          <Headset className="w-3.5 h-3.5" />
          Live Stream
          <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] bg-white/5 border border-white/10 text-blue-300 font-bold ml-1 uppercase scale-90 font-mono">
            Realtime
          </span>
        </button>

        <button
          onClick={() => {
            if (sessionState !== "active") onModeChange("walkie-talkie");
          }}
          disabled={sessionState === "active"}
          className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            mode === "walkie-talkie"
              ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/10"
              : "text-white/40 hover:text-white/80 disabled:opacity-30"
          }`}
          id="btn-mode-walkie"
        >
          <Mic className="w-3.5 h-3.5" />
          Walkie-Talkie
          <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] bg-white/5 border border-white/10 text-purple-300 font-bold ml-1 uppercase scale-90 font-mono">
            Secure
          </span>
        </button>
      </div>

      {/* Main operational dashboard */}
      <div className="p-6 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 flex flex-col items-center justify-center text-center space-y-4 shadow-2xl">
        
        {errorMessage && (
          <div className="w-full flex items-start gap-2.5 text-left p-3.5 rounded-xl bg-red-950/20 border border-red-900/45 text-red-200 text-xs">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-normal">
              <span className="font-bold block text-red-100">Voice Pipeline Exception:</span>
              <p className="opacity-90 leading-relaxed text-[11px]">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* 1. Live Stream controls */}
        {mode === "live" && (
          <div className="flex flex-col items-center space-y-4 w-full">
            <div className="space-y-1">
              <h4 className="text-sm font-medium tracking-tight text-white/90 flex items-center justify-center gap-1.5 font-sans">
                Full-Duplex Live Streaming Session
              </h4>
              <p className="text-xs text-white/40 max-w-[340px] mx-auto leading-relaxed">
                Connects a continuous audio feed via WebSocket. Speak naturally and listen instantly.
              </p>
            </div>

            <div className="flex items-center gap-4 py-2.5">
              {sessionState === "idle" && (
                <button
                  onClick={onStartLive}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-650 hover:opacity-90 text-white cursor-pointer font-semibold text-xs tracking-wide shadow-lg shadow-blue-500/10 flex items-center gap-2 transform active:scale-95 transition-all duration-155"
                  id="btn-connect-live"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Connect Session
                </button>
              )}

              {sessionState === "connecting" && (
                <div className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/60 text-xs tracking-wide flex items-center gap-2 font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  Bridges Socket Handshake...
                </div>
              )}

              {sessionState === "active" && (
                <div className="flex items-center gap-3">
                  {/* Microphone mute toggle */}
                  <button
                    onClick={onToggleMute}
                    className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      isMuted 
                        ? "bg-red-950/30 border-red-800 text-red-400 hover:bg-red-900/40" 
                        : "bg-white/5 hover:bg-white/10 border-white/10 text-white/80"
                    }`}
                    title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    id="btn-toggle-mic-mute"
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <button
                    onClick={onStopLive}
                    className="px-6 py-3 rounded-2xl bg-red-500 hover:bg-red-650 border border-red-450/40 text-white cursor-pointer font-semibold text-xs tracking-wide shadow-lg shadow-red-500/20 flex items-center gap-2 transform active:scale-95 transition-all"
                    id="btn-disconnect-live"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    Disconnect Live session
                  </button>
                </div>
              )}
            </div>

            {/* Display Connection/Microphone Stream Status */}
            <div className="text-[10px] font-mono uppercase tracking-widest">
              {sessionState === "active" ? (
                isMuted ? (
                  <span className="text-red-400 font-bold animate-pulse">● Microphone Paused</span>
                ) : (
                  <span className="text-emerald-400 font-bold animate-pulse flex items-center gap-1.5 justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                    Bi-Directional Feed Live
                  </span>
                )
              ) : (
                <span className="text-white/35">Stream Disconnected</span>
              )}
            </div>
          </div>
        )}

        {/* 2. Walkie Talkie controls */}
        {mode === "walkie-talkie" && (
          <div className="flex flex-col items-center space-y-4 w-full">
            <div className="space-y-1">
              <h4 className="text-sm font-medium tracking-tight text-white/90">
                Push-to-Talk Conversational Engine
              </h4>
              <p className="text-xs text-white/40 max-w-[340px] mx-auto leading-relaxed">
                Tap to Record your query, and Tap to Stop to submit. Secure transcripts with offline playbacks.
              </p>
            </div>

            <div className="py-2">
              {speechState === "idle" && (
                <button
                  onClick={onStartRecordingWalkie}
                  className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/10 text-white flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 cursor-pointer border border-white/20"
                  id="btn-walkie-record"
                >
                  <Mic className="w-6 h-6 fill-transparent" />
                </button>
              )}

              {speechState === "listening" && (
                <div className="flex flex-col items-center space-y-2">
                  <button
                    onClick={onStopRecordingWalkie}
                    className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all active:scale-95 animate-pulse cursor-pointer border border-white/20"
                    id="btn-walkie-stop"
                  >
                    <Square className="w-5 h-5 fill-white text-white" />
                  </button>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-red-400 font-bold">
                    Recording: {formatDuration(recordDuration)}
                  </span>
                </div>
              )}

              {speechState === "processing" && (
                <div className="w-16 h-16 rounded-full bg-white/5 text-white/30 flex items-center justify-center border border-white/10 animate-spin">
                  <Loader2 className="w-6 h-6 text-indigo-400" />
                </div>
              )}

              {speechState === "speaking" && (
                <div className="flex flex-col items-center space-y-2">
                  <button
                    onClick={onStopRecordingWalkie} // Let them cut short if they want
                    className="w-16 h-16 rounded-full bg-[#121c2c] text-blue-300 flex items-center justify-center cursor-pointer border border-blue-500/30 animate-pulse"
                    id="btn-walkie-speaking"
                  >
                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  </button>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-blue-400 font-bold animate-pulse">
                    vocalizing...
                  </span>
                </div>
              )}
            </div>

            {/* Explanatory subtitle */}
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">
              {speechState === "idle" && "Ready to talk"}
              {speechState === "listening" && "Listening to microphone..."}
              {speechState === "processing" && "Gemini is processing speech..."}
              {speechState === "speaking" && "Gemini model is replying"}
            </div>
          </div>
        )}
      </div>

      {/* Information Cards or Guidelines block */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 text-white/60 text-xs flex gap-3">
          <Settings2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="font-medium text-white/80">Live Modality Advantages</h5>
            <p className="leading-relaxed text-white/40 text-[11px]">
              Live Mode is a streaming connection. It continuously detects pauses and interrupts cleanly, enabling actual face-to-face vocal flow.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 text-white/60 text-xs flex gap-3">
          <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="font-medium text-white/80">Walkie-Talkie Safety</h5>
            <p className="leading-relaxed text-white/40 text-[11px]">
              Walkie-Talkie operates securely on HTTP, allowing complete phrase processing. Ideal for unstable networks, or compiling precise transcripts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
