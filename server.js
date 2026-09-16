const express = require('express');
const path = require('path');
const app = express();
app.use(require('cors')());
app.use(express.json({ limit: '15mb' }));

// No cache for index.html
app.use((req,res,next)=>{
  if(req.path.endsWith('.html') || req.path === '/'){
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
  }
  next();
});

app.use(express.static('public'));
app.use(express.static(__dirname));

// ENV VARS - SET IN RENDER
const REPO = process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder-';
const TOKEN = process.env.GITHUB_TOKEN;
const BRANCH = process.env.GITHUB_BRANCH || 'main';

console.log(`Config: REPO=${REPO} BRANCH=${BRANCH} TOKEN=${TOKEN ? 'SET ✅ length:'+TOKEN.length : 'MISSING ❌'}`);

if(!TOKEN){
  console.error('❌ GITHUB_TOKEN missing in Render Environment!');
}

// Health check
app.get('/api/health', (req,res)=>{
  res.json({ ok:true, repo:REPO, branch:BRANCH, tokenSet:!!TOKEN, time:new Date().toISOString() });
});

// Debug - shows workflows
app.get('/api/debug', async (req,res)=>{
  try{
    if(!TOKEN) return res.json({ error:'TOKEN missing in Render Env', repo:REPO, tokenSet:false });
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows`, {
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'web2app' }
    });
    const data = await r.json();
    res.json({
      repo:REPO,
      branch:BRANCH,
      tokenSet:true,
      githubStatus:r.status,
      workflows:(data.workflows||[]).map(w=>({name:w.name, path:w.path, state:w.state})),
      message: r.status===401 ? 'TOKEN invalid or expired - create new token with repo + workflow scopes' : r.status===404 ? 'REPO not found - check GITHUB_REPO name' : 'OK - workflows found'
    });
  }catch(e){ res.json({ error:e.message, repo:REPO, tokenSet:!!TOKEN }); }
});

// BUILD - triggers GitHub
app.post('/api/build', async (req,res)=>{
  const buildId = Date.now().toString();
  const { url, appName, packageName, iconBase64='', splashBase64='', splashBgColor='#0f172a', iconBgColor='#0f172a', pullToRefresh=true, splashDuration='2000', statusBarColor='#0f172a', orientation='portrait' } = req.body;

  if(!url || !appName || !packageName){
    return res.status(400).json({ success:false, error:'Missing url/appName/packageName' });
  }

  if(!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName)){
    return res.status(400).json({ success:false, error:'Invalid package name. Use com.example.app' });
  }

  if(!TOKEN){
    return res.status(500).json({ success:false, error:'GITHUB_TOKEN not set in Render Environment Variables. Add it!' });
  }

  try{
    const safeIcon = (iconBase64||'').substring(0,35000);
    const safeSplash = (splashBase64||'').substring(0,35000);

    console.log(`🚀 Build ${buildId} ${appName} ${url} Icon:${!!safeIcon} Splash:${!!safeSplash}`);

    const workflowUrl = `https://api.github.com/repos/${REPO}/actions/workflows/build.yml/dispatches`;

    const githubRes = await fetch(workflowUrl, {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':'application/json',
        'Accept':'application/vnd.github+json',
        'User-Agent':'web2app-builder'
      },
      body:JSON.stringify({
        ref:BRANCH,
        inputs:{
          url: String(url).substring(0,200),
          appName: String(appName).substring(0,50),
          packageName: String(packageName).substring(0,100),
          buildId,
          iconBase64: safeIcon,
          splashBase64: safeSplash,
          splashBgColor: String(splashBgColor),
          iconBgColor: String(iconBgColor),
          pullToRefresh: pullToRefresh ? 'true' : 'false',
          splashDuration: String(splashDuration),
          statusBarColor: String(statusBarColor),
          orientation: String(orientation)
        }
      })
    });

    const text = await githubRes.text();
    console.log(`GitHub API ${githubRes.status}: ${text.substring(0,400)}`);

    if(!githubRes.ok){
      if(githubRes.status===422){
        return res.status(422).json({ success:false, error:`GitHub 422: Workflow missing workflow_dispatch or YAML invalid. Check .github/workflows/build.yml has 'on: workflow_dispatch'`, githubResponse:text });
      }
      if(githubRes.status===401){
        return res.status(401).json({ success:false, error:'GitHub 401: Token invalid or expired. Create new token with repo + workflow scopes', githubResponse:text });
      }
      if(githubRes.status===404){
        return res.status(404).json({ success:false, error:`GitHub 404: Repo ${REPO} not found or token has no access. Check GITHUB_REPO name`, githubResponse:text });
      }
      throw new Error(`GitHub ${githubRes.status}: ${text}`);
    }

    console.log(`✅ Triggered ${buildId}`);
    res.json({ success:true, buildId });

  }catch(e){
    console.error('Build error', e);
    res.status(500).json({ success:false, error:e.message });
  }
});

// CHECK if artifact ready
app.get('/api/check/:buildId', async (req,res)=>{
  try{
    if(!TOKEN) return res.json({ ready:false, error:'TOKEN missing' });
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers:{ 'Authorization': `Bearer ${TOKEN}`, 'Accept':'application/vnd.github+json', 'User-Agent':'web2app' }
    });
    const data = await r.json();
    const found = (data.artifacts||[]).filter(a=> a.name.includes(req.params.buildId));
    res.json({ ready:found.length>0, count:found.length, artifacts:found.map(f=>f.name) });
  }catch(e){ res.json({ ready:false, error:e.message }); }
});

// DOWNLOAD APK/AAB
app.get('/api/download/:buildId/:type', async (req,res)=>{
  try{
    if(!TOKEN) return res.status(500).send('TOKEN missing in Render env');
    const {buildId,type} = req.params;
    const list = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`, {
      headers:{ 'Authorization': `Bearer ${TOKEN}`, 'Accept':'application/vnd.github+json', 'User-Agent':'web2app' }
    }).then(r=>r.json());
    const artifact = (list.artifacts||[]).find(a=> a.name.includes(buildId) && a.name.toLowerCase().includes(type.toLowerCase()));
    if(!artifact){
      return res.status(404).send(`Still building... BuildId ${buildId} not ready yet. Found ${list.artifacts?.length||0} total artifacts. Wait 2-3 min and refresh. Check GitHub Actions tab - build should be running.`);
    }
    const redirectRes = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${artifact.id}/zip`, {
      headers:{ 'Authorization': `Bearer ${TOKEN}` }, redirect:'manual'
    });
    const downloadUrl = redirectRes.headers.get('location');
    if(!downloadUrl) throw new Error('No download URL from GitHub');
    const fileRes = await fetch(downloadUrl);
    res.setHeader('Content-Disposition',`attachment; filename="${artifact.name}.zip"`);
    res.setHeader('Content-Type','application/zip');
    const {Readable} = require('stream');
    Readable.fromWeb(fileRes.body).pipe(res);
  }catch(e){ console.error(e); res.status(500).send(e.message); }
});

// Serve frontend
app.get('*',(req,res)=>{ res.sendFile(path.join(__dirname,'public','index.html')); });

const PORT = process.env.PORT||3000;
app.listen(PORT,()=>console.log(`🚀 247 Running on ${PORT}`));
