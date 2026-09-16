const express = require('express');
const path = require('path');
const app = express();
app.use(require('cors')());
app.use(express.json());

// DISABLE CACHE - Force new version every time
app.use((req,res,next)=>{
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static('public'));
app.use(express.static(__dirname)); // also serve root

const REPO = process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder-';
const TOKEN = process.env.GITHUB_TOKEN;

app.post('/api/build', async (req, res) => {
  const buildId = Date.now().toString();
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/build.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs: { ...req.body, buildId } })
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ success: true, buildId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/check/:buildId', async (req, res) => {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const data = await r.json();
    const found = data.artifacts.filter(a => a.name.includes(req.params.buildId));
    res.json({ ready: found.length > 0 });
  } catch { res.json({ ready: false }); }
});

app.get('/api/download/:buildId/:type', async (req, res) => {
  try {
    const { buildId, type } = req.params;
    const list = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).then(r => r.json());
    const artifact = list.artifacts.find(a => a.name.includes(buildId) && a.name.toLowerCase().includes(type));
    if (!artifact) return res.status(404).send('Building... wait 30s');
    const redirectRes = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${artifact.id}/zip`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      redirect: 'manual'
    });
    const downloadUrl = redirectRes.headers.get('location');
    const fileRes = await fetch(downloadUrl);
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.name}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    const { Readable } = require('stream');
    Readable.fromWeb(fileRes.body).pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

// Force serve NEW public/index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(process.env.PORT || 3000, () => console.log('247 Software Running - No Cache'));
