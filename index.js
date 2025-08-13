const express = require('express')
const puppeteer = require('puppeteer-core')
const chromium = require('chrome-aws-lambda')

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', async (req, res) => {
  const targetUrl = req.query.url
  if (!targetUrl) return res.status(400).send('Use /?url=https://exemplo.com')

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless
    })

    const page = await browser.newPage()
    await page.goto(targetUrl, { waitUntil: 'networkidle2' })
    const content = await page.content()

    await browser.close()

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(content)
  } catch (err) {
    res.status(500).send('Erro: ' + err.message)
  }
})

app.listen(PORT, () => {
  console.log(`Rodando na porta ${PORT}`)
})
