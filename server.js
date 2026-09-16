const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// === CONFIG - NEW CLEAN REPO ===
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'funforallssk-eng/web2app-builder';
const PORT = process.env.PORT || 3000;

// Home Page
app.get('/', (req,res)=>{
  res.send(`
  <html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Web2App Builder</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:700px;margin:30px auto;padding:20px;background:#f5f5f5}
      .card{background:#fff;padding:30px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.1)}
      h1{margin-top:0}
      input{width:100%;padding:14px;margin:10px 0;border:1px solid #ddd;border-radius:10px;box-sizing:border-box;font-size:16px}
      button{width:100%;padding:16px;background:#000;color:#fff;border:0;border-radius:10px;font-size:18px;font-weight:bold;cursor:pointer;margin-top:10px}
      button:hover{background:#222}
      .debug{margin-top:30px;padding:20px;background:#111;color:#fff;border-radius:10px}
      .debug h2{margin:0 0 10px 0}
      pre{background:#f0f0f0;padding:15px;border-radius:8px;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow:auto;margin-top:15px}
      a{color:#000}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>🚀 Web2App Builder</h1>
      <p>Convert any website to APK + AAB</p>
      
      <label>Website URL</label>
      <input id="url" placeholder="https://example.com" value="http://store.cheapodeal.com.au/">
      
      <label>App Name</label>
      <input id="appName" placeholder="My App" value="CheapoDeal">
      
      <label>Package Name</label>
      <input id="packageName" placeholder="com.company.app" value="com.cheapodeal.store">
      
      <button onclick="buildApp()">🔨 Build APK + AAB</button>
      
      <pre id="status">Ready to build...</pre>
      
      <p style="text-align:center;margin-top:20px">
        <a href="https://github.com/${GITHUB_REPO}/actions" target="_blank">📂 View All Builds on GitHub</a>
      </p>

      <div class="debug">
        <h2>Debug Mode</h2>
        <div>Repo: ${GITHUB_REPO}</div>
        <div>Token exists: ${GITHUB_TOKEN ? 'YES' : 'NO - Add GITHUB_TOKEN in Render'}</div>
        <button onclick="testConnection()" style="background
