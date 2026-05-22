/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { SpeechState } from "../types";

interface VisualWaveformProps {
  state: SpeechState;
  isActive: boolean;
  userVolume?: number; // Raw user volume values [0..1]
  botVolume?: number;  // Raw bot volume values [0..1]
}

export function VisualWaveform({ state, isActive, userVolume = 0, botVolume = 0 }: VisualWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI screens
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Render loop
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
        // Render a flat, elegant muted line if inactive
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
        ctx.lineWidth = 2;
        ctx.stroke();

        phaseRef.current = 0;
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      phaseRef.current += 0.05;

      const halfHeight = height / 2;

      // Draw multi-layered glow sine waves
      const drawSineWave = (
        phaseOffset: number,
        amplitudeMultiplier: number,
        frequencyMultiplier: number,
        color: string,
        lineWidth: number
      ) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.shadowBlur = state === "processing" ? 15 : 6;
        ctx.shadowColor = color;

        for (let x = 0; x < width; x++) {
          const relativeX = x / width;
          // Apply a bell curve window function so the wave tapers beautifully at the edges
          const windowFunc = Math.sin(relativeX * Math.PI);
          
          let frequency = relativeX * Math.PI * 2 * frequencyMultiplier;
          let sineValue = Math.sin(frequency + phaseRef.current + phaseOffset);

          // Add a minor secondary wave to make it look organic
          sineValue += Math.sin(frequency * 1.5 - phaseRef.current * 0.5) * 0.2;

          const amplitude = amplitudeMultiplier * windowFunc;
          const y = halfHeight + sineValue * amplitude;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      };

      // Configuration of waves based on active state
      if (state === "listening") {
        // Gentle breathing, responsive to user mic levels if speaking
        const energy = 8 + userVolume * 45;
        ctx.shadowBlur = 4;
        
        // Triple complementary blue/violet glow lines
        drawSineWave(0, energy, 2, "rgba(56, 189, 248, 0.75)", 2.5); // Sky blue
        drawSineWave(Math.PI / 3, energy * 0.75, 1.4, "rgba(139, 92, 246, 0.55)", 2.0); // Violet
        drawSineWave(-Math.PI / 4, energy * 0.5, 2.8, "rgba(99, 102, 241, 0.35)", 1.5); // Indigo
      } else if (state === "processing") {
        // Rapid energy pulse, suggesting brainstorming / loading
        const energy = 15 + Math.sin(phaseRef.current * 2) * 5;
        
        drawSineWave(0, energy, 4.5, "rgba(139, 92, 246, 0.85)", 3.0); // Violet pulse
        drawSineWave(Math.PI / 2, energy * 0.8, 3.2, "rgba(236, 72, 153, 0.65)", 2.0); // Pink secondary
        drawSineWave(-Math.PI / 3, energy * 1.1, 5.5, "rgba(99, 102, 241, 0.45)", 1.5); // Indigo
      } else if (state === "speaking") {
        // High fidelity outputs, syncing with model spoken amplitude
        const energy = 12 + botVolume * 65;
        ctx.shadowBlur = 8;

        // Vivid cyan and coral waveforms
        drawSineWave(0, energy, 2.5, "rgba(6, 182, 212, 0.85)", 3.0); // Vivid Cyan
        drawSineWave(Math.PI / 4, energy * 0.7, 1.8, "rgba(16, 185, 129, 0.65)", 2.0); // Emerald Green
        drawSineWave(-Math.PI / 2, energy * 0.5, 3.8, "rgba(244, 63, 94, 0.45)", 1.5); // Rose Accent
      } else {
        // Idle heartbeat waves
        drawSineWave(0, 5, 1.2, "rgba(148, 163, 184, 0.4)", 2.0);
        drawSineWave(Math.PI / 2, 3, 0.8, "rgba(148, 163, 184, 0.2)", 1.5);
      }

      // Reset shadows for subsequently drawn elements
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, isActive, userVolume, botVolume]);

  return (
    <div className="relative w-full h-56 rounded-2xl bg-[#0a0a0a]/40 backdrop-blur-md border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl group">
      {/* Decorative scanning line */}
      {isActive && state === "processing" && (
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-550/5 to-transparent h-full w-full animate-pulse pointer-events-none" />
      )}

      {/* Dynamic Glowing Orb in center background from Professional Polish spec */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <div className="absolute w-[280px] h-[280px] bg-blue-500/5 rounded-full animate-pulse" />
        <div className="absolute w-[220px] h-[220px] bg-purple-500/5 rounded-full" />
        <div className={`w-36 h-36 rounded-full bg-gradient-to-br from-blue-500/20 via-indigo-600/20 to-purple-800/20 shadow-[0_0_60px_rgba(37,99,235,0.25)] flex items-center justify-center transform transition-all duration-700 ${
          isActive ? "scale-105 opacity-100" : "scale-95 opacity-40"
        }`}>
          <div className="absolute w-32 h-32 rounded-full border border-white/5 backdrop-blur-xs" />
        </div>
      </div>
      
      {/* Absolute canvas player */}
      <canvas ref={canvasRef} className="w-full h-full block z-10 relative opacity-90" />

      {/* Decorative layout values */}
      <div className="absolute top-4 left-4 flex items-center gap-1.5 pointer-events-none select-none z-20">
        <span className={`inline-block w-2 h-2 rounded-full ${
          !isActive 
            ? "bg-zinc-650 animate-none" 
            : state === "listening" 
              ? "bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.6)]" 
              : state === "processing" 
                ? "bg-purple-500 animate-spin" 
                : "bg-cyan-400 animate-bounce shadow-[0_0_8px_rgba(34,211,238,0.6)]"
        }`} />
        <span className="font-mono text-[9px] uppercase tracking-widest text-white/50 font-medium">
          {!isActive 
            ? "standby" 
            : state === "listening" 
              ? "mic active" 
              : state === "processing" 
                ? "gemini thinking" 
                : "vocalizing"
          }
        </span>
      </div>

      <div className="absolute bottom-4 right-4 font-mono text-[9px] uppercase tracking-widest text-white/40 pointer-events-none select-none z-20">
        {state === "speaking" ? "24 kHz PCM Mono" : "16 kHz PCM Input"}
      </div>
    </div>
  );
}
