const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const mime = { '.html':'text/html; charset=utf-8', '.png':'image/png', '.ttf':'font/ttf' };
http.createServer((req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1:8095').pathname); }
  catch { res.writeHead(400);res.end('Invalid path');return; }
  if(pathname==='/')pathname='/kitchen-backgrounds.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404);res.end('Not found');return;
  }
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(8095,'127.0.0.1',()=>console.log('Background previews: http://127.0.0.1:8095/kitchen-backgrounds.html'));
