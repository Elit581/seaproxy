// server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Proxy principal
app.use("/proxy", async (req, res) => {
  try {
    const target = req.query.url;
    if (!target) {
      return res.status(400).send("Informe a URL: ?url=https://...");
    }

    const method = req.method;
    const headers = { ...req.headers };

    // Remover headers que podem quebrar o destino
    delete headers.host;
    delete headers.origin;
    delete headers.referer;
    delete headers["accept-encoding"]; // evita gzip/deflate, para manipular facilmente

    // Repassa cookies do cliente
    if (req.headers.cookie) {
      headers.cookie = req.headers.cookie;
    }

    // Faz fetch para o destino
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? null : req.body,
      redirect: "manual",
    });

    // Copia headers da resposta
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key)) {
        res.setHeader(key, value);
      }
    });

    // Reescreve Location para passar pelo proxy
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (location) {
        const proxied = `/proxy?url=${encodeURIComponent(new URL(location, target).toString())}`;
        res.setHeader("location", proxied);
      }
    }

    // Conteúdo textual (HTML/CSS) → opcional: reescrever links
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("text/html") || contentType.includes("text/css")) {
      let bodyText = await upstream.text();

      // Reescreve href/src/action/url(...) para passar pelo proxy
      bodyText = bodyText.replace(/(href|src|action)=["']?([^"'>\s]+)["']?/gi, (m, attr, link) => {
        try {
          const abs = new URL(link, target).toString();
          return `${attr}="/proxy?url=${encodeURIComponent(abs)}"`;
        } catch {
          return m;
        }
      });
      if (contentType.includes("text/css")) {
        bodyText = bodyText.replace(/url\(([^)]+)\)/gi, (m, link) => {
          try {
            const abs = new URL(link.replace(/['"]/g, ""), target).toString();
            return `url(/proxy?url=${encodeURIComponent(abs)})`;
          } catch {
            return m;
          }
        });
      }
      return res.status(upstream.status).send(bodyText);
    }

    // Conteúdo binário → repassa direto
    const buffer = await upstream.arrayBuffer();
    res.status(upstream.status).send(Buffer.from(buffer));
  } catch (e) {
    console.error(e);
    res.status(500).send("Proxy Error: " + e.message);
  }
});

// Página inicial simples
app.get("/", (req, res) => {
  res.send(`
    <h1>Proxy Web Node.js</h1>
    <form method="get" action="/proxy">
      <input name="url" placeholder="https://example.com" style="width: 60%;">
      <button type="submit">Acessar</button>
    </form>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy rodando na porta ${PORT}`));
