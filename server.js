
const express = require('express');
const path = require('path');
const app = express();
app.use(require('cors')());
app.use(express.json({ limit: '10mb' }));

// NO CACHE - Force fresh version
app.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  next();
});

app.use(express.static('public'));
app.use(express.static(__dirname));

const REPO = process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder-';
const TOKEN = process.env.GITHUB_TOKEN;

if(!TOKEN) console.warn('⚠️ GITHUB_TOKEN not set - builds will fail! Set in Render Env Vars');

// Build with Icon + Splash + Pull to Refresh
app.post('/api/build', async (req, res) => {
  const buildId = Date.now().toString();
  const {
    url,
    appName,
    packageName,
    iconBase64, // base64 PNG 512x512
    splashBase64, // base64 PNG
    splashBgColor = '#0f172a',
    iconBgColor = '#0f172a',
    pullToRefresh = true,
    splashDuration = '2000',
    statusBarColor = '#0f172a',
    orientation = 'portrait'
  } = req.body;

  if(!url || !appName || !packageName) return res.status(400).json({success:false, error:'Missing fields'});

  try {
    // GitHub workflow inputs have size limits, so we truncate base64 to 48KB per input
    // For larger icons, we send as artifact via separate API, but for now send as input
    // If icon > 40KB base64, we skip and use default icon (to avoid 422 error)
    const safeIcon = (iconBase64 && iconBase64.length < 40000) ? iconBase64 : '';
    const safeSplash = (splashBase64 && splashBase64.length < 40000) ? splashBase64 : '';

    const workflowUrl = `https://api.github.com/repos/${REPO}/actions/workflows/build.yml/dispatches`;
    const r = await fetch(workflowUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          url: url.substring(0, 200),
          appName: appName.substring(0, 50),
          packageName: packageName.substring(0, 100),
          buildId,
          iconBase64: safeIcon,
          splashBase64: safeSplash,
          splashBgColor,
          iconBgColor,
          pullToRefresh: pullToRefresh ? 'true' : 'false',
          splashDuration,
          statusBarColor,
          orientation
        }
      })
    });

    const text = await r.text();
    if(!r.ok) {
      console.error('GitHub dispatch failed:', r.status, text);
      throw new Error(`GitHub API ${r.status}: ${text.substring(0,200)}`);
    }

    console.log(`✅ Build triggered: ${buildId} for ${appName} - Icon:${!!safeIcon} Splash:${!!safeSplash} Pull:${pullToRefresh}`);
    res.json({ success: true, buildId });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/check/:buildId', async (req, res) => {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const data = await r.json();
    const found = (data.artifacts || []).filter(a => a.name.includes(req.params.buildId));
    res.json({ ready: found.length > 0, count: found.length });
  } catch (e) { res.json({ ready: false }); }
});

app.get('/api/download/:buildId/:type', async (req, res) => {
  try {
    const { buildId, type } = req.params;
    const list = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).then(r => r.json());

    const artifact = (list.artifacts || []).find(a => 
      a.name.includes(buildId) && a.name.toLowerCase().includes(type.toLowerCase())
    );

    if (!artifact) return res.status(404).send(`Building... Check again in 30 seconds. BuildId: ${buildId}`);

    const redirectRes = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${artifact.id}/zip`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      redirect: 'manual'
    });

    const downloadUrl = redirectRes.headers.get('location');
    if(!downloadUrl) throw new Error('No download URL');

    const fileRes = await fetch(downloadUrl);
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.name}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    
    const { Readable } = require('stream');
    Readable.fromWeb(fileRes.body).pipe(res);

  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 247 Software Solution Running on ${PORT} - Icon+Splash+PullRefresh Enabled - No Cache`));

