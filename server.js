const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder';
const PORT = process.env.PORT || 3000;

app.get('/', (req,res)=>{
  const html = `
  <html>
  <head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Web2App Builder</title>
  <style>body{font-family:Arial;max-width:700px;margin:30px auto;padding:20px;background:#f5f5f5}.card{background:#fff;padding:30px;border-radius:16px}input{width:100%;padding:14px;margin:10px 0;border:1px solid #ddd;border-radius:10px;box-sizing:border-box}button{width:100%;padding:16px;background:#000;color:#fff;border:0;border-radius:10px;font-size:18px;font-weight:bold;cursor:pointer;margin-top:10px}.debug{margin-top:30px;padding:20px;background:#111;color:#fff;border-radius:10px}pre{background:#f0f0f0;padding:15px;border-radius:8px;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow:auto}</style>
  </head>
  <body><div class="card">
  <h1>Web2App Builder - FIXED</h1>
  <p>Convert any website to APK + AAB</p>
  <input id="url" placeholder="https://example.com" value="http://store.cheapodeal.com.au/">
  <input id="appName" placeholder="My App" value="CheapoDeal">
  <input id="packageName" placeholder="com.company.app" value="com.cheapodeal.store">
  <button onclick="buildApp()">Build APK + AAB</button>
  <pre id="status">Ready...</pre>
  <p style="text-align:center"><a href="https://github.com/` + GITHUB_REPO + `/actions" target="_blank">View Builds on GitHub</a></p>
  <div class="debug"><h2>Debug Mode</h2><div>Repo: ` + GITHUB_REPO + `</div><div>Token exists: ` + (GITHUB_TOKEN ? 'YES' : 'NO') + `</div><button onclick="testConnection()" style="background:#fff;color:#000;margin-top:15px">TEST GITHUB CONNECTION</button><pre id="debugResult" style="background:#222;color:#0f0"></pre></div>
  </div>
  <script>
  async function buildApp(){
    const body={url:document.getElementById('url').value,appName:document.getElementById('appName').value,packageName:document.getElementById('packageName').value};
    document.getElementById('status').innerText='Starting build...';
    const r=await fetch('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    document.getElementById('status').innerText=JSON.stringify(d,null,2);
  }
  async function testConnection(){
    document.getElementById('debugResult').innerText='Testing...';
    const r=await fetch('/api/debug');const d=await r.json();
    document.getElementById('debugResult').innerText=JSON.stringify(d,null,2);
  }
  </script></body></html>`;
  res.send(html);
});

app.get('/api/debug', async (req,res)=>{
  try{
    if(!GITHUB_TOKEN) return res.json({repo:GITHUB_REPO,token_exists:false,error:"GITHUB_TOKEN not set"});
    const listUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/actions/workflows';
    const listRes = await fetch(listUrl,{headers:{'Authorization':'token '+GITHUB_TOKEN,'Accept':'application/vnd.github.v3+json'}});
    const listText = await listRes.text();
    let listJson; try{listJson=JSON.parse(listText);}catch{listJson={raw:listText};}
    const workflowsFound = listJson.workflows ? listJson.workflows.map(w=>({name:w.name,path:w.path})) : [];
    res.json({repo:GITHUB_REPO,token_exists:true,workflows_status:listRes.status,workflows_found:workflowsFound,hint:listRes.status===200?"SUCCESS":"Failed - Make repo PUBLIC and token has repo + workflow scope"});
  }catch(e){res.json({repo:GITHUB_REPO,error:e.message});}
});

app.post('/api/build', async (req,res)=>{
  try{
    const url=req.body.url;const appName=req.body.appName;const packageName=req.body.packageName;
    if(!url||!appName||!packageName) return res.status(400).json({error:"Missing fields"});
    if(!GITHUB_TOKEN) return res.status(500).json({error:"GITHUB_TOKEN not set"});
    const buildId=Date.now().toString();
    const githubRes=await fetch('https://api.github.com/repos/' + GITHUB_REPO + '/actions/workflows/build.yml/dispatches',{
      method:'POST',
      headers:{'Authorization':'token '+GITHUB_TOKEN,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},
      body:JSON.stringify({ref:'main',inputs:{url,appName,packageName,buildId}})
    });
    if(githubRes.status===204){
      res.json({success:true,buildId,repo:GITHUB_REPO,message:'Build triggered! Check GitHub Actions - takes 4 mins',githubActionsUrl:'https://github.com/'+GITHUB_REPO+'/actions'});
    }else{
      const errorText=await githubRes.text();
      res.status(githubRes.status).json({success:false,status:githubRes.status,error:errorText});
    }
  }catch(e){res.status(500).json({error:e.message});}
});

app.listen(PORT,()=>console.log('Server running on '+PORT+' Repo: '+GITHUB_REPO));
