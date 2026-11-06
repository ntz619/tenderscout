export function scoreOf(row) {
  const raw = row.relevance_likelihood_percent;
  if (raw == null || String(raw).trim() === '') return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const n = Number(String(raw).trim().replace(/\s*%$/, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
export function colorOf(row, yellow = 50, green = 70) {
  const score = scoreOf(row);
  return score == null ? 'unknown' : score < yellow ? 'red' : score < green ? 'yellow' : 'green';
}
export function safeUrl(value) {
  try { const u = new URL(String(value)); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function sourceOf(row) { try { return new URL(safeUrl(row.source_link)).hostname.replace(/^www\./, ''); } catch { return ''; } }
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const wallParts = (date, timeZone) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
export function deadlineOf(value) {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s*(\d{1,2}):(\d{2})(?:\s*Uhr)?)?(?:,?\s*(Europe\/[A-Za-z_]+|UTC[+-]\d{2}:\d{2}))?$/);
  if (m) {
    const [,d,mo,y,h,mi,zone] = m; const hour = h == null ? 23 : Number(h), minute = mi == null ? 59 : Number(mi), second = h == null ? 59 : 0;
    const wall = Date.UTC(+y,+mo-1,+d,hour,minute,second);
    const check = new Date(wall);
    if (hour>23||minute>59||check.getUTCDate()!==+d||check.getUTCMonth()!==+mo-1) return null;
    if(zone?.startsWith('UTC')) {
      const offset=zone.match(/^UTC([+-])(\d{2}):(\d{2})$/);
      if(!offset||+offset[2]>23||+offset[3]>59)return null;
      return new Date(wall-(offset[1]==='+'?1:-1)*(Number(offset[2])*60+Number(offset[3]))*60000);
    }
    let utc = wall;
    try { for(let i=0;i<3;i++){ const p=wallParts(new Date(utc),zone||'Europe/Berlin'); utc += wall-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second); } } catch { return null; }
    const p=wallParts(new Date(utc),zone||'Europe/Berlin');
    return p.hour===hour&&p.day===+d&&p.minute===minute ? new Date(utc) : null;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return deadlineOf(`${iso[3]}.${iso[2]}.${iso[1]}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  const date = new Date(s); return Number.isNaN(date.getTime()) ? null : date;
}
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/,'');
  let quoted = false, first='';
  for(let i=0;i<text.length;i++){if(text[i]==='"')quoted=!quoted; if(!quoted&&/[\r\n]/.test(text[i]))break; first+=text[i];}
  const delimiter = (first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length ? ';' : ',';
  const records=[]; let row=[],field=''; quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){ if(quoted&&text[i+1]==='"'){field+='"';i++;} else if(quoted||field==='')quoted=!quoted; else field+=c; }
    else if(c===delimiter&&!quoted){row.push(field);field='';}
    else if((c==='\r'||c==='\n')&&!quoted){row.push(field);if(row.some(v=>v.trim()))records.push(row);row=[];field='';if(c==='\r'&&text[i+1]==='\n')i++;}
    else field+=c;
  }
  if(quoted)throw new Error('Die CSV enthält ein nicht geschlossenes Anführungszeichen.');
  row.push(field);if(row.some(v=>v.trim()))records.push(row);
  const headers=records.shift()?.map(x=>x.trim());
  if(!headers?.includes('relevance_likelihood_percent')||!headers.includes('short_summary'))throw new Error('CSV benötigt relevance_likelihood_percent und short_summary.');
  if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw new Error('Die CSV-Spaltennamen müssen eindeutig und nicht leer sein.');
  return records.map((cells,i)=>{if(cells.length!==headers.length)throw new Error(`CSV-Zeile ${i+2}: falsche Anzahl an Feldern.`);return Object.fromEntries(headers.map((h,j)=>[h,cells[j]]));});
}
export function toCSV(rows) {
  const keys=[...new Set(rows.flatMap(Object.keys))];
  const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,m=>"'"+m).replace(/"/g,'""')+'"';
  return '\uFEFF'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\r\n');
}
export function filterRows(rows, filters, yellow=50, green=70, now=new Date()) {
  const query=(filters.search||'').toLocaleLowerCase('de');
  return rows.filter(r=>{
    if(query&&!Object.values(r).some(v=>String(v??'').toLocaleLowerCase('de').includes(query)))return false;
    if(filters.colors&&!filters.colors.includes(colorOf(r,yellow,green)))return false;
    if(filters.minScore>0&&(scoreOf(r)==null||scoreOf(r)<filters.minScore))return false;
    if(filters.status&&r.status!==filters.status)return false;
    if(filters.source&&sourceOf(r)!==filters.source)return false;
    if(filters.label&&r.label!==filters.label)return false;
    const date=deadlineOf(r.application_deadline), ms=date?.getTime(), t=now.getTime(), mode=filters.deadline;
    if(mode==='missing')return !date;
    if(mode==='open')return date&&ms>=t;
    if(mode==='expired')return date&&ms<t;
    if(mode==='7'||mode==='30')return date&&ms>=t&&ms<=t+Number(mode)*86400000;
    return true;
  });
}
export function sortRows(rows, mode='score-desc') {
  return [...rows].sort((a,b)=>{
    if(mode==='deadline'){const x=deadlineOf(a.application_deadline)?.getTime()??Infinity,y=deadlineOf(b.application_deadline)?.getTime()??Infinity;return x===y?0:x-y;}
    if(mode==='newest')return (Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0);
    const x=scoreOf(a),y=scoreOf(b);if(x==null)return y==null?0:1;if(y==null)return -1;return mode==='score-asc'?x-y:y-x;
  });
}
