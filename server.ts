import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import dns from "dns";

// Fix Node.js DNS resolution preference for localhost (can prevent WebSocket/fetch lookup lag)
dns.setDefaultResultOrder && dns.setDefaultResultOrder("ipv4first");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = 3000;

// Set permissive CORS headers to allow connection from GitHub Pages or external hosts
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Increase request body limits to handle audio payload base64 transfers safely
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Helper to check for API key and get Gemini Client safely without crashing on startup
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is not configured or still has placeholder value. Please set your active API key in the 'Settings > Secrets' panel inside Google AI Studio."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// 1. Health and Configuration Check Endpoint
app.get("/api/config-check", (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isSetup = !!apiKey && apiKey !== "MY_GEMINI_API_KEY";
  res.json({
    status: isSetup ? "ready" : "needs_key",
    message: isSetup 
      ? "Gemini API key is configured successfully." 
      : "Gemini API Key is missing. Please configuration your key in the secrets panel.",
  });
});

// 2. Walkie-Talkie Multimodal Voice Chat (Extremely Robust, Fallback Mode)
// Accepts audio (base64 string of a WAV/MP3 recording) and previous dialog logs
app.post("/api/voice-chat", async (req, res) => {
  try {
    const { audio, voiceName, history } = req.body;
    const ai = getGeminiClient();

    let textPrompt = "Explain to me what we are talking about.";
    let contents: any[] = [];

    // Reconstruct conversation layers
    if (history && Array.isArray(history)) {
      history.forEach((msg: any) => {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }],
        });
      });
    }

    // Attach multimodal audio if user recorded a message
    if (audio) {
      const audioPart = {
        inlineData: {
          mimeType: "audio/webm", // MediaRecorder default is usually webm
          data: audio,
        },
      };

      // We send the audio part as the final user message
      contents.push({
        role: "user",
        parts: [
          audioPart,
          {
            text: "Listen carefully to this audio file. Answer my prompt in conversational voice style, keeping the response relatively concise (1-3 sentences) suitable for audio playback. Answer matching my language.",
          },
        ],
      });
    } else {
      // Direct text fallback
      return res.status(400).json({ error: "Missing audio payload for voice-chat" });
    }

    // Call Gemini 3.5 Flash for transcription & natural dialogue response
    // We request Structured JSON response so we get the exact transcript of user voice and answer
    const structuredResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: "You are a friendly, fast-responding voice companion. Listen to the user's spoken audio and provide a direct, concise, conversational reply. Avoid fancy markdown formats, bullet points, or complex formulas. Keep responses to a maximum of 3 elegant sentences.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            userVoiceTranscript: {
              type: Type.STRING,
              description: "Accurate literal transcription of the user's audio question or prompt. Keep it word-for-word if possible.",
            },
            assistantResponseText: {
              type: Type.STRING,
              description: "Your voice-suited response to the user's prompt.",
            },
          },
          required: ["userVoiceTranscript", "assistantResponseText"],
        },
      },
    });

    const bodyText = structuredResponse.text;
    if (!bodyText) {
      throw new Error("Empty body reply received from Gemini.");
    }

    const { userVoiceTranscript, assistantResponseText } = JSON.parse(bodyText);

    // Call Gemini Text to Speech (TTS) to turn the reply text into natural spoken sound
    const preferredVoice = voiceName || "Zephyr"; // Puck, Charon, Kore, Fenrir, Zephyr
    let base64AudioOut = "";

    try {
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: assistantResponseText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: preferredVoice },
            },
          },
        },
      });

      const audioPart = ttsResponse.candidates?.[0]?.content?.parts?.[0];
      if (audioPart && audioPart.inlineData?.data) {
        base64AudioOut = audioPart.inlineData.data;
      }
    } catch (ttsErr: any) {
      console.error("TTS generation error:", ttsErr);
      // We still fall back to standard text-only return if TTS fails
    }

    res.json({
      userVoiceTranscript,
      assistantResponseText,
      audioResponse: base64AudioOut,
    });
  } catch (err: any) {
    console.error("Error in Walkie Talkie Voice API:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// 3. Setup WebSocket Bridge for Gemini Live API
// The clients open a WebSocket at "/api/live" and establish full duplex conversation
wss.on("connection", async (clientWs: WebSocket) => {
  console.log("Client connected to local WebSocket live-bridge.");
  let liveSession: any = null;

  clientWs.on("message", async (messageBuffer) => {
    try {
      const parsed = JSON.parse(messageBuffer.toString());

      // If client requests connection setup
      if (parsed.type === "setup") {
        const { voiceName, systemInstruction } = parsed;
        const preferredVoice = voiceName || "Zephyr";
        console.log("Setting up Gemini Live Session with voice:", preferredVoice);

        try {
          const ai = getGeminiClient();

          liveSession = await ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            config: {
              responseModalities: [Modality.AUDIO], // Crucial for speech output
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: preferredVoice },
                },
              },
              systemInstruction: systemInstruction || "You are a supportive, high-fidelity real-time voice buddy. Keep answers concise, highly human, and prompt. Avoid text details, respond only via speech.",
              // Request both input and output transcripts for standard logging
              outputAudioTranscription: {},
              inputAudioTranscription: {},
            },
            callbacks: {
              onmessage: (msg: LiveServerMessage) => {
                const payload: any = { type: "server" };

                // Extract output audio chunks
                const parts = msg.serverContent?.modelTurn?.parts;
                if (parts) {
                  for (const part of parts) {
                    if (part.inlineData?.data) {
                      payload.audio = part.inlineData.data;
                    }
                    if (part.text) {
                      payload.text = part.text;
                    }
                  }
                }

                // Extracted user input transcription
                const userTranscript = msg.serverContent?.inputTranscription?.text;
                if (userTranscript) {
                  payload.userTranscript = userTranscript;
                }

                // Extracted assistant transcription
                const assistantTranscript = msg.serverContent?.outputTranscription?.text;
                if (assistantTranscript) {
                  payload.assistantTranscript = assistantTranscript;
                }

                // Interrupted
                if (msg.serverContent?.interrupted) {
                  payload.interrupted = true;
                }

                // Send back parsed wrapper
                clientWs.send(JSON.stringify(payload));
              },
              onclose: () => {
                console.log("Gemini Live server closed the connection.");
                clientWs.send(JSON.stringify({ type: "status", status: "closed", message: "Gemini session disconnected." }));
              },
              onerror: (e: any) => {
                console.error("Gemini Live session error:", e);
                clientWs.send(JSON.stringify({ type: "error", message: e.message || "Gemini Live session error" }));
              }
            }
          });

          clientWs.send(JSON.stringify({ type: "status", status: "ready" }));
        } catch (connectionErr: any) {
          console.error("Failed to connect to Gemini Live Endpoint:", connectionErr);
          clientWs.send(JSON.stringify({ type: "status", status: "error", message: connectionErr.message || "Failed to establish Gemini live session." }));
        }
        return;
      }

      // If client sends live audio frames
      if (parsed.audio && liveSession) {
        liveSession.sendRealtimeInput({
          audio: {
            data: parsed.audio,
            mimeType: "audio/pcm;rate=16000",
          }
        });
      }

      // If client requests immediate stop or manual stream end
      if (parsed.type === "close" && liveSession) {
        await liveSession.close();
        liveSession = null;
        clientWs.send(JSON.stringify({ type: "status", status: "closed" }));
      }

    } catch (parseErr: any) {
      console.error("Local WebSocket message processing error:", parseErr);
      clientWs.send(JSON.stringify({ type: "error", message: "WebSocket Message Processing Error" }));
    }
  });

  clientWs.on("close", async () => {
    console.log("Client socket disconnected. Cleaning up live session.");
    if (liveSession) {
      try {
        await liveSession.close();
      } catch (e) {
        // ignore errors on close
      }
      liveSession = null;
    }
  });
});

// Bind upgrade events on server
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;

  if (pathname === "/api/live" || pathname === "/live") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// 4. Vite Environment Setup
async function launchApp() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[STAGED REST + LIVE BRIDGE] server running on http://0.0.0.0:${PORT}`);
  });
}

launchApp();
