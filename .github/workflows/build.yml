const express = require('express');
const path = require('path');
const app = express();
app.use(require('cors')());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));
app.use(express.static(__dirname));

const REPO = (process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder-').trim();
const TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const BRANCH = (process.env.GITHUB_BRANCH || 'main').trim();

console.log(`BOOT REPO=${REPO} BRANCH=${BRANCH} TOKEN=${TOKEN?'SET':'MISSING'}`);

const paidBuilds = new Set();

// Helper to upload file to GitHub repo via Contents API
async function uploadFileToRepo(filePath, contentBase64, message) {
  // First check if file exists to get sha
  let sha = null;
  try {
    const check = await fetch(`https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json' }
    });
    if (check.ok) {
      const data = await check.json();
      sha = data.sha;
    }
  } catch {}
  
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: BRANCH,
      ...(sha ? { sha } : {})
    })
  });
  const txt = await res.text();
  console.log(`Upload ${filePath} ${res.status} ${txt.substring(0,200)}`);
  if (!res.ok) throw new Error(`Upload failed ${filePath} ${res.status}: ${txt}`);
  return true;
}

app.get('/api/health', (req,res)=>res.json({ok:true, repo:REPO, branch:BRANCH, tokenSet:!!TOKEN}));

app.get('/api/debug', async (req,res)=>{
  if(!TOKEN) return res.json({error:'TOKEN missing', repo:REPO});
  try{
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows`, {
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json' }
    });
    const data = await r.json();
    res.json({repo:REPO, branch:BRANCH, tokenSet:true, status:r.status, workflows:(data.workflows||[]).map(w=>w.path), info:'build.yml must have 4 inputs: url,appName,packageName,buildId - NO base64 inputs'});
  }catch(e){ res.json({error:e.message}); }
});

// Build - NO large inputs, upload icons as repo files
app.post('/api/build', async (req,res)=>{
  const buildId = Date.now().toString();
  const {url, appName, packageName, iconBase64='', splashBase64=''} = req.body;
  
  if(!url || !appName || !packageName) return res.status(400).json({success:false, error:'Missing fields'});
  if(!TOKEN) return res.status(500).json({success:false, error:'GITHUB_TOKEN missing'});

  try{
    // 1. Upload icons to repo if provided - as files, not as workflow inputs (fixes "inputs are too large")
    if (iconBase64 && iconBase64.length > 100) {
      let b64 = iconBase64;
      if (b64.includes(',')) b64 = b64.split(',')[1];
      // Ensure valid base64
      b64 = b64.replace(/\s/g,'');
      await uploadFileToRepo(`temp-icons/${buildId}-icon.png`, b64, `Add icon for ${buildId}`);
      console.log(`✅ Icon uploaded temp-icons/${buildId}-icon.png`);
    }
    if (splashBase64 && splashBase64.length > 100) {
      let b64 = splashBase64;
      if (b64.includes(',')) b64 = b64.split(',')[1];
      b64 = b64.replace(/\s/g,'');
      await uploadFileToRepo(`temp-icons/${buildId}-splash.png`, b64, `Add splash for ${buildId}`);
      console.log(`✅ Splash uploaded`);
    }

    // 2. Trigger workflow with ONLY 4 small inputs - never "too large"
    const payload = {
      ref: BRANCH,
      inputs: {
        url: String(url).substring(0,200),
        appName: String(appName).substring(0,50),
        packageName: String(packageName).substring(0,100),
        buildId
      }
    };
    console.log(`🚀 Triggering ${buildId} with 4 inputs only (no base64)`);
    
    const githubRes = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/build.yml/dispatches`, {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':'application/json',
        'Accept':'application/vnd.github+json'
      },
      body: JSON.stringify(payload)
    });
    const text = await githubRes.text();
    console.log(`GitHub ${githubRes.status}: ${text.substring(0,300)}`);
    
    if(!githubRes.ok){
      return res.status(githubRes.status).json({success:false, error:`GitHub ${githubRes.status}: ${text}`, githubResponse:text});
    }
    
    res.json({success:true, buildId, message:'Build triggered - icons uploaded as repo files, no large inputs'});
  }catch(e){
    console.error(e);
    res.status(500).json({success:false, error:e.message});
  }
});

app.get('/api/check/:buildId', async (req,res)=>{
  try{
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers:{'Authorization':`Bearer ${TOKEN}`,'Accept':'application/vnd.github+json'}
    });
    const data = await r.json();
    const found = (data.artifacts||[]).filter(a=>a.name.includes(req.params.buildId));
    res.json({ready:found.length>0, apkReady:found.some(a=>a.name.toLowerCase().includes('apk')), aabReady:found.some(a=>a.name.toLowerCase().includes('aab')), count:found.length, artifacts:found.map(f=>f.name), isPaid:paidBuilds.has(req.params.buildId)});
  }catch(e){ res.json({ready:false, error:e.message}); }
});

app.post('/api/verify-payment', (req,res)=>{
  const {buildId, utr} = req.body;
  if(!buildId) return res.status(400).json({success:false, error:'buildId required'});
  if(!utr || utr.length < 6) return res.status(400).json({success:false, error:'UTR min 6 chars'});
  paidBuilds.add(buildId);
  console.log(`✅ PAID ${buildId} ${utr}`);
  res.json({success:true, message:'Payment verified'});
});

app.get('/api/download/:buildId/:type', async (req,res)=>{
  try{
    const {buildId, type} = req.params;
    const isAAB = type.toLowerCase().includes('aab');
    if(isAAB && !paidBuilds.has(buildId)){
      return res.status(402).json({error:'PAID_REQUIRED', message:'AAB ₹499', upi:'sandeep.k876@ptaxis', amount:499, buildId});
    }
    const list = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers:{'Authorization':`Bearer ${TOKEN}`,'Accept':'application/vnd.github+json'}
    }).then(r=>r.json());
    const artifact = (list.artifacts||[]).find(a=>a.name.includes(buildId) && a.name.toLowerCase().includes(type.toLowerCase()));
    if(!artifact) return res.status(404).send(`Building... ${buildId} ${type} not ready`);
    const red = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${artifact.id}/zip`, {headers:{'Authorization':`Bearer ${TOKEN}`}, redirect:'manual'});
    const dl = red.headers.get('location');
    const file = await fetch(dl);
    res.setHeader('Content-Disposition',`attachment; filename="${artifact.name}.zip"`);
    res.setHeader('Content-Type','application/zip');
    require('stream').Readable.fromWeb(file.body).pipe(res);
  }catch(e){ res.status(500).send(e.message); }
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(process.env.PORT||3000, ()=>console.log(`🚀 Server NO-LARGE-INPUTS fixed on ${process.env.PORT||3000}`));
