import express from "express";
import https from "https";
import http from "http";
import { URL } from "url";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

function fetchWithSNI(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const isHttps = urlObj.protocol === "https:";
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: options.headers || {},
      servername: urlObj.hostname, // ✅ define SNI real
    };

    const client = isHttps ? https : http;

    const req = client.request(reqOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({ res, body });
      });
    });

    req.on("error", (e) => reject(e));
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Proxy principal
app.use("/proxy", async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send("Informe a URL: ?url=https://...");

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.referer;
    delete headers["accept-encoding"];

    const { res: upstream, body } = await fetchWithSNI(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? null : req.body,
    });

    // Copia headers
    upstream.headers && Object.entries(upstream.headers).forEach(([k, v]) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)) {
        res.setHeader(k, v);
      }
    });

    // Reescreve Location para passar pelo proxy
    if (upstream.statusCode >= 300 && upstream.statusCode < 400) {
      const location = upstream.headers.location;
      if (location) {
        const proxied = `/proxy?url=${encodeURIComponent(new URL(location, target).toString())}`;
        res.setHeader("location", proxied);
      }
    }

    res.status(upstream.statusCode).send(body);
  } catch (err) {
    console.error(err);
    res.status(500).send("Proxy Error: " + err.message);
  }
});

// Página inicial simples
app.get("/", (req, res) => {
  res.send(`
    <h1>SeaProxy SNI-ready</h1>
    <form method="get" action="/proxy">
      <input name="url" placeholder="https://example.com" style="width:60%">
      <button type="submit">Acessar</button>
    </form>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy rodando na porta ${PORT}`));
