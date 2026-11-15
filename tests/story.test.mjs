import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {buildStory,defaults,sections,validateProfile} from '../docs/story.mjs';
const story=buildStory(defaults);
test('the story keeps one word and five servers across the full progression',()=>{
 assert.equal(sections.length,5);
 for(const frame of story){assert.equal(frame.nodes.length,5);assert.equal(frame.client.value,'Hello')}
 for(const section of sections.slice(0,-1))assert.ok(story.some(f=>f.section===section.id));
 assert.equal(story.at(-1).tag,'recovered');
});
test('a candidate remains a candidate at two votes and becomes leader at three',()=>{
 const two=story.find(f=>f.tag==='two-votes').nodes[0];assert.equal(two.role,'Candidate');assert.equal(two.votes.length,2);
 const three=story.find(f=>f.tag==='elected').nodes[0];assert.equal(three.role,'Leader');assert.equal(three.votes.length,3);
});
test('every committed story entry has three recorded copies',()=>{
 for(const frame of story){if(frame.beforeRaft)continue;
 for(const n of frame.nodes){assert.ok(n.applied<=n.commit&&n.commit<=n.log.length,frame.tag);
 for(let i=0;i<n.commit;i++)assert.ok(frame.nodes.filter(peer=>peer.log[i]?.term===n.log[i].term&&peer.log[i]?.value===n.log[i].value).length>=3,frame.tag);
 if(n.applied)assert.equal(n.value,n.log[n.applied-1].value,frame.tag);
 }}
});
test('confirmation follows commitment and application, not first storage',()=>{
 assert.notEqual(story.find(f=>f.tag==='copies').client.status,'Saved');
 const commit=story.find(f=>f.tag==='commit');assert.equal(commit.nodes[0].applied,1);assert.notEqual(commit.client.status,'Saved');
 assert.equal(story.find(f=>f.tag==='confirmed').client.status,'Saved');
});
test('restart retains the log but rebuilds the working value',()=>{
 const restored=story.find(f=>f.tag==='restore').nodes[0];assert.equal(restored.log[0].value,'Hello');assert.equal(restored.value,null);assert.equal(restored.applied,0);
 assert.ok(story.at(-1).nodes.every(n=>n.value==='Hello'));
});
test('network failure is a running but disconnected server, with no reachable majority',()=>{
 const f=story.find(f=>f.tag==='network-failure');assert.equal(f.nodes[3].online,true);assert.equal(f.nodes[3].connected,false);
 assert.equal(f.nodes.filter(n=>n.online&&n.connected).length,2);
});
test('personalization validates one word and bounded friend names',()=>{
 assert.equal(validateProfile('Ari','Maya, Sam','Bonjour').profile.word,'Bonjour');
 assert.ok(validateProfile('Ari','Maya','two words').error);
 assert.ok(validateProfile('Ari','Maya','<script>').error);
 assert.ok(validateProfile('Ari','Maya','abcdefghijklmnop').error);
 assert.ok(validateProfile('Ari','a,b,c,d','Hello').error);
 assert.ok(validateProfile('Ari','Maya','नमस्ते').profile);
 const f=buildStory({sender:'Ari',friends:['Noor'],word:'Namaste'});
 assert.ok(f.find(x=>x.tag==='one-copy').text.includes('Noor'));assert.equal(f.at(-1).nodes[4].value,'Namaste');
});
test('the page uses bundled assets and navigation has no logo or repository link',()=>{
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/github\.com|class="wordmark"|assets\/map/);
 for(const m of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g))assert.ok(existsSync(new URL('../docs/'+m[1],import.meta.url)),m[1]);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 const script=readFileSync(new URL('../docs/app.mjs',import.meta.url),'utf8');
 for(const m of script.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),m[1]);
});
