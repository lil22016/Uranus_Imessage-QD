/** Cloudflare Pages device login. Session cookie is HMAC-signed, HttpOnly, Secure,
 * SameSite=Lax, and scoped to this host. No credentials are stored in browser JS.
 * FRONT_USER and FRONT_PASS remain Cloudflare Pages secrets.
 */
const COOKIE = 'uranus_device_session';
const TTL = 60 * 60 * 24 * 90;
const enc = new TextEncoder();
function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function unb64(s) { return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-s.length%4)%4)), c=>c.charCodeAt(0)); }
async function digest(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function equal(a,b) { const [x,y]=await Promise.all([digest(a),digest(b)]); let n=0; for(let i=0;i<x.length;i++)n|=x[i]^y[i];return n===0; }
async function signingKey(env) { return crypto.subtle.importKey('raw',enc.encode('uranus-pages-device-v1:'+env.FRONT_PASS),'HMAC',{hash:'SHA-256'},false,['sign','verify']); }
async function issue(env) {
 const payload=b64(enc.encode(JSON.stringify({v:1,exp:Math.floor(Date.now()/1000)+TTL,u:env.FRONT_USER})));
 const mac=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),enc.encode(payload))));
 return payload+'.'+mac;
}
async function valid(env,token) {
 try { const [payload,mac,...rest]=token.split('.'); if(rest.length||!payload||!mac)return false;
  const ok=await crypto.subtle.verify('HMAC',await signingKey(env),unb64(mac),enc.encode(payload));
  if(!ok)return false;const x=JSON.parse(new TextDecoder().decode(unb64(payload)));
  return x.v===1&&x.u===env.FRONT_USER&&Number.isFinite(x.exp)&&x.exp>Date.now()/1000;
 }catch{return false;}
}
function cookie(token) { return `${COOKIE}=${token}; Max-Age=${TTL}; Path=/; HttpOnly; Secure; SameSite=Lax`; }
function loginPage(error='') {return new Response(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Uranus · Unlock</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0b1019;color:#e7edf7;font:16px system-ui,sans-serif}main{width:min(360px,calc(100vw - 48px));padding:32px;border:1px solid #384358;border-radius:22px;background:#151d2b}h1{font-size:26px}label{display:block;margin:18px 0 7px}input{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:9px;border:1px solid #536078;background:#0e1521;color:white}button{width:100%;margin-top:24px;padding:13px;border:0;border-radius:10px;background:#b6cafa;color:#0b1019;font:600 16px system-ui}p{color:#b9c5d8;font-size:13px;line-height:1.6}.error{color:#ffb5b5}</style></head><body><main><h1>Uranus</h1><p>首次在此设备登录一次，之后自动解锁（有效期 90 天）。</p>${error?'<p class="error">账号或密码不正确，请重试。</p>':''}<form method="POST" action="/__device_login"><label>账号</label><input name="username" autocomplete="username" required autofocus><label>密码</label><input type="password" name="password" autocomplete="current-password" required><button>登录并记住此设备</button></form><p>清除浏览器网站数据、更换浏览器或修改 Cloudflare 密码后，需要重新登录。</p></main></body></html>`,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
export async function onRequest({request,env,next}) {
 const user=String(env.FRONT_USER??''),pass=String(env.FRONT_PASS??'');
 if(!user||!pass)return new Response('Cloudflare Pages 缺少 FRONT_USER / FRONT_PASS。',{status:503});
 const url=new URL(request.url);
 if(url.pathname==='/__device_login'){
  if(request.method!=='POST')return Response.redirect(url.origin+'/',303);
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return new Response('Forbidden',{status:403});
  const ct=request.headers.get('content-type')||'';if(!ct.includes('application/x-www-form-urlencoded'))return new Response('Bad request',{status:400});
  let form;try{form=await request.formData();}catch{return new Response('Bad request',{status:400});}
  if(await equal(String(form.get('username')??''),user)&&await equal(String(form.get('password')??''),pass)){
   const headers=new Headers({'location':'/','cache-control':'no-store'});headers.append('set-cookie',cookie(await issue(env)));
   return new Response(null,{status:303,headers});
  }
  return loginPage(true);
 }
 const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(token&&await valid(env,token))return next();
 if(request.method==='GET'&&request.headers.get('accept')?.includes('text/html'))return loginPage();
 return new Response('Authentication required',{status:401,headers:{'cache-control':'no-store'}});
}
