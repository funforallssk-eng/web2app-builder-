const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const GITHUB_REPO = process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder-';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

app.post('/api/build', async (req, res) => {
  try {
    const { url, appName, packageName } = req.body;
    const buildId = Date.now().toString();
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main', inputs: { url, appName, packageName, buildId } })
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ success: true, buildId });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/check/:buildId', async (req, res) => {
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/build-${req.params.buildId}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });
    if (r.ok) {
      const rel = await r.json();
      const apk = rel.assets.find(a => a.name.endsWith('.apk'));
      const aab = rel.assets.find(a => a.name.endsWith('.aab'));
      res.json({ ready: true, apkUrl: apk?.browser_download_url, aabUrl: aab?.browser_download_url });
    } else {
      res.json({ ready: false });
    }
  } catch { res.json({ ready: false }); }
});

// IMPORTANT - Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(process.env.PORT || 3000, () => console.log('Running'));
