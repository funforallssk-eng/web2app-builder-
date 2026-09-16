const express = require('express');
const path = require('path');
const app = express();

app.use(require('cors')());
app.use(express.json());
app.use(express.static('public'));

const REPO = process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder-';
const TOKEN = process.env.GITHUB_TOKEN;

app.post('/api/build', async (req, res) => {
  const buildId = Date.now().toString();
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/build.yml/dispatches`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs: { ...req.body, buildId } })
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ success: true, buildId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/check/:buildId', async (req, res) => {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/build-${req.params.buildId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (r.ok) {
      const rel = await r.json();
      res.json({ ready: true, count: rel.assets.length });
    } else res.json({ ready: false });
  } catch { res.json({ ready: false }); }
});

// THIS IS THE DIRECT DOWNLOAD FROM YOUR WEBSITE
app.get('/api/download/:buildId/:type', async (req, res) => {
  try {
    const { buildId, type } = req.params;
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/build-${buildId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const rel = await r.json();
    const asset = rel.assets.find(a => a.name.toLowerCase().includes(type));
    if (!asset) return res.status(404).send('File not ready yet');
    
    const file = await fetch(asset.url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/octet-stream' }
    });
    res.setHeader('Content-Disposition', `attachment; filename="${asset.name}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    file.body.pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 3000, () => console.log('Running'));
