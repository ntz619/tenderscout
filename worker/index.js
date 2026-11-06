const FIELDS = ['id','status','label','relevance_likelihood_percent','short_summary','reasoning','source_link','application_deadline','publication_id','tender_sum','createdAt','updatedAt'];
async function equalSecret(a,b) {
  const encode=new TextEncoder();
  const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(a)),crypto.subtle.digest('SHA-256',encode.encode(b))]);
  const u=new Uint8Array(x),v=new Uint8Array(y);let diff=0;for(let i=0;i<u.length;i++)diff|=u[i]^v[i];return diff===0;
}
export function createWorker(upstreamFetch=(input,init)=>fetch(input,init)) {
  return {async fetch(request,env) {
    const origin=request.headers.get('Origin'),allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    if(origin&&allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    const path=new URL(request.url).pathname;
    if(path!=='/api/tenders')return respond({error:'Nicht gefunden.'},404);
    if(origin&&!allowed.includes(origin))return respond({error:'Diese Dashboard-Origin ist nicht freigegeben.'},403);
    if(request.method==='OPTIONS') {
      if(request.headers.get('Access-Control-Request-Method')!=='GET')return respond({error:'Nur lesender Zugriff ist erlaubt.'},405);
      return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization','Access-Control-Max-Age':'86400'}});
    }
    if(request.method!=='GET')return respond({error:'Nur lesender Zugriff ist erlaubt.'},405);
    if(!env.N8N_API_KEY||!env.DASHBOARD_TOKEN||env.DASHBOARD_TOKEN.length<32||!env.N8N_BASE_URL||!env.N8N_TABLE_ID||!allowed.length)return respond({error:'Worker-Konfiguration unvollständig. Secrets und Variablen prüfen.'},503);
    const auth=request.headers.get('Authorization')||'';
    if(!auth.startsWith('Bearer ')||auth.length>2048||!await equalSecret(auth.slice(7),env.DASHBOARD_TOKEN))return respond({error:'Dashboard-Zugangscode fehlt oder ist ungültig.'},401);
    let base;
    try{base=new URL(env.N8N_BASE_URL);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!base.hostname.endsWith('.app.n8n.cloud')||!/^[A-Za-z0-9]{16}$/.test(env.N8N_TABLE_ID))throw new Error();}catch{return respond({error:'n8n-Cloud-URL oder Table-ID ist ungültig.'},503);}
    const rows=[],seen=new Set();let cursor=null;
    const signal=AbortSignal.timeout(30000);
    try {
      for(let page=0;page<40;page++){
        const url=new URL(`/api/v1/data-tables/${env.N8N_TABLE_ID}/rows`,base);url.searchParams.set('limit','250');url.searchParams.set('sortBy','id:asc');if(cursor)url.searchParams.set('cursor',cursor);
        const response=await upstreamFetch(url,{method:'GET',headers:{'X-N8N-API-KEY':env.N8N_API_KEY,'Accept':'application/json'},redirect:'error',signal});
        if(!response.ok){const messages={401:'n8n lehnt den API-Schlüssel ab.',403:'Der n8n-API-Schlüssel hat keinen Lesezugriff auf diese Tabelle.',404:'Data Table oder Data-Table-API nicht gefunden. Table-ID und n8n-Version prüfen.',429:'n8n erhält zu viele Anfragen. Bitte später aktualisieren.'};return respond({error:messages[response.status]||'n8n ist momentan nicht verfügbar.'},502);}
        const data=await response.json();
        if(!Array.isArray(data.data)||data.data.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new Error('Invalid rows');
        for(const row of data.data)rows.push(Object.fromEntries(FIELDS.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]])));
        cursor=data.nextCursor;
        if(cursor==null||cursor==='')return respond({rows,fetchedAt:new Date().toISOString()});
        if(typeof cursor!=='string'||seen.has(cursor))throw new Error('Invalid pagination');seen.add(cursor);
      }
      return respond({error:'Die Tabelle überschreitet 10.000 Einträge. Bitte die Datenmenge begrenzen; es werden keine unvollständigen Ergebnisse angezeigt.'},502);
    }catch(err){return respond({error:signal.aborted?'Zeitlimit beim Laden aus n8n erreicht. Bitte erneut versuchen.':'n8n konnte nicht vollständig gelesen werden. Bitte API und Tabellenzugriff prüfen.'},502);}
  }};
}
export default createWorker();

