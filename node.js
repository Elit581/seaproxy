import express from "express";
import https from "https";
import http from "http";
import { URL } from "url";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Função para fazer fetch do site destino
async function fetchTarget(targetUrl, method = "GET", headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        ...headers,
        host: urlObj.hostname,
        "User-Agent": headers["User-Agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: headers["Accept"] || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      servername: urlObj.hostname, // SNI real
    };

    const req = client.request(reqOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ res, body: Buffer.concat(chunks) }));
    });

    req.on("error", (err) => reject(err));

    if (body) {
      if (Buffer.isBuffer(body) || typeof body === "string") req.write(body);
      else req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Proxy transparente
app.use(async (req, res) => {
  const targetUrl = `${req.protocol}://${req.headers.host}${req.originalUrl}`;
  const params = new URL(req.url, `http://${req.headers.host}`);
  const target = params.searchParams.get("url");

  if (!target) {
    return res.send("<h1>Proxy Transparente</h1><p>Use ?url=https://www.example.com</p>");
  }

  try {
    // Remove headers que podem quebrar
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.referer;
    delete headers["accept-encoding"];

    const method = req.method;
    const body = method === "GET" ? null : req.body;

    const { res: upstream, body: siteBody } = await fetchTarget(target, method, headers, body);

    const responseHeaders = {};
    for (const [k, v] of Object.entries(upstream.headers)) {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)) {
        responseHeaders[k] = v;
      }
    }

    responseHeaders["Access-Control-Allow-Origin"] = "*";
    responseHeaders["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";

    // Reescreve links internos
    const contentType = upstream.headers["content-type"] || "";
    if (contentType.includes("text/html") || contentType.includes("text/css")) {
      let text = siteBody.toString("utf-8");

      text = text.replace(/(href|src|action)=["']?([^"'>\s]+)["']?/gi, (m, attr, link) => {
        try {
          const abs = new URL(link, target).toString();
          return `${attr}="?url=${encodeURIComponent(abs)}"`;
        } catch {
          return m;
        }
      });

      return res.set(responseHeaders).status(upstream.statusCode).send(text);
    }

    res.set(responseHeaders).status(upstream.statusCode).send(siteBody);

  } catch (err) {
    console.error(err);
    res.status(500).send("Proxy Error: " + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy transparente rodando na porta ${PORT}`));
