import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scoreOf,colorOf,deadlineOf,parseCSV,sortRows,filterRows,safeUrl,toCSV } from '../docs/logic.js';
const row=n=>({relevance_likelihood_percent:n});
test('Ampel uses exact boundaries and ignores source ampel',()=>{
  for(const [n,c]of[[0,'red'],[49.99,'red'],[50,'yellow'],[69.99,'yellow'],[70,'green'],[100,'green']])assert.equal(colorOf({...row(n),ampel:'GRUEN'}),c);
  assert.equal(colorOf(row(45),40,60),'yellow');assert.equal(colorOf(row(60),40,60),'green');
});
test('Missing or invalid percentages stay unknown, never become zero',()=>{for(const n of['',null,undefined,'text',-1,101,{},true])assert.equal(scoreOf(row(n)),null);assert.equal(scoreOf(row('55 %')),55);assert.equal(scoreOf(row('55,5')),55.5);assert.equal(scoreOf(row(0)),0);});
test('German deadlines respect winter/summer time, date-only end of day and Paris',()=>{
  assert.equal(deadlineOf('17.11.2026, 12:00 Uhr, Europe/Berlin').toISOString(),'2026-11-17T11:00:00.000Z');
  assert.equal(deadlineOf('17.07.2026, 12:00 Uhr, Europe/Berlin').toISOString(),'2026-07-17T10:00:00.000Z');
  assert.equal(deadlineOf('16.11.2026, 12:00 Uhr, Europe/Paris').toISOString(),'2026-11-16T11:00:00.000Z');
  assert.equal(deadlineOf('19.11.2026').toISOString(),'2026-11-19T22:59:59.000Z');
  assert.equal(deadlineOf('31.02.2026'),null);assert.equal(deadlineOf('keine Angabe'),null);
});
test('CSV handles BOM, semicolons, escaped quotes, multiline, missing cells and errors',()=>{
  const data=parseCSV('\uFEFFrelevance_likelihood_percent;short_summary;id\r\n70;"Eine ""gute""\nZeile";1\r\n0;;2\r\n');
  assert.equal(data[0].short_summary,'Eine "gute"\nZeile');assert.equal(data[1].short_summary,'');
  assert.throws(()=>parseCSV('id,name\n1,test'));assert.throws(()=>parseCSV('relevance_likelihood_percent,short_summary\n70,"open'));assert.throws(()=>parseCSV('relevance_likelihood_percent,short_summary\n70,x,extra'));
});
test('sorting and filters preserve unknown-last behavior and deadline boundaries',()=>{
  const rows=[{...row(''),id:1},{...row(70),id:2,application_deadline:'10.11.2026'},{...row(10),id:3,application_deadline:'01.11.2026'}];
  assert.deepEqual(sortRows(rows).map(x=>x.id),[2,3,1]);assert.deepEqual(sortRows(rows,'score-asc').map(x=>x.id),[3,2,1]);
  assert.deepEqual(filterRows(rows,{deadline:'7'},50,70,new Date('2026-11-06T00:00:00Z')).map(x=>x.id),[2]);
  assert.equal(filterRows(rows,{colors:['red']}).length,1);assert.equal(filterRows(rows,{colors:[]}).length,0);assert.equal(filterRows(rows,{minScore:1}).length,2);
});
test('unsafe links and spreadsheet formulas are not executable',()=>{assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('https://example.org/'),'https://example.org/');assert.match(toCSV([{short_summary:'=1+1'}]),/"'=1\+1"/);});
test('all twelve real sample rows are normalized and sorted',async()=>{const rows=JSON.parse(await readFile(new URL('../docs/sample-data.json',import.meta.url),'utf8'));assert.equal(rows.length,12);assert.equal(scoreOf(sortRows(rows)[0]),70);assert.ok(rows.every(r=>deadlineOf(r.application_deadline)||!r.application_deadline));});
