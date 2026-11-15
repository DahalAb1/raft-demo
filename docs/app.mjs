import {sections,defaults,validateProfile,buildStory} from './story.mjs';
import {Cluster,names} from './cluster.mjs';
import {ClusterView,escapeHTML as esc} from './cluster-view.mjs';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let profile=structuredClone(defaults),frames,index=0,section='introduction',cluster=null,playing=false,last=0,transition=null,raf=null,eventId=-1,inspectorSignature='';
try{const saved=JSON.parse(sessionStorage.getItem('raft-profile'));if(saved){const parsed=validateProfile(saved.sender,saved.friends.join(','),saved.word);if(parsed.profile)profile=parsed.profile}}catch{}
frames=buildStory(profile);
const view=new ClusterView($('diagram'));
const contexts={introduction:'First, the problem these servers need to solve.','leader-election':'Before saving the word, the group needs a coordinator.',persistence:'A leader is chosen. Now, what makes a save trustworthy?',failure:'The word is saved. Let’s test what happens when something breaks.',experiment:'Use what you learned. Send a word, interrupt a server, and watch.'};
function fillSetup(){$('sender').value=profile.sender;$('friends').value=profile.friends.join(', ');$('word').value=profile.word}
fillSetup();
function saveProfile(){try{sessionStorage.setItem('raft-profile',JSON.stringify(profile))}catch{}}
function frame(){return frames[index]}
function stopAnimation(){transition=null;last=0;if(raf!==null)cancelAnimationFrame(raf);raf=null}
function updateNav(){for(const a of document.querySelectorAll('[data-section]')){if(a.dataset.section===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}}
function setHash(){if(location.hash!==`#${section}`)history.replaceState(null,'',`#${section}`)}
function showSection(id,{hash=true}={}){
 if(!sections.some(s=>s.id===id))id='introduction';stopAnimation();section=id;
 if(id==='experiment'){cluster=new Cluster({seeded:true,value:profile.word});playing=!reduced.matches;eventId=-1;render();if(playing)schedule()}
 else{playing=false;index=frames.findIndex(f=>f.section===id);render()}
 if(hash)setHash();
}
function inspector(state){
 if(!$('details').open)return;
 const signature=JSON.stringify(state.nodes.map(n=>[n.term,n.role,n.log,n.applied,n.commit]));if(signature===inspectorSignature)return;inspectorSignature=signature;
 $('inspector').innerHTML=state.nodes.map(n=>`<div><h3>${n.name}</h3><p>Term ${n.term} · ${n.role}<br>Agreed ${n.commit} · applied ${n.applied}</p>${n.log.length?n.log.map((e,i)=>`<span class="entry ${i>=n.applied?'pending':''}">${i+1}. ${esc(e.value)}<br>${i<n.applied?(e.accepted===false?'Version rejected':'Applied'):i<n.commit?'Agreed':'Stored'}</span>`).join(''):'<p>No log entries yet</p>'}</div>`).join('');
}
function render(){
 const experiment=section==='experiment',f=experiment?null:frame(),visual=transition?.previous||f;updateNav();
 $('section-context').textContent=contexts[section];$('scene-title').textContent=experiment?'What happens if you change the conditions?':f.title;
 const setup=!experiment&&index===0;
 $('setup').hidden=!setup;$('opening-context').hidden=!setup;$('message-context').hidden=setup;
 $('message-context-text').textContent=`${profile.sender} → ${profile.friends.join(', ')} · “${profile.word}”`;
 $('story-controls').hidden=experiment;$('experiment-controls').hidden=!experiment;
 if(experiment){renderExperiment();return}
 $('explanation-text').textContent=setup?'Name your friends or use the examples above. Choose one word, then send it. We’ll follow what happens inside the servers, one step at a time.':f.text;
 $('opening-context').textContent=frames[0].text;
 $('diagram-label').textContent=visual.beforeRaft?'Before coordination · five separate copies':'Raft · five servers, one group';
 $('diagram-status').textContent=visual.client.status;
 $('majority').hidden=!visual.meter;if(visual.meter){$('majority-label').textContent=visual.meter.label;$('majority-value').textContent=visual.meter.value;$('majority-note').textContent=visual.meter.note}
 $('previous').disabled=index===0||!!transition;$('next').disabled=!!transition;
 $('next').textContent=transition?'Watch the exchange…':f.action+' →';
 $('next').type=setup?'submit':'button';if(setup)$('next').setAttribute('form','setup');else $('next').removeAttribute('form');
 $('replay').hidden=!f.messages.length;$('replay').disabled=!!transition;
 view.render(visual,profile,{messages:f.messages,progress:transition?0:1,reduced:reduced.matches});inspector(visual);
 $('detail-explanation').textContent=f.beforeRaft?'The introduction imagines copies that have not coordinated yet. It is the problem Raft will solve, not a demonstration of a successful Raft read.':'Follower, candidate, and leader are roles of the same computers. A stored proposal is not necessarily committed. A committed operation still has to be applied before it becomes the current message. Votes use log freshness checks, not the popularity of a server.';
}
function animateTo(next){
 const previous=structuredClone(frame());index=next;section=frame().section;setHash();
 if(reduced.matches||!frame().messages.length){render();return}
 transition={previous:exchangeStart(previous,frame()),elapsed:0};render();schedule();
}
// Starting an election or restarting is local; receiving a vote or a copy
// takes effect only after its message has arrived.
function exchangeStart(previous,current){return structuredClone(['candidate','reelection','request','restore'].includes(current.tag)?current:previous)}
function advance(){if(transition)return;if(index===frames.length-1){showSection('experiment');return}animateTo(index+1)}
function renderExperiment(){
 $('scene-title').textContent='Try a change. See how the group responds.';
 const reachable=cluster.nodes.filter(n=>n.online&&n.connected).length;
 $('diagram-label').textContent='Select a circle to control that server';$('diagram-status').textContent=playing?'Running · messages slowed down':'Paused';
 const latest=cluster.events[0];if(latest.id!==eventId){$('explanation-text').textContent=latest.text;eventId=latest.id}
 $('majority').hidden=false;$('majority-label').textContent='Servers able to communicate';$('majority-value').textContent=`${reachable} of 5`;$('majority-note').textContent=reachable>=3?'3 needed to agree':'New saves must wait for a majority';
 view.render({...cluster,showRoles:true,showLogs:false},profile,{interactive:true,messages:cluster.messages,progress:.5,reduced:reduced.matches});
 $('pause').textContent=playing?'Pause':'Resume';$('stop-leader').disabled=!cluster.leader;$('restore-all').disabled=cluster.nodes.every(n=>n.online&&n.connected);$('send-word').disabled=!!cluster.client.pending;
 const pending=cluster.client.pending;
 $('experiment-feedback').textContent=pending?(reachable<3?'Waiting for a majority. Restore a server or its connection.':`Waiting for “${pending.value}” to be agreed and confirmed.`):`${cluster.client.status}: “${cluster.client.value}”.`;
 const selected=cluster.nodes[Number($('selected-server').value)];
 $('toggle-power').textContent=`${selected.online?'Stop':'Restart'} ${selected.name}`;$('toggle-network').textContent=`${selected.connected?'Disconnect':'Reconnect'} ${selected.name}`;
 inspector(cluster);$('detail-explanation').textContent='Blue messages carry requests, copies, acknowledgments, and heartbeats. Amber carries votes. The label above the circles names the current exchange. If a server is disconnected, it may still believe it is leader until it hears a newer term; it cannot confirm a new write alone.';
}
function schedule(){if(raf===null)raf=requestAnimationFrame(tick)}
function tick(now){raf=null;if(document.hidden){last=0;return}
 const dt=last?Math.min(80,now-last):0;last=now;
 if(transition){transition.elapsed+=dt;const progress=Math.min(1,transition.elapsed/1800);view.render(transition.previous,profile,{messages:frame().messages,progress,reduced:reduced.matches});if(progress>=1){transition=null;last=0;render()}else schedule()}
 else if(section==='experiment'&&playing){cluster.step(dt);renderExperiment();schedule()}
}
$('setup').addEventListener('submit',e=>{e.preventDefault();const result=validateProfile($('sender').value,$('friends').value,$('word').value);$('setup-error').hidden=!result.error;if(result.error){$('setup-error').textContent=result.error;return}profile=result.profile;saveProfile();frames=buildStory(profile);advance()});
$('next').addEventListener('click',()=>{if(index!==0)advance()});
$('previous').addEventListener('click',()=>{if(!index)return;stopAnimation();index--;section=frame().section;setHash();render()});
$('replay').addEventListener('click',()=>{if(transition||!index)return;if(reduced.matches){render();return}transition={previous:exchangeStart(frames[index-1],frame()),elapsed:0};render();schedule()});
$('random-friends').addEventListener('click',()=>{const options=['Maya','Sam','Noor','Ari','Jules','Isha','Leo','Nina','Kai','Remy'];for(let i=options.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[options[i],options[j]]=[options[j],options[i]]}$('friends').value=options.slice(0,3).join(', ')});
$('edit-message').addEventListener('click',()=>{showSection('introduction');$('word').focus()});
for(const a of document.querySelectorAll('[data-section]'))a.addEventListener('click',e=>{e.preventDefault();showSection(a.dataset.section)});
window.addEventListener('hashchange',()=>{if(location.hash!=='#main')showSection(location.hash.slice(1),{hash:false})});
$('experiment-form').addEventListener('submit',e=>{e.preventDefault();const word=$('experiment-word').value.trim();if(!/^[\p{L}\p{M}\p{N}]{1,14}$/u.test(word)){$('experiment-feedback').textContent='Use one word of 1–14 letters or numbers.';return}cluster.save(word);renderExperiment()});
$('pause').addEventListener('click',()=>{playing=!playing;last=0;renderExperiment();if(playing)schedule()});
$('stop-leader').addEventListener('click',()=>{if(cluster.leader)cluster.toggle(cluster.leader.id);renderExperiment()});
$('restore-all').addEventListener('click',()=>{for(const n of cluster.nodes){if(!n.online)cluster.toggle(n.id);if(!n.connected)cluster.disconnect(n.id)}renderExperiment()});
$('reset').addEventListener('click',()=>showSection('experiment'));
$('selected-server').addEventListener('change',renderExperiment);
$('diagram').addEventListener('click',e=>{const b=e.target.closest('[data-server]');if(section==='experiment'&&b){$('selected-server').value=b.dataset.server;renderExperiment();$('toggle-power').focus({preventScroll:true})}});
$('toggle-power').addEventListener('click',()=>{cluster.toggle(Number($('selected-server').value));renderExperiment()});
$('toggle-network').addEventListener('click',()=>{cluster.disconnect(Number($('selected-server').value));renderExperiment()});
$('details').addEventListener('toggle',()=>{if($('details').open){if(section==='experiment'){playing=false;renderExperiment()}inspector(section==='experiment'?cluster:frame())}});
reduced.addEventListener('change',()=>{playing=false;stopAnimation();render()});
document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden){if(raf!==null)cancelAnimationFrame(raf);raf=null}else if(transition||(section==='experiment'&&playing))schedule()});
showSection(location.hash.slice(1)||'introduction',{hash:false});
