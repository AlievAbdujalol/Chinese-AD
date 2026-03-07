import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      const serviceAccount = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString('utf-8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin initialized successfully.");
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is missing. Firebase Admin not initialized.");
    }
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
  }
}

const db = admin.firestore ? admin.firestore() : null;

// Helper to verify Firebase token
const verifyToken = async (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    throw new Error('Unauthorized');
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Encryption Setup
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_change_me_in_prod'; // 32 chars
const IV_LENGTH = 16; // For AES, this is always 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Global Error Handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    // Request Logging Middleware
    app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
      next();
    });

  // Body parser
  app.use(express.json({ limit: '10mb' })); // Increase limit for images

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // --- API Key Management Routes ---

  // GET /api/keys - Get masked keys
  app.get("/api/keys", async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ error: "Database unavailable" });
      }

      let decodedToken;
      try {
        decodedToken = await verifyToken(req);
      } catch (err: any) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = decodedToken.uid;
      const snapshot = await db.collection('user_api_keys').where('user_id', '==', userId).get();
      
      const keys = snapshot.docs.reduce((acc: any, doc) => {
        const data = doc.data();
        acc[data.provider] = data.key_hint;
        return acc;
      }, {});

      res.json(keys);
    } catch (error: any) {
      console.error("Get Key Error:", error);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  // POST /api/keys - Save/Update key
  app.post("/api/keys", async (req, res) => {
    try {
      const { apiKey, provider = 'gemini' } = req.body;
      
      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ error: "Invalid API Key" });
      }

      if (!['gemini', 'deepseek', 'openai', 'anthropic', 'leonardo'].includes(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
      }

      // 1. Validate Format & Test Key
      try {
        if (provider === 'gemini') {
          if (!apiKey.startsWith('AIza')) {
             // Warn?
          }
          const ai = new GoogleGenAI({ apiKey });
          await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: { parts: [{ text: "Test" }] }
          });
        } else if (provider === 'deepseek') {
          if (!apiKey.startsWith('sk-')) {
            // DeepSeek keys usually start with sk-
          }
          const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: "deepseek-chat",
              messages: [{ role: "user", content: "Test" }],
              max_tokens: 5
            })
          });
          if (!response.ok) {
            throw new Error(`DeepSeek API Error: ${response.status}`);
          }
        } else if (provider === 'openai') {
          const response = await fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${apiKey}`
            }
          });
          if (!response.ok) {
            throw new Error(`OpenAI API Error: ${response.status}`);
          }
        } else if (provider === 'anthropic') {
          const response = await fetch("https://api.anthropic.com/v1/models", {
            method: "GET",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01"
            }
          });
          if (!response.ok) {
            throw new Error(`Anthropic API Error: ${response.status}`);
          }
        } else if (provider === 'leonardo') {
          const response = await fetch("https://cloud.leonardo.ai/api/rest/v1/me", {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Accept": "application/json"
            }
          });
          if (!response.ok) {
            throw new Error(`Leonardo API Error: ${response.status}`);
          }
        }
      } catch (e: any) {
        console.error("Key Validation Failed:", e.message);
        return res.status(400).json({ error: `Invalid ${provider} API Key: Test request failed.` });
      }

      // 2. Encrypt
      const encryptedKey = encrypt(apiKey);
      const keyHint = '••••••••••' + apiKey.slice(-4);

      // 3. Save to DB
      if (!db) {
        return res.status(503).json({ error: "Database unavailable" });
      }

      let decodedToken;
      try {
        decodedToken = await verifyToken(req);
      } catch (err: any) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = decodedToken.uid;
      const docId = `${userId}_${provider}`;

      await db.collection('user_api_keys').doc(docId).set({
        user_id: userId,
        provider: provider,
        encrypted_key: encryptedKey,
        key_hint: keyHint,
        updated_at: new Date().toISOString()
      }, { merge: true });

      res.json({ success: true, provider, key_hint: keyHint });
    } catch (error: any) {
      console.error("Save Key Error:", error);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  // DELETE /api/keys - Delete key
  app.delete("/api/keys", async (req, res) => {
    try {
      const { provider = 'gemini' } = req.body;
      
      if (!db) {
        return res.status(503).json({ error: "Database unavailable" });
      }

      let decodedToken;
      try {
        decodedToken = await verifyToken(req);
      } catch (err: any) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = decodedToken.uid;
      const docId = `${userId}_${provider}`;

      await db.collection('user_api_keys').doc(docId).delete();

      res.json({ success: true, provider });
    } catch (error: any) {
      console.error("Delete Key Error:", error);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  // --- Gemini Proxy Route ---
  app.get("/api/gemini/models", async (req, res) => {
    try {
      let apiKey = process.env.GEMINI_API_KEY;

      if (req.headers['x-api-key'] && typeof req.headers['x-api-key'] === 'string') {
        apiKey = req.headers['x-api-key'];
      } else {
        try {
          if (db) {
            const decodedToken = await verifyToken(req);
            const docId = `${decodedToken.uid}_gemini`;
            const doc = await db.collection('user_api_keys').doc(docId).get();
            if (doc.exists) {
              const data = doc.data();
              if (data && data.encrypted_key) {
                try {
                  apiKey = decrypt(data.encrypted_key);
                } catch (e) {}
              }
            }
          }
        } catch (err) {
          console.warn("Firebase Auth failed, falling back to system key or headers");
        }
      }

      if (!apiKey) {
        return res.status(500).json({ error: "No API Key available" });
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API Error:", errorText);
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Gemini Models Proxy Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errorMessage || "Failed to fetch models" });
    }
  });

  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { model, contents, config } = req.body;
      
      // 1. Try to get user key
      let apiKey = process.env.GEMINI_API_KEY; // Default to system key
      let usingUserKey = false;

      // Check header first (localStorage fallback)
      if (req.headers['x-api-key'] && typeof req.headers['x-api-key'] === 'string') {
        apiKey = req.headers['x-api-key'];
        usingUserKey = true;
      } else {
        // Check DB
        try {
          if (db) {
            const decodedToken = await verifyToken(req);
            const docId = `${decodedToken.uid}_gemini`;
            const doc = await db.collection('user_api_keys').doc(docId).get();
            if (doc.exists) {
              const data = doc.data();
              if (data && data.encrypted_key) {
                try {
                  apiKey = decrypt(data.encrypted_key);
                  usingUserKey = true;
                } catch (e) {
                  console.error("Decryption failed, falling back to system key");
                }
              }
            }
          }
        } catch (err) {
          console.warn("Firebase Auth failed, falling back to system key or headers");
        }
      }

      if (!apiKey) {
        return res.status(500).json({ error: "No API Key available" });
      }


      // 2. Call Gemini
      // Note: The @google/genai SDK on server might behave slightly differently than browser
      // But the API is the same.
      // However, we need to handle the response streaming or simple response.
      // For now, let's assume simple response (generateContent).
      // If streaming is needed, we'd need to handle that.
      // The current app uses `generateContent` (non-streaming) mostly.
      
      // Wait, the SDK `GoogleGenAI` constructor takes `apiKey`.
      // But `ai.models.generateContent` is what we call.
      // We need to instantiate `GoogleGenAI` with the key.
      
      // IMPORTANT: The SDK import might be different for Node.js vs Browser?
      // No, @google/genai is universal.
      
      // However, `ai.models` is not the standard SDK usage.
      // Standard is: const genAI = new GoogleGenerativeAI(apiKey); const model = genAI.getGenerativeModel({ model: ... });
      // But the user's code uses `import { GoogleGenAI } from "@google/genai"; const ai = new GoogleGenAI({ apiKey }); ai.models.generateContent(...)`
      // This seems to be the *new* SDK (v0.1.0+ or similar).
      // Let's stick to what the user's code uses.
      
      const ai = new GoogleGenAI({ apiKey });
      
      // We need to map the request body to what the SDK expects.
      // `contents` in SDK can be string or array of parts.
      // `config` maps to `generationConfig` etc.
      
      // The SDK `generateContent` signature: (request: GenerateContentRequest)
      // request has `model`, `contents`, `config`.
      
      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: config
      });

      // 3. Return response
      // We return the whole response object.
      // The client expects `response.text` etc.
      // The SDK response object has `text` getter. We need to make sure it's serialized.
      // `JSON.stringify(response)` might not include the text if it's a getter.
      // We should extract what's needed.
      
      const result = {
        candidates: response.candidates,
        usageMetadata: response.usageMetadata,
        text: response.text, // Access the getter to ensure it's in the JSON
        functionCalls: response.functionCalls
      };
      
      res.json(result);

    } catch (error: any) {
      console.error("Gemini Proxy Error:", error);
      res.status(500).json({ 
        error: error.message || "Gemini API Error",
        details: error.toString()
      });
    }
  });

  // DeepSeek Proxy Route
  app.post("/api/deepseek", async (req, res) => {
    try {
      // 1. Try to get user key
      let apiKey = process.env.DEEPSEEK_API_KEY; // Default to system key
      
      try {
        if (db) {
          const decodedToken = await verifyToken(req);
          const docId = `${decodedToken.uid}_deepseek`;
          const doc = await db.collection('user_api_keys').doc(docId).get();
          if (doc.exists) {
            const data = doc.data();
            if (data && data.encrypted_key) {
              try {
                apiKey = decrypt(data.encrypted_key);
              } catch (e) {
                console.error("Decryption failed for DeepSeek key");
              }
            }
          }
        }
      } catch (err) {
        console.warn("Firebase Auth failed, falling back to system key");
      }

      if (!apiKey) {
        return res.status(500).json({ error: "No DeepSeek API Key available" });
      }

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).send(err);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("DeepSeek Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // OpenAI Proxy Route
  app.post("/api/openai", async (req, res) => {
    try {
      let apiKey = process.env.OPENAI_API_KEY;
      
      try {
        if (db) {
          const decodedToken = await verifyToken(req);
          const docId = `${decodedToken.uid}_openai`;
          const doc = await db.collection('user_api_keys').doc(docId).get();
          if (doc.exists) {
            const data = doc.data();
            if (data && data.encrypted_key) {
              try {
                apiKey = decrypt(data.encrypted_key);
              } catch (e) {
                console.error("Decryption failed for OpenAI key");
              }
            }
          }
        }
      } catch (err) {
        console.warn("Firebase Auth failed, falling back to system key");
      }

      if (!apiKey) {
        return res.status(500).json({ error: "No OpenAI API Key available" });
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).send(err);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("OpenAI Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Anthropic Proxy Route
  app.post("/api/anthropic", async (req, res) => {
    try {
      let apiKey = process.env.ANTHROPIC_API_KEY;
      
      try {
        if (db) {
          const decodedToken = await verifyToken(req);
          const docId = `${decodedToken.uid}_anthropic`;
          const doc = await db.collection('user_api_keys').doc(docId).get();
          if (doc.exists) {
            const data = doc.data();
            if (data && data.encrypted_key) {
              try {
                apiKey = decrypt(data.encrypted_key);
              } catch (e) {
                console.error("Decryption failed for Anthropic key");
              }
            }
          }
        }
      } catch (err) {
        console.warn("Firebase Auth failed, falling back to system key");
      }

      if (!apiKey) {
        return res.status(500).json({ error: "No Anthropic API Key available" });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).send(err);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Anthropic Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Leonardo API Proxy Route
  app.post("/api/leonardo/generations", async (req, res) => {
    try {
      let apiKey = req.headers.authorization || process.env.LEONARDO_API_KEY;
      
      try {
        if (db) {
          const decodedToken = await verifyToken(req);
          const docId = `${decodedToken.uid}_leonardo`;
          const doc = await db.collection('user_api_keys').doc(docId).get();
          if (doc.exists) {
            const data = doc.data();
            if (data && data.encrypted_key) {
              try {
                apiKey = `Bearer ${decrypt(data.encrypted_key)}`;
              } catch (e) {
                console.error("Decryption failed for Leonardo key");
              }
            }
          }
        }
      } catch (err) {
        console.warn("Firebase Auth failed, falling back to system key");
      }

      if (!apiKey) {
        return res.status(401).json({ error: "Missing Leonardo API Key" });
      }

      const response = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": apiKey,
          "Accept": "application/json"
        },
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).send(err);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Leonardo Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.get("/api/leonardo/generations/:id", async (req, res) => {
    try {
      let apiKey = req.headers.authorization || process.env.LEONARDO_API_KEY;
      
      try {
        if (db) {
          const decodedToken = await verifyToken(req);
          const docId = `${decodedToken.uid}_leonardo`;
          const doc = await db.collection('user_api_keys').doc(docId).get();
          if (doc.exists) {
            const data = doc.data();
            if (data && data.encrypted_key) {
              try {
                apiKey = `Bearer ${decrypt(data.encrypted_key)}`;
              } catch (e) {
                console.error("Decryption failed for Leonardo key");
              }
            }
          }
        }
      } catch (err) {
        console.warn("Firebase Auth failed, falling back to system key");
      }

      if (!apiKey) {
        return res.status(401).json({ error: "Missing Leonardo API Key" });
      }

      const response = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${req.params.id}`, {
        method: "GET",
        headers: {
          "Authorization": apiKey,
          "Accept": "application/json"
        },
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).send(err);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Leonardo Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- Catch-all API Route ---
  // This prevents API requests from falling through to Vite (which returns HTML)
  app.use("/api", (req, res) => {
    console.warn(`API 404: ${req.method} ${req.url}`);
    res.status(404).json({ error: "API endpoint not found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving (if needed, but Vercel handles this differently)
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  } catch (err) {
    console.error("Failed to initialize server:", err);
    process.exit(1);
  }
}

startServer().catch(err => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
