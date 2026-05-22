/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { ChatMessage, AppMode } from "../types";
import { MessageSquare, Bot, User, Trash2, Volume2, Music, Check, Headphones } from "lucide-react";

interface ConversationLogsProps {
  messages: ChatMessage[];
  mode: AppMode;
  onClear: () => void;
  onPlayBackupAudio?: (base64Audio: string) => void;
}

export function ConversationLogs({ messages, mode, onClear, onPlayBackupAudio }: ConversationLogsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[320px] rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 overflow-hidden shadow-2xl">
      {/* Log Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/[0.01] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-white/80 uppercase tracking-widest font-sans">
            Transcription Logs ({mode === "live" ? "Live Stream" : "Walkie-Talkie"})
          </span>
        </div>
        
        {messages.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors font-semibold"
            title="Clear Chat Logs"
            id="btn-clear-logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Log Body */}
      <div 
         ref={scrollRef}
         className="flex-1 p-4 overflow-y-auto space-y-3.5 custom-scrollbar bg-black/10"
         id="conversations-log-list"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/30">
            <Volume2 className="w-8 h-8 opacity-40 mb-2.5 animate-pulse text-indigo-400" />
            <p className="text-xs font-medium text-white/60">No voice events recorded yet</p>
            <p className="text-[10px] opacity-70 max-w-[240px] mt-1 leading-relaxed font-mono">
              Start chatting or toggle on Live mode to begin recording text and voice transcripts.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-300 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl ${
                  isUser 
                    ? "bg-blue-650/10 border border-blue-500/20 text-blue-100 rounded-tr-none shadow-[0_0_15px_rgba(59,130,246,0.05)]" 
                    : "bg-white/[0.04] border border-white/10 text-white/90 rounded-tl-none"
                }`}>
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isUser ? "text-blue-400" : "text-purple-400"}`}>
                      {isUser ? "You" : "Gemini"}
                    </span>
                    <span className="text-[9px] text-white/30 font-mono">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-white/80 whitespace-pre-wrap select-text selection:bg-blue-500/20 leading-relaxed font-sans mt-1 text-[12px]">
                    {msg.text}
                  </p>

                  {/* Attachment playbacks for Walkie-Talkie audio replay */}
                  {msg.audioUrl && (
                    <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1.5">
                      <button
                        onClick={() => onPlayBackupAudio && onPlayBackupAudio(msg.audioUrl!)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-[10px] font-semibold transition-all mt-0.5 cursor-pointer"
                        id={`btn-replay-audio-${msg.id}`}
                      >
                        <Headphones className="w-3 h-3 text-blue-400" />
                        Replay Vocal Response
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center shrink-0 text-blue-300 mt-0.5 shadow-sm">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
