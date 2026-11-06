import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/index.js';
const origin='https://ntz619.github.io',secret='a'.repeat(48),env={N8N_API_KEY:'upstream-secret',DASHBOARD_TOKEN:secret,N8N_BASE_URL:'https://tenderautomation.app.n8n.cloud',N8N_TABLE_ID:'nSw53udgNius49RS',ALLOWED_ORIGINS:origin};
const request=(overrides={})=>new Request('https://test.workers.dev/api/tenders',{headers:{Origin:origin,Authorization:'Bearer '+secret},...overrides});
test('Worker denies requests before contacting n8n',async()=>{let calls=0;const w=createWorker(async()=>{calls++;throw new Error();});assert.equal((await w.fetch(request({headers:{Origin:origin}}),env)).status,401);assert.equal((await w.fetch(request({headers:{Origin:'https://evil.example',Authorization:'Bearer '+secret}}),env)).status,403);assert.equal((await w.fetch(request({method:'POST'}),env)).status,405);assert.equal(calls,0);});
test('preflight returns exact allowed origin and no secrets',async()=>{const response=await createWorker().fetch(request({method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET'}}),env);assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(response.headers.get('Access-Control-Allow-Headers'),'Authorization');});
test('all cursor pages are fetched; credentials stay server-side and ampel is discarded',async()=>{
  const calls=[];const w=createWorker(async(url,options)=>{calls.push({url:String(url),options});return Response.json(calls.length===1?{data:[{id:1,short_summary:'test',ampel:'ROT',unexpected_secret:'hidden'}],nextCursor:'cursor+1'}:{data:[{id:2,relevance_likelihood_percent:70}],nextCursor:null});});
  const response=await w.fetch(request(),env),body=await response.json();assert.equal(response.status,200);assert.equal(body.rows.length,2);assert.equal(body.rows[0].ampel,undefined);assert.equal(body.rows[0].unexpected_secret,undefined);assert.equal(calls[0].options.headers['X-N8N-API-KEY'],'upstream-secret');assert.equal(new URL(calls[1].url).searchParams.get('cursor'),'cursor+1');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.ok(!JSON.stringify(body).includes('upstream-secret'));
});
test('repeating cursors and failed pages return errors instead of partial results',async()=>{let calls=0;const repeat=createWorker(async()=>{calls++;return Response.json({data:[{id:1}],nextCursor:'same'});});assert.equal((await repeat.fetch(request(),env)).status,502);assert.equal(calls,2);const fail=createWorker(async()=>new Response('secret upstream diagnostic',{status:403}));const res=await fail.fetch(request(),env);assert.equal(res.status,502);assert.ok(!(await res.text()).includes('secret upstream diagnostic'));});
test('incomplete config fails closed',async()=>{assert.equal((await createWorker().fetch(request(),{...env,DASHBOARD_TOKEN:''})).status,503);});
test('trial webhook mode reads the table without an n8n API key',async()=>{
  const webhookEnv={...env,N8N_API_KEY:undefined,N8N_WEBHOOK_URL:'https://tenderautomation.app.n8n.cloud/webhook/tenderscout-read',N8N_WEBHOOK_TOKEN:'b'.repeat(48)};
  let received;
  const w=createWorker(async(url,options)=>{received={url:String(url),options};return Response.json({rows:[{id:1,short_summary:'Trial works',relevance_likelihood_percent:70,ampel:'ROT'}]});});
  const result=await w.fetch(request(),webhookEnv),body=await result.json();assert.equal(result.status,200);assert.equal(body.rows.length,1);assert.equal(body.rows[0].ampel,undefined);assert.equal(received.options.headers['X-TenderScout-Token'],webhookEnv.N8N_WEBHOOK_TOKEN);assert.equal(received.options.headers['X-N8N-API-KEY'],undefined);
  assert.equal((await w.fetch(request(),{...webhookEnv,N8N_WEBHOOK_URL:'https://different.app.n8n.cloud/webhook/x'})).status,503);
  assert.equal((await w.fetch(request(),{...webhookEnv,N8N_WEBHOOK_TOKEN:''})).status,503);
});
test('empty webhook tables return an empty result and disabled webhooks report actionable errors',async()=>{
  const webhookEnv={...env,N8N_API_KEY:undefined,N8N_WEBHOOK_URL:'https://tenderautomation.app.n8n.cloud/webhook/tenderscout-read',N8N_WEBHOOK_TOKEN:'b'.repeat(48)};
  const empty=await createWorker(async()=>Response.json({rows:[]})).fetch(request(),webhookEnv);assert.deepEqual((await empty.json()).rows,[]);
  const missing=await createWorker(async()=>new Response('not active',{status:404})).fetch(request(),webhookEnv);assert.equal(missing.status,502);assert.match((await missing.json()).error,/Workflow veröffentlichen/);
});
