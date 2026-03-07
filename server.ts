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

  // Supabase Client Helper
  const getSupabase = (req: express.Request) => {
    const authHeader = req.headers.authorization;
    const options: any = {};
    if (authHeader) {
      options.global = { headers: { Authorization: authHeader } };
    }
    
    // Ensure URL and KEY are present to avoid crashing createClient
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseKey || !supabaseUrl.startsWith('http')) {
      throw new Error('Supabase environment variables are missing or invalid');
    }
    
    return createClient(supabaseUrl, supabaseKey, options);
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
      let supabase;
      try {
        supabase = getSupabase(req);
      } catch (err: any) {
        console.warn("Supabase not configured, returning 503 for local storage fallback");
        return res.status(503).json({ error: "Database unavailable", details: err.message });
      }
      
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
    } catch (error: any) {
      console.error("Get Key Error:", error);
      if (error.message && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('URL') || error.message.includes('Failed to parse'))) {
        return res.status(503).json({ error: "Database unavailable", details: error.message });
      }
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
      let supabase;
      try {
        supabase = getSupabase(req);
      } catch (err: any) {
        console.warn("Supabase not configured, returning 503 for local storage fallback");
        return res.status(503).json({ error: "Database unavailable", details: err.message });
      }

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
    } catch (error: any) {
      console.error("Save Key Error:", error);
      if (error.message && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('URL') || error.message.includes('Failed to parse'))) {
        return res.status(503).json({ error: "Database unavailable", details: error.message });
      }
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  // DELETE /api/keys - Delete key
  app.delete("/api/keys", async (req, res) => {
    try {
      const { provider = 'gemini' } = req.body; // Or query param? Let's support body for consistency
      
      let supabase;
      try {
        supabase = getSupabase(req);
      } catch (err: any) {
        console.warn("Supabase not configured, returning 503 for local storage fallback");
        return res.status(503).json({ error: "Database unavailable", details: err.message });
      }

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
    } catch (error: any) {
      console.error("Delete Key Error:", error);
      if (error.message && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('URL') || error.message.includes('Failed to parse'))) {
        return res.status(503).json({ error: "Database unavailable", details: error.message });
      }
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
          const supabase = getSupabase(req);
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            try {
              const { data } = await supabase
                .from('user_api_keys')
                .select('encrypted_key')
                .eq('user_id', user.id)
                .eq('provider', 'gemini')
                .single();
              
              if (data && data.encrypted_key) {
                try {
                  apiKey = decrypt(data.encrypted_key);
                } catch (e) {}
              }
            } catch (dbError) {}
          }
        } catch (err) {
          console.warn("Supabase not configured, falling back to system key or headers");
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
          const supabase = getSupabase(req);
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
        } catch (err) {
          console.warn("Supabase not configured, falling back to system key or headers");
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
        const supabase = getSupabase(req);
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
      } catch (err) {
        console.warn("Supabase not configured, falling back to system key");
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
        const supabase = getSupabase(req);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data } = await supabase
            .from('user_api_keys')
            .select('encrypted_key')
            .eq('user_id', user.id)
            .eq('provider', 'openai')
            .single();
          
          if (data && data.encrypted_key) {
            try {
              apiKey = decrypt(data.encrypted_key);
            } catch (e) {
              console.error("Decryption failed for OpenAI key");
            }
          }
        }
      } catch (err) {
        console.warn("Supabase not configured, falling back to system key");
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
        const supabase = getSupabase(req);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data } = await supabase
            .from('user_api_keys')
            .select('encrypted_key')
            .eq('user_id', user.id)
            .eq('provider', 'anthropic')
            .single();
          
          if (data && data.encrypted_key) {
            try {
              apiKey = decrypt(data.encrypted_key);
            } catch (e) {
              console.error("Decryption failed for Anthropic key");
            }
          }
        }
      } catch (err) {
        console.warn("Supabase not configured, falling back to system key");
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
        const supabase = getSupabase(req);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data } = await supabase
            .from('user_api_keys')
            .select('encrypted_key')
            .eq('user_id', user.id)
            .eq('provider', 'leonardo')
            .single();
          
          if (data && data.encrypted_key) {
            try {
              apiKey = `Bearer ${decrypt(data.encrypted_key)}`;
            } catch (e) {
              console.error("Decryption failed for Leonardo key");
            }
          }
        }
      } catch (err) {
        console.warn("Supabase not configured, falling back to system key");
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
        const supabase = getSupabase(req);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data } = await supabase
            .from('user_api_keys')
            .select('encrypted_key')
            .eq('user_id', user.id)
            .eq('provider', 'leonardo')
            .single();
          
          if (data && data.encrypted_key) {
            try {
              apiKey = `Bearer ${decrypt(data.encrypted_key)}`;
            } catch (e) {
              console.error("Decryption failed for Leonardo key");
            }
          }
        }
      } catch (err) {
        console.warn("Supabase not configured, falling back to system key");
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
