const express = require('express');
const path = require('path');
const app = express();
app.use(require('cors')());
app.use(express.json({ limit: '15mb' }));
app.use((req,res,next)=>{
  if(req.path.endsWith('.html') || req.path === '/'){
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma','no-cache');
  }
  next();
});
app.use(express.static('public'));
app.use(express.static(__dirname));

const REPO = (process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder-').trim();
const TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const BRANCH = (process.env.GITHUB_BRANCH || 'main').trim();

console.log(`BOOT: REPO=${REPO} BRANCH=${BRANCH} TOKEN=${TOKEN? 'SET len:'+TOKEN.length : 'MISSING'}`);

const paidBuilds = new Set();

app.get('/api/health', (req,res)=>res.json({ok:true, repo:REPO, branch:BRANCH, tokenSet:!!TOKEN, time:new Date().toISOString()}));

app.get('/api/debug', async (req,res)=>{
  if(!TOKEN) return res.json({error:'GITHUB_TOKEN missing in Render Env', repo:REPO, tokenSet:false, fix:'Add GITHUB_TOKEN in Render Dashboard > Environment'});
  try{
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows`, {
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent':'web2app-debug' }
    });
    const data = await r.json();
    if(!r.ok) return res.json({repo:REPO, branch:BRANCH, tokenSet:true, githubStatus:r.status, error:data.message, fix: r.status===401?'Token invalid - create new token with repo+workflow scopes': r.status===404?`Repo ${REPO} not found - check spelling (trailing - ?)`: data.message});
    res.json({repo:REPO, branch:BRANCH, tokenSet:true, githubStatus:r.status, workflows:(data.workflows||[]).map(w=>({name:w.name, path:w.path, state:w.state})), message:'OK - If build.yml not listed, file not on main branch'});
  }catch(e){ res.json({error:e.message, repo:REPO}); }
});

// EXACT MATCHED BUILD - 6 inputs only - NEVER 422 for extra inputs
app.post('/api/build', async (req,res)=>{
  const buildId = Date.now().toString();
  const {url, appName, packageName, iconBase64='', splashBase64=''} = req.body;
  if(!url || !appName || !packageName) return res.status(400).json({success:false, error:'Missing url/appName/packageName'});
  if(!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName)) return res.status(400).json({success:false, error:'Invalid package name like com.example.app'});
  if(!TOKEN) return res.status(500).json({success:false, error:'GITHUB_TOKEN not set in Render > Environment Variables'});

  try{
    // ONLY 6 inputs - exactly what build.yml defines - NO extra inputs = NO 422
    const payload = {
      ref: BRANCH,
      inputs: {
        url: String(url).substring(0,200),
        appName: String(appName).substring(0,50),
        packageName: String(packageName).substring(0,100),
        buildId,
        iconBase64: String(iconBase64||'').substring(0,35000),
        splashBase64: String(splashBase64||'').substring(0,35000)
      }
    };
    console.log(`🚀 Build ${buildId} ${appName} -> ${REPO} ${BRANCH} inputs:${Object.keys(payload.inputs).join(',')}`);
    const workflowUrl = `https://api.github.com/repos/${REPO}/actions/workflows/build.yml/dispatches`;
    console.log(`Calling ${workflowUrl}`);
    
    const githubRes = await fetch(workflowUrl, {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':'application/json',
        'Accept':'application/vnd.github+json',
        'User-Agent':'web2app-builder'
      },
      body: JSON.stringify(payload)
    });
    const text = await githubRes.text();
    console.log(`GitHub API ${githubRes.status}: ${text.substring(0,500)}`);

    if(!githubRes.ok){
      let msg = `GitHub ${githubRes.status}: ${text}`;
      if(githubRes.status===422){
        msg = `422 still? Check: 1) .github/workflows/build.yml on ${BRANCH} branch has workflow_dispatch with EXACT 6 inputs (url,appName,packageName,buildId,iconBase64,splashBase64). 2) File path is build.yml not build.yaml. 3) Token has workflow scope. Raw: ${text}`;
      }
      if(githubRes.status===404) msg = `404 Repo or workflow not found. Repo=${REPO} File=build.yml Branch=${BRANCH}. Check repo name has trailing '-'? Actual repo might be web2app-builder without -. Raw: ${text}`;
      if(githubRes.status===401) msg = `401 Token invalid/expired. Create new classic token with repo + workflow. Raw: ${text}`;
      return res.status(githubRes.status).json({success:false, error:msg, githubResponse:text, sentInputs:Object.keys(payload.inputs)});
    }
    console.log(`✅ Triggered ${buildId}`);
    res.json({success:true, buildId, message:'Triggered - check GitHub Actions tab in 10s'});
  }catch(e){
    console.error('Build error', e);
    res.status(500).json({success:false, error:e.message});
  }
});

app.get('/api/check/:buildId', async (req,res)=>{
  try{
    if(!TOKEN) return res.json({ready:false, error:'TOKEN missing'});
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
  if(!utr || utr.length < 6) return res.status(400).json({success:false, error:'Enter valid UTR min 6 chars'});
  paidBuilds.add(buildId);
  console.log(`✅ PAID ${buildId} UTR:${utr}`);
  res.json({success:true, message:'Payment verified - AAB unlocked'});
});

app.get('/api/download/:buildId/:type', async (req,res)=>{
  try{
    const {buildId, type} = req.params;
    const isAAB = type.toLowerCase().includes('aab');
    if(isAAB && !paidBuilds.has(buildId)){
      return res.status(402).json({error:'PAID_REQUIRED', message:'AAB paid ₹499', upi:'sandeep.k876@ptaxis', amount:499, buildId});
    }
    if(!TOKEN) return res.status(500).send('TOKEN missing');
    const list = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers:{'Authorization':`Bearer ${TOKEN}`,'Accept':'application/vnd.github+json'}
    }).then(r=>r.json());
    const artifact = (list.artifacts||[]).find(a=>a.name.includes(buildId) && a.name.toLowerCase().includes(type.toLowerCase()));
    if(!artifact) return res.status(404).send(`Still building ${buildId} ${type} - wait 2-3 min. Total: ${list.artifacts?.length||0}`);
    const red = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${artifact.id}/zip`, {headers:{'Authorization':`Bearer ${TOKEN}`}, redirect:'manual'});
    const dl = red.headers.get('location');
    if(!dl) throw new Error('No download URL');
    const file = await fetch(dl);
    res.setHeader('Content-Disposition',`attachment; filename="${artifact.name}.zip"`);
    res.setHeader('Content-Type','application/zip');
    require('stream').Readable.fromWeb(file.body).pipe(res);
  }catch(e){ res.status(500).send(e.message); }
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

const PORT = process.env.PORT||3000;
app.listen(PORT,()=>console.log(`🚀 MATCHED 6-inputs server on ${PORT}`));
