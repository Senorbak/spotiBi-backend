const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const youtubedl = require('youtube-dl-exec');

const app = express();

// Permite peticiones desde tu app en GitHub Pages o localhost sin bloqueos CORS
app.use(cors());

// 1. Endpoint para buscar canciones en YouTube
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Falta la query' });

    const output = await youtubedl(`ytsearch15:${q}`, {
      dumpSingleJson: true,
      flatPlaylist: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
    });

    const results = (output.entries || []).map(v => ({
      id: v.id,
      title: v.title,
      uploaderName: v.uploader || v.channel || 'YouTube',
      thumbnail: v.thumbnails?.length ? v.thumbnails[v.thumbnails.length - 1].url : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: v.duration || 0
    }));

    res.json(results);
  } catch (err) {
    console.error('Error en búsqueda:', err.message);
    res.status(500).json({ error: 'Error buscando en YouTube' });
  }
});

// 2. Endpoint para extraer la URL del audio directo
app.get('/api/stream', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Falta el ID del video' });

    const output = await youtubedl(`https://www.youtube.com/watch?v=${id}`, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      format: 'ba[ext=m4a]/ba/bestaudio'
    });

    res.json({
      url: output.url,
      title: output.title,
      uploader: output.uploader,
      ext: output.ext || 'm4a',
      duration: output.duration
    });
  } catch (err) {
    console.error('Error extrayendo stream:', err.message);
    res.status(500).json({ error: 'Error obteniendo audio' });
  }
});

// 3. Endpoint Proxy de audio (evita bloqueos CORS e IP al descargar canciones en la app)
app.get('/api/proxy', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Falta el ID del video' });

    const output = await youtubedl(`https://www.youtube.com/watch?v=${id}`, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      format: 'ba[ext=m4a]/ba/bestaudio'
    });

    if (!output.url) return res.status(404).json({ error: 'Sin URL de audio' });

    const client = output.url.startsWith('https') ? https : http;
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    client.get(output.url, { headers }, (streamRes) => {
      res.status(streamRes.statusCode || 200);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', streamRes.headers['content-type'] || 'audio/mp4');
      if (streamRes.headers['content-length']) {
        res.setHeader('Content-Length', streamRes.headers['content-length']);
      }
      if (streamRes.headers['content-range']) {
        res.setHeader('Content-Range', streamRes.headers['content-range']);
      }
      streamRes.pipe(res);
    }).on('error', (err) => {
      console.error('Error en stream proxy:', err.message);
      if (!res.headersSent) res.status(500).end();
    });
  } catch (err) {
    console.error('Error en proxy:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Error en proxy de audio' });
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend yt-dlp corriendo correctamente en el puerto ${PORT}`);
});