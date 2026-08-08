import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist/index.html");
const BOOK = readFileSync("/tmp/book.md","utf8");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9338;
const proc = spawn(CHROME, ["--headless=new","--disable-gpu","--no-sandbox","--allow-file-access-from-files",`--remote-debugging-port=${PORT}`,"--default-window-size=1280,900","about:blank"], { stdio:["ignore","ignore","ignore"] });
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let ws, nextId=1, pending=new Map(), loadFired=false;
  const logs=[];
  try{
    let target; for(let i=0;i<60;i++){ try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const a=await r.json();target=a.find(x=>x.type==="page");if(target)break;}catch(e){} await sleep(200);}
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{ws.addEventListener("open",res);ws.addEventListener("error",rej);});
    ws.addEventListener("message",(ev)=>{const m=JSON.parse(ev.data);
      if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
      if(m.method==="Page.loadEventFired")loadFired=true;
      if(m.method==="Runtime.consoleAPICalled")logs.push("CONSOLE."+m.params.type+": "+m.params.args.map(a=>a.value||a.description||"").join(" ").slice(0,200));
      if(m.method==="Runtime.exceptionThrown")logs.push("EXC: "+(m.params.exceptionDetails.text+" "+(m.params.exceptionDetails.exception?.description||"")).slice(0,300));
    });
    const send=(method,params={})=>new Promise((res)=>{const id=nextId++;pending.set(id,res);ws.send(JSON.stringify({id,method,params}));});
    await send("Runtime.enable"); await send("Page.enable");
    await send("Page.navigate",{url:"file://"+DIST});
    for(let i=0;i<100&&!loadFired;i++) await sleep(100);
    await sleep(1500);
    // 灌真实书 → 触发 input → 轮询预览是否渲染了书内容（含 "QUANTUM MANY-PARTICLE"），真实计时
    const expr = `(async()=>{
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      const ed=document.getElementById('editor'); if(!ed)return JSON.stringify({err:"no editor"});
      const book=${JSON.stringify(BOOK)};
      const t0=performance.now();
      ed.value=book;
      ed.dispatchEvent(new Event('input',{bubbles:true}));
      const prev=document.getElementById('preview');
      let done=false,tDone=0;
      for(let i=0;i<600;i++){ // 最多 30s
        await wait(50);
        const txt=prev.textContent||"";
        if(txt.includes("QUANTUM MANY-PARTICLE") && prev.innerHTML.length>50000){done=true;tDone=performance.now()-t0;break;}
      }
      const probe=document.getElementById('editor-yprobe');
      const vc=prev.querySelector('.vcontent');
      return JSON.stringify({done, tMs:Math.round(tDone||performance.now()-t0),
        previewHtmlLen:prev.innerHTML.length, hasVcontent:!!vc, vcontentChildren:vc?vc.children.length:0,
        probeChildren:probe?probe.children.length:0, previewHasBook:(prev.textContent||"").includes("QUANTUM MANY-PARTICLE")});
    })()`;
    const r=await send("Runtime.evaluate",{expression:expr,awaitPromise:true,returnByValue:true});
    console.log("=== 真实 dist 渲染真实书(1.32MB/14847行/~11k公式) 计时 ===");
    console.log(r.result?.result?.value);
    if(r.result?.exceptionDetails) console.log("EVAL异常:", JSON.stringify(r.result.exceptionDetails).slice(0,400));
    if(logs.length) console.log("=== console/exceptions ===\n"+logs.slice(0,15).join("\n"));
  }catch(e){console.log("ERR",e.message);}finally{try{ws.close();}catch(e){}proc.kill("SIGTERM");process.exit(0);}
})();
