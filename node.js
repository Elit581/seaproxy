import express from "express";
import https from "https";
import http from "http";
import { URL } from "url";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
      servername: urlObj.hostname // SNI real
    };

    const client = isHttps ? https : http;
    const req = client.request(reqOptions, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ res, body: Buffer.concat(chunks) }));
    });

    req.on("error", e => reject(e));
    if (options.body) {
      if (Buffer.isBuffer(options.body) || typeof options.body === "string") {
        req.write(options.body);
      } else {
        req.write(JSON.stringify(options.body));
      }
    }
    req.end();
  });
}

// Proxy principal
app.get("/proxy", async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send("Informe a URL: ?url=https://...");

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.referer;
    delete headers["accept-encoding"];

    headers["User-Agent"] = headers["User-Agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
    headers["Accept"] = headers["Accept"] || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

    const { res: upstream, body } = await fetchWithSNI(target, { headers });

    const responseHeaders = {};
    for (const [k, v] of Object.entries(upstream.headers)) {
      if (!["content-encoding","content-length","transfer-encoding","connection"].includes(k)) {
        responseHeaders[k] = v;
      }
    }
    responseHeaders["Access-Control-Allow-Origin"] = "*";
    responseHeaders["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    
    // Reescreve Location para proxy
    if (upstream.statusCode >= 300 && upstream.statusCode < 400) {
      const location = upstream.headers.location;
      if (location) {
        responseHeaders["location"] = `/proxy?url=${encodeURIComponent(new URL(location, target).toString())}`;
      }
    }

    res.set(responseHeaders).status(upstream.statusCode).send(body);

  } catch (err) {
    console.error(err);
    res.status(500).send("Proxy Error: " + err.message);
  }
});

// Página inicial
app.get("/", (req, res) => {
  res.send(`
    <h1>Proxy Web Render</h1>
    <form method="get" action="/proxy">
      <input name="url" placeholder="https://example.com" style="width:60%">
      <button type="submit">Acessar</button>
    </form>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy rodando na porta ${PORT}`));
