const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('docs/previews');
const mime={'.html':'text/html; charset=utf-8','.png':'image/png','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1:8094').pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname==='/')pathname='/kitchen-fonts.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
}).listen(8094,'127.0.0.1',()=>console.log('Font comparison: http://127.0.0.1:8094/kitchen-fonts.html'));
