var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_http = __toESM(require("http"), 1);
var import_ws = require("ws");
var import_genai = require("@google/genai");
var import_dns = __toESM(require("dns"), 1);
import_dns.default.setDefaultResultOrder && import_dns.default.setDefaultResultOrder("ipv4first");
var app = (0, import_express.default)();
var server = import_http.default.createServer(app);
var wss = new import_ws.WebSocketServer({ noServer: true });
var PORT = 3e3;
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is not configured or still has placeholder value. Please set your active API key in the 'Settings > Secrets' panel inside Google AI Studio."
    );
  }
  return new import_genai.GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
app.get("/api/config-check", (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isSetup = !!apiKey && apiKey !== "MY_GEMINI_API_KEY";
  res.json({
    status: isSetup ? "ready" : "needs_key",
    message: isSetup ? "Gemini API key is configured successfully." : "Gemini API Key is missing. Please configuration your key in the secrets panel."
  });
});
app.post("/api/voice-chat", async (req, res) => {
  try {
    const { audio, voiceName, history } = req.body;
    const ai = getGeminiClient();
    let textPrompt = "Explain to me what we are talking about.";
    let contents = [];
    if (history && Array.isArray(history)) {
      history.forEach((msg) => {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }]
        });
      });
    }
    if (audio) {
      const audioPart = {
        inlineData: {
          mimeType: "audio/webm",
          // MediaRecorder default is usually webm
          data: audio
        }
      };
      contents.push({
        role: "user",
        parts: [
          audioPart,
          {
            text: "Listen carefully to this audio file. Answer my prompt in conversational voice style, keeping the response relatively concise (1-3 sentences) suitable for audio playback. Answer matching my language."
          }
        ]
      });
    } else {
      return res.status(400).json({ error: "Missing audio payload for voice-chat" });
    }
    const structuredResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: "You are a friendly, fast-responding voice companion. Listen to the user's spoken audio and provide a direct, concise, conversational reply. Avoid fancy markdown formats, bullet points, or complex formulas. Keep responses to a maximum of 3 elegant sentences.",
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            userVoiceTranscript: {
              type: import_genai.Type.STRING,
              description: "Accurate literal transcription of the user's audio question or prompt. Keep it word-for-word if possible."
            },
            assistantResponseText: {
              type: import_genai.Type.STRING,
              description: "Your voice-suited response to the user's prompt."
            }
          },
          required: ["userVoiceTranscript", "assistantResponseText"]
        }
      }
    });
    const bodyText = structuredResponse.text;
    if (!bodyText) {
      throw new Error("Empty body reply received from Gemini.");
    }
    const { userVoiceTranscript, assistantResponseText } = JSON.parse(bodyText);
    const preferredVoice = voiceName || "Zephyr";
    let base64AudioOut = "";
    try {
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: assistantResponseText }] }],
        config: {
          responseModalities: [import_genai.Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: preferredVoice }
            }
          }
        }
      });
      const audioPart = ttsResponse.candidates?.[0]?.content?.parts?.[0];
      if (audioPart && audioPart.inlineData?.data) {
        base64AudioOut = audioPart.inlineData.data;
      }
    } catch (ttsErr) {
      console.error("TTS generation error:", ttsErr);
    }
    res.json({
      userVoiceTranscript,
      assistantResponseText,
      audioResponse: base64AudioOut
    });
  } catch (err) {
    console.error("Error in Walkie Talkie Voice API:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
wss.on("connection", async (clientWs) => {
  console.log("Client connected to local WebSocket live-bridge.");
  let liveSession = null;
  clientWs.on("message", async (messageBuffer) => {
    try {
      const parsed = JSON.parse(messageBuffer.toString());
      if (parsed.type === "setup") {
        const { voiceName, systemInstruction } = parsed;
        const preferredVoice = voiceName || "Zephyr";
        console.log("Setting up Gemini Live Session with voice:", preferredVoice);
        try {
          const ai = getGeminiClient();
          liveSession = await ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            config: {
              responseModalities: [import_genai.Modality.AUDIO],
              // Crucial for speech output
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: preferredVoice }
                }
              },
              systemInstruction: systemInstruction || "You are a supportive, high-fidelity real-time voice buddy. Keep answers concise, highly human, and prompt. Avoid text details, respond only via speech.",
              // Request both input and output transcripts for standard logging
              outputAudioTranscription: {},
              inputAudioTranscription: {}
            },
            callbacks: {
              onmessage: (msg) => {
                const payload = { type: "server" };
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
                const userTranscript = msg.serverContent?.inputTranscription?.text;
                if (userTranscript) {
                  payload.userTranscript = userTranscript;
                }
                const assistantTranscript = msg.serverContent?.outputTranscription?.text;
                if (assistantTranscript) {
                  payload.assistantTranscript = assistantTranscript;
                }
                if (msg.serverContent?.interrupted) {
                  payload.interrupted = true;
                }
                clientWs.send(JSON.stringify(payload));
              },
              onclose: () => {
                console.log("Gemini Live server closed the connection.");
                clientWs.send(JSON.stringify({ type: "status", status: "closed", message: "Gemini session disconnected." }));
              },
              onerror: (e) => {
                console.error("Gemini Live session error:", e);
                clientWs.send(JSON.stringify({ type: "error", message: e.message || "Gemini Live session error" }));
              }
            }
          });
          clientWs.send(JSON.stringify({ type: "status", status: "ready" }));
        } catch (connectionErr) {
          console.error("Failed to connect to Gemini Live Endpoint:", connectionErr);
          clientWs.send(JSON.stringify({ type: "status", status: "error", message: connectionErr.message || "Failed to establish Gemini live session." }));
        }
        return;
      }
      if (parsed.audio && liveSession) {
        liveSession.sendRealtimeInput({
          audio: {
            data: parsed.audio,
            mimeType: "audio/pcm;rate=16000"
          }
        });
      }
      if (parsed.type === "close" && liveSession) {
        await liveSession.close();
        liveSession = null;
        clientWs.send(JSON.stringify({ type: "status", status: "closed" }));
      }
    } catch (parseErr) {
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
      }
      liveSession = null;
    }
  });
});
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
async function launchApp() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[STAGED REST + LIVE BRIDGE] server running on http://0.0.0.0:${PORT}`);
  });
}
launchApp();
//# sourceMappingURL=server.cjs.map
