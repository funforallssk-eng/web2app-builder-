const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'funforallssk-eng/web2app-builder';

app.get('/', (req,res)=>{
  res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:Arial;max-width:600px;margin:30px auto;padding:20px;background:#f5f5f5}
  .card{background:#fff;padding:25px;border-radius:12px}input{width:100%;padding:12px;margin:8px 0;border:1px solid #ddd;border-radius:8px}
  button{width:100%;padding:15px;background:#000;color:#fff;border:0;border-radius:8px;font-size:18px}</style></head>
  <body><div class="card"><h1>🚀 Web2App Builder - CLEAN</h1>
  <input id="url" value="http://store.cheapodeal.com.au/"><input id="appName" value="CheapoDeal">
  <input id="packageName" value="com.cheapodeal.store">
  <button onclick="build()">Build APK + AAB</button><pre id="s" style="background:#f0f0f0;padding:12px;margin-top:15px;white-space:pre-wrap"></pre>
  <p><a href="https://github.com/${GITHUB_REPO}/actions" target="_blank">View Builds</a></p></div>
  <script>async function build(){
    const b={url:url.value,appName:appName.value,packageName:packageName.value};
    s.innerText='Starting...';const r=await fetch('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
    s.innerText=JSON.stringify(await r.json(),null,2);
  }</script></body></html>`);
});

app.post('/api/build', async (req,res)=>{
  const {url,appName,packageName}=req.body; const buildId=Date.now().toString();
  const r=await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`,{
    method:'POST',headers:{'Authorization':`token ${GITHUB_TOKEN}`,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},
    body:JSON.stringify({ref:'main',inputs:{url,appName,packageName,buildId}})
  });
  if(r.status===204) res.json({success:true,buildId,message:'Build started! Check GitHub Actions'});
  else res.json({error:await r.text(),status:r.status});
});
app.listen(process.env.PORT||3000,()=>console.log('READY'));
