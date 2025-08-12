const express = require('express')
const puppeteer = require('puppeteer')

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', async (req, res) => {
  const targetUrl = req.query.url
  if (!targetUrl) {
    return res.status(400).send('Parâmetro url é obrigatório, ex: /?url=https://exemplo.com')
  }

  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    })
    const page = await browser.newPage()

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36')

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 })

    const content = await page.content()

    await browser.close()

    res.set('Content-Type', 'text/html; charset=utf-8')
    res.send(content)
  } catch (err) {
    console.error('Erro no Puppeteer:', err)
    res.status(500).send('Erro ao acessar a página: ' + err.message)
  }
})

app.listen(PORT, () => {
  console.log(`Proxy Puppeteer rodando na porta ${PORT}`)
})
