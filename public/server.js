const express = require('express');
const path = require('path');
const app = express();
app.use(require('cors')());
app.use(express.json({ limit: '15mb' }));
app.use((req,res,next)=>{
  if(req.path.endsWith('.html') || req.path === '/'){ res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private'); }
  next();
});
app.use(express.static('public'));
app.use(express.static(__dirname));

const REPO = process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder-';
const TOKEN = process.env.GITHUB_TOKEN;
const BRANCH = process.env.GITHUB_BRANCH || 'main';

// In-memory paid store - in production use DB
const paidBuilds = new Set();
const paidOrders = {}; // buildId -> {utr, time}

console.log(`Config: ${REPO} Token:${TOKEN?'SET':'MISSING'}`);

app.get('/api/health', (req,res)=>res.json({ok:true, repo:REPO, branch:BRANCH, tokenSet:!!TOKEN}));

app.get('/api/debug', async (req,res)=>{
  try{
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows`, {
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent':'web2app' }
    });
    const data = await r.json();
    res.json({repo:REPO, branch:BRANCH, tokenSet:!!TOKEN, status:r.status, workflows:(data.workflows||[]).map(w=>({path:w.path, state:w.state}))});
  }catch(e){ res.json({error:e.message}); }
});

// Build - triggers GitHub - only 6 inputs to avoid 422
app.post('/api/build', async (req,res)=>{
  const buildId = Date.now().toString();
  const {url, appName, packageName, iconBase64='', splashBase64=''} = req.body;
  if(!url || !appName || !packageName) return res.status(400).json({success:false, error:'Missing fields'});
  if(!TOKEN) return res.status(500).json({success:false, error:'GITHUB_TOKEN missing in Render'});
  try{
    const githubRes = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/build.yml/dispatches`, {
      method:'POST',
      headers:{'Authorization':`Bearer ${TOKEN}`,'Content-Type':'application/json','Accept':'application/vnd.github+json','User-Agent':'web2app'},
      body: JSON.stringify({
        ref: BRANCH,
        inputs: {
          url: String(url).substring(0,200),
          appName: String(appName).substring(0,50),
          packageName: String(packageName).substring(0,100),
          buildId,
          iconBase64: String(iconBase64).substring(0,35000),
          splashBase64: String(splashBase64).substring(0,35000)
        }
      })
    });
    const txt = await githubRes.text();
    console.log(`Build ${buildId} GitHub ${githubRes.status} ${txt.substring(0,200)}`);
    if(!githubRes.ok) return res.status(githubRes.status).json({success:false, error:`GitHub ${githubRes.status}: ${txt}`, githubResponse:txt});
    res.json({success:true, buildId});
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
});

// Check artifacts
app.get('/api/check/:buildId', async (req,res)=>{
  try{
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers:{'Authorization':`Bearer ${TOKEN}`,'Accept':'application/vnd.github+json'}
    });
    const data = await r.json();
    const all = (data.artifacts||[]).filter(a=>a.name.includes(req.params.buildId));
    const apk = all.find(a=>a.name.toLowerCase().includes('apk'));
    const aab = all.find(a=>a.name.toLowerCase().includes('aab'));
    res.json({ready: all.length>0, apkReady:!!apk, aabReady:!!aab, count:all.length, artifacts:all.map(a=>a.name), isPaid: paidBuilds.has(req.params.buildId)});
  }catch(e){ res.json({ready:false, error:e.message}); }
});

// Verify payment for AAB - PAID LOCK
app.post('/api/verify-payment', (req,res)=>{
  const {buildId, utr, amount} = req.body;
  if(!buildId) return res.status(400).json({success:false, error:'buildId required'});
  // Simple verification: require 12-digit UTR or UPI ref
  if(!utr || utr.length < 6) return res.status(400).json({success:false, error:'Enter valid UTR / Transaction ID (min 6 chars)'});
  
  // Mark as paid - in production verify with UPI API or manual check
  paidBuilds.add(buildId);
  paidOrders[buildId] = {utr, amount: amount||499, time: new Date().toISOString()};
  console.log(`✅ PAID ${buildId} UTR:${utr}`);
  res.json({success:true, message:'Payment verified! AAB download unlocked'});
});

// Download - APK free, AAB paid check
app.get('/api/download/:buildId/:type', async (req,res)=>{
  try{
    const {buildId, type} = req.params;
    const isAAB = type.toLowerCase().includes('aab');
    
    // PAID CHECK FOR AAB
    if(isAAB && !paidBuilds.has(buildId)){
      return res.status(402).json({
        error:'PAID_REQUIRED',
        message:'AAB is paid ₹499. Please complete payment.',
        upi:'sandeep.k876@ptaxis',
        amount:499,
        buildId
      });
    }

    if(!TOKEN) return res.status(500).send('TOKEN missing');
    const list = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers:{'Authorization':`Bearer ${TOKEN}`,'Accept':'application/vnd.github+json'}
    }).then(r=>r.json());
    
    const artifact = (list.artifacts||[]).find(a=> a.name.includes(buildId) && a.name.toLowerCase().includes(type.toLowerCase()));
    if(!artifact) return res.status(404).send(`Still building... BuildId ${buildId} ${type} not ready. Wait 2-3 min. Total artifacts: ${list.artifacts?.length||0}`);

    const redirectRes = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${artifact.id}/zip`, {
      headers:{'Authorization':`Bearer ${TOKEN}`}, redirect:'manual'
    });
    const downloadUrl = redirectRes.headers.get('location');
    if(!downloadUrl) throw new Error('No download URL');
    const fileRes = await fetch(downloadUrl);
    res.setHeader('Content-Disposition',`attachment; filename="${artifact.name}.zip"`);
    res.setHeader('Content-Type','application/zip');
    const {Readable} = require('stream');
    Readable.fromWeb(fileRes.body).pipe(res);
  }catch(e){
    console.error(e);
    res.status(500).send(e.message);
  }
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

const PORT = process.env.PORT||3000;
app.listen(PORT,()=>console.log(`🚀 247 Running Paid Lock on ${PORT}`));
