import express from "express";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser
  app.use(express.json());

  // DeepSeek Proxy Route
  app.post("/api/deepseek", async (req, res) => {
    try {
      const apiKey = req.headers.authorization;
      if (!apiKey) {
        return res.status(401).json({ error: "Missing DeepSeek API Key" });
      }

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": apiKey
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
        }
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
