import express from "express"
import { getPortPromise } from "portfinder"

import sharp from "sharp"
import path from "path"

import open from "open"

import multer from "multer"
const upload = multer()

const RAMFiles = new Map()

const app = express()

const PORT = await getPortPromise()

app.use(express.json())
app.use(express.text())
app.use('/style.css', express.static('./style.css'))
app.use('/icon.ico', express.static('./icon.ico'))

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: '.' })
})

app.post('/compress', upload.array('file'), async (req, res) => {
  const files = req.files
  const kb = req.body.kb

  const compressedFiles = await Promise.all(
    files.map(async file => {
      return await compressAndServeFile(file, kb*1024)
    })
  )

  compressedFiles.forEach(file => {
    RAMFiles.set(file.originalname, file)
  })

  res.json(
    compressedFiles.map(({quality, originalname, size}) => ({
      quality, name: originalname, size
    }))
  )
})

app.get(`/download/:name`, (req, res) => {
  const name = decodeURIComponent(req.params.name)
  const file = RAMFiles.get(name)

  res.status(200)
  res.setHeader('Content-Type', file.mimetype)
  res.send(Buffer.from(file.buffer, 'base64'))
})

app.listen(PORT, 'localhost', () => {
  console.log(`Up and running on http://localhost:${PORT}`)
  open(`http://localhost:${PORT}`)
})

async function compressAndServeFile(file, maxFileSize) {
  return await optimizeToSize(file, maxFileSize, 100, 1)
}

async function optimizeToSize(file, maxFileSize, hq, lq) {
  const quality = Math.floor((hq + lq) / 2)

  const optimizedContentBuffer = path.extname(file.originalname) === '.png' ?
    await sharp(file.buffer).png({quality, effort: 10}).toBuffer() :
    await sharp(file.buffer).jpeg({quality}).toBuffer()
  
  if (hq - lq < 2) {
    return {
      ...file,
      buffer: optimizedContentBuffer,
      size: optimizedContentBuffer.length,
      quality,
    }
  }

  if (optimizedContentBuffer.length > maxFileSize) {
    return await optimizeToSize(file, maxFileSize, quality, lq)
  } else {
    return await optimizeToSize(file, maxFileSize, hq, quality)
  }
}
