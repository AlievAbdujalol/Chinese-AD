import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

async function startServer() {
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

  // Supabase Client Helper
  const getSupabase = (req: express.Request) => {
    const authHeader = req.headers.authorization;
    return createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader! } } }
    );
  };

  // --- Migration Helper ---
  async function runMigration() {
    if (!process.env.DATABASE_URL) {
      console.warn("Skipping migration: DATABASE_URL not set");
      return false;
    }
    
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      const sqlPath = path.join(__dirname, 'supabase_schema.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sql);
        console.log("Migration executed successfully.");
        return true;
      }
      return false;
    } catch (err) {
      console.error("Migration failed:", err);
      return false;
    } finally {
      await client.end().catch(() => {});
    }
  }

  // --- Auto-Migration on Start ---
  if (process.env.DATABASE_URL) {
    console.log("DATABASE_URL found, attempting auto-migration...");
    runMigration().catch(console.error);
  } else {
    console.warn("DATABASE_URL not set. Skipping auto-migration. Please set DATABASE_URL to enable database features.");
  }

  // --- API Key Management Routes ---

  // POST /api/migrate - Run database migration
  app.post("/api/migrate", async (req, res) => {
    try {
      const success = await runMigration();
      if (success) {
        res.json({ success: true, message: "Migration completed successfully" });
      } else {
        res.status(500).json({ 
          error: "Migration failed", 
          details: process.env.DATABASE_URL ? "Check server logs" : "DATABASE_URL not set" 
        });
      }
    } catch (error: any) {
      console.error("Migration Setup Error:", error);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  // GET /api/keys - Get masked keys
  app.get("/api/keys", async (req, res) => {
    try {
      const supabase = getSupabase(req);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      let { data, error } = await supabase
        .from('user_api_keys')
        .select('provider, key_hint')
        .eq('user_id', user.id);

      // Handle missing table by attempting migration
      if (error && (error.code === '42P01' || error.code === 'PGRST205')) {
        console.warn("Table missing, attempting auto-migration...");
        const migrationSuccess = await runMigration();
        
        if (migrationSuccess) {
          // Retry fetch
          const retry = await supabase
            .from('user_api_keys')
            .select('provider, key_hint')
            .eq('user_id', user.id);
            
          data = retry.data;
          error = retry.error;
        } else {
          // If migration fails (e.g. no DB URL), return 503 so client triggers fallback
          console.warn("Database not configured (no URL). Returning 503 to trigger client-side local storage.");
          return res.status(503).json({ 
            error: "Database unavailable", 
            details: "DATABASE_URL is not set. Using local storage mode." 
          });
        }
      }

      if (error) {
        console.error("DB Error Code:", error.code);
        console.error("DB Error Message:", error.message);
        console.error("DB Error Details:", error.details);
        return res.status(500).json({ error: "Database error", details: error.message });
      }

      // Transform to object: { gemini: 'hint', deepseek: 'hint' }
      const keys = (data || []).reduce((acc: any, curr: any) => {
        acc[curr.provider] = curr.key_hint;
        return acc;
      }, {});

      res.json(keys);
    } catch (error) {
      console.error("Get Key Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // POST /api/keys - Save/Update key
  app.post("/api/keys", async (req, res) => {
    try {
      const { apiKey, provider = 'gemini' } = req.body;
      
      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ error: "Invalid API Key" });
      }

      if (!['gemini', 'deepseek'].includes(provider)) {
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
        }
      } catch (e: any) {
        console.error("Key Validation Failed:", e.message);
        return res.status(400).json({ error: `Invalid ${provider} API Key: Test request failed.` });
      }

      // 2. Encrypt
      const encryptedKey = encrypt(apiKey);
      const keyHint = '••••••••••' + apiKey.slice(-4);

      // 3. Save to DB
      const supabase = getSupabase(req);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      let { error } = await supabase
        .from('user_api_keys')
        .upsert({ 
          user_id: user.id, 
          provider: provider,
          encrypted_key: encryptedKey,
          key_hint: keyHint,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, provider' });

      // Handle missing table on save
      if (error && (error.code === '42P01' || error.code === 'PGRST205')) {
         console.warn("Table missing on save, attempting auto-migration...");
         const migrationSuccess = await runMigration();
         if (migrationSuccess) {
            const retry = await supabase
              .from('user_api_keys')
              .upsert({ 
                user_id: user.id, 
                provider: provider,
                encrypted_key: encryptedKey,
                key_hint: keyHint,
                updated_at: new Date().toISOString()
              }, { onConflict: 'user_id, provider' });
            error = retry.error;
         }
      }

      if (error) {
        console.error("DB Save Error:", error);
        return res.status(500).json({ error: "Failed to save key" });
      }

      res.json({ success: true, provider, key_hint: keyHint });
    } catch (error) {
      console.error("Save Key Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // DELETE /api/keys - Delete key
  app.delete("/api/keys", async (req, res) => {
    try {
      const { provider = 'gemini' } = req.body; // Or query param? Let's support body for consistency
      
      const supabase = getSupabase(req);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { error } = await supabase
        .from('user_api_keys')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', provider);

      if (error) {
        console.error("DB Delete Error:", error);
        return res.status(500).json({ error: "Failed to delete key" });
      }

      res.json({ success: true, provider });
    } catch (error) {
      console.error("Delete Key Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- Gemini Proxy Route ---
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { model, contents, config } = req.body;
      const supabase = getSupabase(req);
      
      // 1. Try to get user key
      let apiKey = process.env.GEMINI_API_KEY; // Default to system key
      let usingUserKey = false;

      // Check header first (localStorage fallback)
      if (req.headers['x-api-key'] && typeof req.headers['x-api-key'] === 'string') {
        apiKey = req.headers['x-api-key'];
        usingUserKey = true;
      } else {
        // Check DB
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          try {
            const { data, error } = await supabase
              .from('user_api_keys')
              .select('encrypted_key')
              .eq('user_id', user.id)
              .eq('provider', 'gemini')
              .single();
            
            if (data && data.encrypted_key) {
              try {
                apiKey = decrypt(data.encrypted_key);
                usingUserKey = true;
              } catch (e) {
                console.error("Decryption failed, falling back to system key");
              }
            }
          } catch (dbError) {
             // Ignore DB errors (like missing table) and fallback to system key
             console.warn("DB fetch failed for key, using system key if available");
          }
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
      const supabase = getSupabase(req);
      
      // 1. Try to get user key
      let apiKey = process.env.DEEPSEEK_API_KEY; // Default to system key
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data } = await supabase
          .from('user_api_keys')
          .select('encrypted_key')
          .eq('user_id', user.id)
          .eq('provider', 'deepseek')
          .single();
        
        if (data && data.encrypted_key) {
          try {
            apiKey = decrypt(data.encrypted_key);
          } catch (e) {
            console.error("Decryption failed for DeepSeek key");
          }
        }
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

  // Leonardo API Proxy Route
  app.post("/api/leonardo/generations", async (req, res) => {
    try {
      const apiKey = req.headers.authorization;
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
      const apiKey = req.headers.authorization;
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
  app.all("/api/*", (req, res) => {
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
  });
}

startServer();
