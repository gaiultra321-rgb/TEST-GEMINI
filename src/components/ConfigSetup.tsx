/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { VoiceConfig, ConfigCheckResponse } from "../types";
import { Sparkles, Mic, HelpCircle, CheckCircle2, AlertTriangle, MessageSquare, Info } from "lucide-react";

interface ConfigSetupProps {
  config: VoiceConfig;
  onUpdateConfig: (newConfig: VoiceConfig) => void;
  apiStatus: ConfigCheckResponse | null;
  onCheckApi: () => void;
}

const PREBUILT_VOICES = [
  { name: "Zephyr", gender: "Warm & Direct", accent: "Balanced Medium Pitch", desc: "A serene, soothing and highly energetic voice." },
  { name: "Kore", gender: "Bright & Energetic", accent: "Clear Female Alto", desc: "Excellent for quick discussions, fast pace, and light prompts." },
  { name: "Puck", gender: "Deep & Conversational", accent: "Resonant Male Bass", desc: "Great for technical tutoring, long stories, and structured logic." },
  { name: "Charon", gender: "Wisened & Calm", accent: "Gentle Older Male", desc: "Softer conversational rhythm, perfect for relaxed mindfulness." },
  { name: "Fenrir", gender: "Expressive & Friendly", accent: "Husky Distinct Male", desc: "Enthusiastic replies, ideal for creative brainstorming." }
];

export function ConfigSetup({ config, onUpdateConfig, apiStatus, onCheckApi }: ConfigSetupProps) {
  const [instruction, setInstruction] = useState(config.systemInstruction);
  const [showKeyInfo, setShowKeyInfo] = useState(false);

  useEffect(() => {
    onCheckApi();
  }, []);

  const handleApplyInstruction = () => {
    onUpdateConfig({
      ...config,
      systemInstruction: instruction
    });
  };

  const handleSelectVoice = (voiceName: any) => {
    onUpdateConfig({
      ...config,
      voiceName
    });
  };

  const presetInstructions = [
    { title: "Friendly Companion", text: "You are a warm, casual, fast-responding voice friend. Keep replies concise, positive, and conversational." },
    { title: "Language Tutor", text: "You are an encouraging native language coach. Help correct any bad pronunciations or slang softly, and explain concepts simply." },
    { title: "Socratic Trainer", text: "You are a philosophical mentor. Inquire with light, challenging questions to expand the user's ideas, always short." }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* API Key Status Notice */}
      <div className={`p-4 rounded-xl border ${
        apiStatus?.status === "ready"
          ? "bg-emerald-950/10 border-emerald-500/25 text-emerald-300"
          : apiStatus?.status === "needs_key"
            ? "bg-amber-950/10 border-amber-500/25 text-amber-300"
            : "bg-white/[0.01] border-white/10 text-white/60"
      }`}>
        <div className="flex items-start gap-3">
          {apiStatus?.status === "ready" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs tracking-wider uppercase">
                {apiStatus?.status === "ready" ? "Service Status Active" : "Requires Gemini Key Authentication"}
              </span>
              <button 
                onClick={onCheckApi} 
                className="text-xs px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-white/80 transition-all border border-white/10 font-mono"
                id="btn-recheck-api"
              >
                Recheck
              </button>
            </div>
            <p className="text-xs leading-relaxed opacity-80 text-white/70">
              {apiStatus?.message || "Checking for injected server-side environment variables..."}
            </p>
            {apiStatus?.status === "needs_key" && (
              <div className="mt-2 text-xs text-amber-250/80 leading-relaxed bg-amber-950/20 p-2.5 rounded border border-amber-500/20">
                To connect permanently, press the **Settings &gt; Secrets** panel in Google AI Studio to set your key safely. In the meantime, you can explore the user interface!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Voice Selection Panel */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-white/90">Select Voice Model Profile</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {PREBUILT_VOICES.map((v) => {
            const isSelected = config.voiceName === v.name;
            return (
              <button
                key={v.name}
                onClick={() => handleSelectVoice(v.name)}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-200 relative overflow-hidden group cursor-pointer ${
                  isSelected
                    ? "bg-blue-950/20 border-blue-500/80 shadow-[0_0_15px_rgba(59,130,246,0.15)] text-white"
                    : "bg-white/[0.01] border-white/5 hover:border-white/15 text-white/50"
                }`}
                id={`btn-voice-${v.name.toLowerCase()}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold text-sm ${isSelected ? "text-blue-300" : "text-white/80"}`}>
                    {v.name}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  )}
                </div>
                <span className="text-[10px] font-mono opacity-80 uppercase tracking-wide">
                  {v.gender}
                </span>
                <span className="text-[10px] opacity-60 mt-0.5 line-clamp-1">
                  {v.accent}
                </span>
                <p className="text-[10px] mt-2 opacity-50 font-sans leading-relaxed group-hover:opacity-75 transition-opacity line-clamp-2">
                  {v.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Prompt / Custom System Instructions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-medium text-white/90 font-sans">Gemini Behavioral Persona</h3>
          </div>
          <span className="text-[10px] text-white/35 font-mono">Applies to both Live & Walkie-Talkie</span>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.01] border border-white/10 space-y-3">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Type custom instructions for Gemini here..."
            className="w-full h-24 bg-[#050505]/80 text-white/90 text-xs rounded-lg p-3 outline-none border border-white/5 focus:border-blue-500/50 transition-colors resize-none leading-relaxed"
            id="input-system-instruction"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-white/40 font-medium">Quick presets:</span>
              {presetInstructions.map((preset) => (
                <button
                  key={preset.title}
                  onClick={() => setInstruction(preset.text)}
                  className="text-[10px] px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-colors"
                  id={`btn-preset-${preset.title.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  {preset.title}
                </button>
              ))}
            </div>

            <button
              onClick={handleApplyInstruction}
              disabled={instruction === config.systemInstruction}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                instruction === config.systemInstruction
                  ? "bg-white/5 text-white/20 border border-white/5 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:opacity-90 cursor-pointer shadow-md"
              }`}
              id="btn-apply-instruction"
            >
              Update Persona
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
