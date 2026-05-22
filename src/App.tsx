/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { AppMode, SessionState, SpeechState, ChatMessage, VoiceConfig, ConfigCheckResponse } from "./types";
import { VisualWaveform } from "./components/VisualWaveform";
import { ConfigSetup } from "./components/ConfigSetup";
import { ConversationLogs } from "./components/ConversationLogs";
import { VoiceControlPad } from "./components/VoiceControlPad";
import { floatTo16BitPCM, arrayBufferToBase64, PCMChunkPlayer, playPCMSequence } from "./utils/audio";
import { Mic, Bot, Sparkles, AlertCircle, Headphones, Github, Zap, Volume2, Moon, Settings } from "lucide-react";

export default function App() {
  const [mode, setMode] = useState<AppMode>("walkie-talkie");
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [config, setConfig] = useState<VoiceConfig>({
    voiceName: "Zephyr",
    systemInstruction: "You are a warm, casual, fast-responding voice friend. Keep replies concise, positive, and conversational. Match the user's language."
  });

  const [apiStatus, setApiStatus] = useState<ConfigCheckResponse | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Wave volume levels [0..1]
  const [userVolume, setUserVolume] = useState(0);
  const [botVolume, setBotVolume] = useState(0);

  // Sync refs to avoid stale callback closures matching guidelines
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const voiceConfigRef = useRef(config);
  useEffect(() => {
    voiceConfigRef.current = config;
  }, [config]);

  const speechStateRef = useRef(speechState);
  useEffect(() => {
    speechStateRef.current = speechState;
  }, [speechState]);

  // Audio system and stream references
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activePlayerRef = useRef<PCMChunkPlayer | null>(null);
  const activeWalkieSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // 1. Initial configuration check on load
  const checkApiConfig = async () => {
    try {
      const res = await fetch("/api/config-check");
      const data = await res.json();
      setApiStatus(data);
      if (data.status === "needs_key") {
        setErrorMessage("Notice: server is running without an active GEMINI_API_KEY. Connect using Walkie-Talkie Mode or apply your key in the secrets panel to start.");
      }
    } catch (e) {
      setApiStatus({
        status: "needs_key",
        message: "Failed to connect to backend configuration validator."
      });
    }
  };

  useEffect(() => {
    checkApiConfig();
    return () => {
      // Invalidate live streams on unload
      teardownLiveAll();
      stopAllWalkiePlayback();
    };
  }, []);

  // 2. Stop all Walkie playback source nodes instantly
  const stopAllWalkiePlayback = () => {
    if (activeWalkieSourceRef.current) {
      try {
        activeWalkieSourceRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      activeWalkieSourceRef.current = null;
    }
  };

  // 3. Live WebSocket bridge mechanics
  const startMicrophoneStream = async (audioCtx: AudioContext) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      micProcessorRef.current = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current) {
          setUserVolume(0);
          return;
        }

        const channelData = e.inputBuffer.getChannelData(0);

        // Fetch user recording volume for waveform visual state
        let sum = 0;
        const len = channelData.length;
        for (let i = 0; i < len; i++) {
          sum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sum / len) || 0;
        setUserVolume(Math.min(1.0, rms * 5.0));

        // Quantize float data to raw 16-bit PCM and encode as base64 string
        const pcmBuffer = floatTo16BitPCM(channelData);
        const base64 = arrayBufferToBase64(pcmBuffer);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ audio: base64 }));
        }
      };
    } catch (err: any) {
      console.error("Microphone capture failed inside live:", err);
      setErrorMessage("Microphone access denied. Please enable mic permissions in your browser tab.");
      teardownLiveAll();
    }
  };

  const teardownLiveAll = useCallback(() => {
    console.log("Cleaning up active live streaming components.");
    
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "close" }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    if (activePlayerRef.current) {
      activePlayerRef.current.interrupt();
      activePlayerRef.current = null;
    }

    setSessionState("idle");
    setSpeechState("idle");
    setUserVolume(0);
    setBotVolume(0);
  }, []);

  const connectLive = useCallback(() => {
    setErrorMessage(null);
    setSessionState("connecting");
    setSpeechState("idle");

    try {
      if (!audioCtxRef.current) {
        let contextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new contextClass({ sampleRate: 16000 });
      }

      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      // Initialize ChunkPlayer with volume metering callbacks
      activePlayerRef.current = new PCMChunkPlayer(audioCtx, 24000, (vol) => {
        setBotVolume(vol);
        if (vol > 0.05) {
          setSpeechState("speaking");
        } else {
          setSpeechState((prev) => (prev === "speaking" ? "idle" : prev));
        }
      });

      // Point WebSocket directly to the same host/context path
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: "setup",
          voiceName: voiceConfigRef.current.voiceName,
          systemInstruction: voiceConfigRef.current.systemInstruction
        }));
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);

          if (parsed.type === "status") {
            if (parsed.status === "ready") {
              setSessionState("active");
              setSpeechState("listening");
              startMicrophoneStream(audioCtx);
            } else if (parsed.status === "closed") {
              teardownLiveAll();
            } else if (parsed.status === "error") {
              setErrorMessage(parsed.message || "Failed to launch Gemini Live API session.");
              teardownLiveAll();
            }
          }

          if (parsed.audio) {
            if (activePlayerRef.current) {
              activePlayerRef.current.playChunk(parsed.audio);
            }
          }

          if (parsed.interrupted) {
            if (activePlayerRef.current) {
              activePlayerRef.current.interrupt();
            }
            setBotVolume(0);
            setSpeechState("listening");
          }

          // Handle live server-transmitted dialogue transcription
          if (parsed.userTranscript || parsed.assistantTranscript || parsed.text) {
            const incomingText = parsed.assistantTranscript || parsed.text || "";
            const userInputText = parsed.userTranscript || "";

            setMessages((prev) => {
              let updated = [...prev];

              if (userInputText) {
                const lastMsg = updated[updated.length - 1];
                if (!lastMsg || lastMsg.role !== "user" || lastMsg.text !== userInputText) {
                  updated.push({
                    id: Math.random().toString(),
                    role: "user",
                    text: userInputText,
                    transcriptType: "audio-transcribed",
                    timestamp: new Date()
                  });
                }
              }

              if (incomingText) {
                const lastMsg = updated[updated.length - 1];
                if (lastMsg && lastMsg.role === "model" && lastMsg.transcriptType === "live-text") {
                  // Append to active typing chunk
                  const hasPrefix = lastMsg.text.endsWith(incomingText);
                  if (!hasPrefix) {
                    lastMsg.text += incomingText;
                  }
                } else {
                  updated.push({
                    id: Math.random().toString(),
                    role: "model",
                    text: incomingText,
                    transcriptType: "live-text",
                    timestamp: new Date()
                  });
                }
              }

              return updated;
            });
          }

        } catch (msgErr) {
          console.error("Failed to parse websocket payload:", msgErr);
        }
      };

      ws.onerror = () => {
        setErrorMessage("Local WebSocket server connection failed. Ensure server is running.");
        teardownLiveAll();
      };

      ws.onclose = () => {
        teardownLiveAll();
      };

    } catch (err: any) {
      console.error("Connection live server initialization failed:", err);
      setErrorMessage(err.message || "Failed to make secure connection handshake.");
      teardownLiveAll();
    }
  }, [teardownLiveAll]);

  // 4. Walkie-Talkie REST Conversational Loop
  const startRecordingWalkie = () => {
    stopAllWalkiePlayback();
    setErrorMessage(null);
    setSpeechState("listening");
    recordedChunksRef.current = [];

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        micStreamRef.current = stream;

        let mediaRecorder: MediaRecorder;
        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        } catch (e) {
          try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/mp4" });
          } catch (err) {
            mediaRecorder = new MediaRecorder(stream);
          }
        }

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(recordedChunksRef.current, { type: mediaRecorder.mimeType });
          processWalkieTalkieMessage(audioBlob);
        };

        // Record chunks in tiny bits for volume analysis
        mediaRecorder.start(200);

        // Map audio frequency energy to user waveform for interaction feedback
        if (!audioCtxRef.current) {
          let contextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new contextClass({ sampleRate: 16000 });
        }
        
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkVolume = () => {
          if (speechStateRef.current !== "listening") return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          setUserVolume(Math.min(1.0, avg / 128));
          requestAnimationFrame(checkVolume);
        };

        checkVolume();
      })
      .catch((err) => {
        console.error("Mic record access blocked:", err);
        setErrorMessage("Microphone access failed. Confirm browser permissions.");
        setSpeechState("idle");
      });
  };

  const stopRecordingWalkie = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    setUserVolume(0);
  };

  const processWalkieTalkieMessage = async (audioBlob: Blob) => {
    setSpeechState("processing");
    setErrorMessage(null);

    try {
      // Encode recording block into raw base64 string
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            const base64String = (reader.result as string).split(",")[1];
            resolve(base64String);
          } else {
            reject(new Error("Unable to read audio data."));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      // Collect chat log context from UI logs (excluding stream blocks)
      const chatHistory = messages
        .filter((m) => m.transcriptType !== "live-text")
        .map((m) => ({
          role: m.role,
          text: m.text
        }));

      const response = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64Audio,
          voiceName: config.voiceName,
          history: chatHistory
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to process audio query.");
      }

      const { userVoiceTranscript, assistantResponseText, audioResponse } = await response.json();

      const userMsgId = Math.random().toString();
      const assistantMsgId = Math.random().toString();

      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          text: userVoiceTranscript || "[Microphone Input Voice Message]",
          transcriptType: "audio-transcribed",
          timestamp: new Date()
        },
        {
          id: assistantMsgId,
          role: "model",
          text: assistantResponseText,
          timestamp: new Date(),
          audioUrl: audioResponse
        }
      ]);

      if (audioResponse) {
        setSpeechState("speaking");

        if (!audioCtxRef.current) {
          let contextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new contextClass({ sampleRate: 16000 });
        }

        const audioCtx = audioCtxRef.current;
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        // Generate responsive wave activity for bot speaking visually
        let count = 0;
        const bounceInterval = setInterval(() => {
          if (speechStateRef.current !== "speaking") {
            clearInterval(bounceInterval);
            setBotVolume(0);
            return;
          }
          setBotVolume(0.12 + Math.sin(count * 0.5) * 0.08 * (Math.sin(count * 0.15) > 0 ? 1 : 0.3));
          count++;
        }, 80);

        stopAllWalkiePlayback();

        const source = await playPCMSequence(audioCtx, audioResponse, 24000);
        activeWalkieSourceRef.current = source;

        source.onended = () => {
          setSpeechState("idle");
          setBotVolume(0);
          if (activeWalkieSourceRef.current === source) {
            activeWalkieSourceRef.current = null;
          }
        };
      } else {
        setSpeechState("idle");
      }

    } catch (err: any) {
      console.error("Walkie-Talkie process failing:", err);
      setErrorMessage(err.message || "Failed to process audio or fetch voice response.");
      setSpeechState("idle");
    }
  };

  // 5. Playback historical Walkie-Talkie sound clips on request
  const playBackupAudio = async (base64Audio: string) => {
    stopAllWalkiePlayback();
    setSpeechState("speaking");

    try {
      if (!audioCtxRef.current) {
        let contextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new contextClass({ sampleRate: 16000 });
      }
      
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      let count = 0;
      const bounceInterval = setInterval(() => {
        if (speechStateRef.current !== "speaking") {
          clearInterval(bounceInterval);
          setBotVolume(0);
          return;
        }
        setBotVolume(0.12 + Math.sin(count * 0.5) * 0.08 * (Math.sin(count * 0.15) > 0 ? 1 : 0.3));
        count++;
      }, 80);

      const source = await playPCMSequence(audioCtx, base64Audio, 24000);
      activeWalkieSourceRef.current = source;

      source.onended = () => {
        setSpeechState("idle");
        setBotVolume(0);
        if (activeWalkieSourceRef.current === source) {
          activeWalkieSourceRef.current = null;
        }
      };
    } catch (e) {
      console.error("Playback failed for audio record:", e);
      setSpeechState("idle");
    }
  };

  return (
    <div className="min-h-screen bg-[#020202] text-neutral-100 flex flex-col justify-between selection:bg-blue-500/30 selection:text-white relative overflow-hidden" id="root-viewport">
      
      {/* Background Ambient Glows */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" id="ambient-glows">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-900/15 rounded-full blur-[130px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-900/15 rounded-full blur-[130px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-950/10 rounded-full blur-[150px]"></div>
      </div>

      {/* Upper navigation bar */}
      <header className="border-b border-white/10 bg-[#020202]/65 backdrop-blur-md px-6 py-4 sticky top-0 z-50 flex items-center justify-between" id="app-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center p-[2px] shadow-lg shadow-blue-500/10">
            <div className="w-full h-full bg-[#020202] rounded-full flex items-center justify-center">
              <div className="w-3.5 h-3.5 bg-white rounded-xs rotate-45"></div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-medium tracking-tight text-white/95 font-sans">
                Gemini Live Voice Chat
              </h1>
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/5 border border-white/10 text-blue-400 uppercase tracking-widest font-mono">
                Active Tier
              </span>
            </div>
            <p className="text-[10px] text-blue-400/70 font-mono mt-0.5 uppercase tracking-wider">
              PROMPT_STRL_01 • FLASH_3.x
            </p>
          </div>
        </div>

        {/* Decorative badge panel & User icon */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-semibold text-white/60 font-mono">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            LATENCY: &lt;1.2s
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-b from-zinc-700 to-zinc-900 flex items-center justify-center border border-white/10 font-bold text-xs shadow-xl text-white">
            JD
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start z-10 relative" id="main-content">
        
        {/* Left column: Controls & Visuals */}
        <section className="col-span-1 lg:col-span-7 space-y-6 flex flex-col h-full justify-between" id="section-controls">
          <div className="space-y-6">
            {/* Real-time flowing vocal waveforms */}
            <VisualWaveform
              isActive={sessionState === "active" || speechState !== "idle"}
              state={speechState}
              userVolume={userVolume}
              botVolume={botVolume}
            />

            {/* Principal Operations Deck */}
            <VoiceControlPad
              mode={mode}
              onModeChange={(newMode) => {
                stopAllWalkiePlayback();
                setMode(newMode);
                setErrorMessage(null);
              }}
              sessionState={sessionState}
              speechState={speechState}
              onStartLive={connectLive}
              onStopLive={teardownLiveAll}
              onStartRecordingWalkie={startRecordingWalkie}
              onStopRecordingWalkie={stopRecordingWalkie}
              isMuted={isMuted}
              onToggleMute={() => setIsMuted((prev) => !prev)}
              errorMessage={errorMessage}
            />
          </div>
        </section>

        {/* Right column: Transcripts & Personality settings */}
        <section className="col-span-1 lg:col-span-5 space-y-6 h-full flex flex-col justify-between" id="section-transcribe">
          <div className="space-y-6">
            {/* Conversation Dialogues */}
            <ConversationLogs
              messages={messages}
              mode={mode}
              onClear={() => setMessages([])}
              onPlayBackupAudio={playBackupAudio}
            />

            {/* Vocal Config setup */}
            <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10" id="card-config-setup">
              <h4 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4 flex items-center gap-1.5 font-mono">
                <Settings className="w-3.5 h-3.5 text-blue-400 animate-spin-slow" />
                Vocal Interface Customizer
              </h4>
              <ConfigSetup
                config={config}
                onUpdateConfig={setConfig}
                apiStatus={apiStatus}
                onCheckApi={checkApiConfig}
              />
            </div>
          </div>
        </section>

      </main>

      {/* Humble Footer */}
      <footer className="border-t border-white/10 bg-white/[0.01] py-4 px-6 text-center text-[10px] text-white/30 font-mono tracking-wide z-10 relative flex flex-wrap justify-between items-center gap-3" id="app-footer">
        <div className="mx-auto sm:mx-0 flex items-center gap-2 justify-center sm:justify-start">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${sessionState === "active" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-neutral-500"} inline-block`}></span>
            {sessionState === "active" ? "Real-time Audio Stream Active" : "Stream Idle"}
          </span>
        </div>
        <span className="mx-auto sm:mx-0">POWERED BY GEMINI PROMPT SERVICES • COHESIVE SECURE PORTS</span>
        <span className="mx-auto sm:mx-0">REGISTRATION: ACTIVE TIER</span>
      </footer>
    </div>
  );
}
