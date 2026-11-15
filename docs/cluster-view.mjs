import { names } from './cluster.mjs';
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svgNS='http://www.w3.org/2000/svg';
export class ClusterView {
  constructor(root) {
    this.root=root;
    root.innerHTML=`<div class="person sender"><span class="avatar" aria-hidden="true"></span><div><span class="person-name"></span><small>Your app</small></div><strong class="person-word"></strong></div><div class="person recipients"><span class="friend-avatars" aria-hidden="true">● ● ●</span><div><span class="person-name"></span><small>Your friends’ apps</small></div><strong class="person-word"></strong></div><svg class="wires" aria-hidden="true"><defs><marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 L8 5 L1 9" fill="none" stroke="context-stroke" stroke-width="1.6"/></marker></defs><g class="packet-layer"></g></svg><div class="node-layer">${names.map((name,i)=>`<article class="node-card" data-node="${i}"><span class="node-role"></span><button class="node-circle" data-server="${i}" disabled aria-label="${name}"><strong>${name}</strong><span class="node-word">—</span></button><span class="node-status"></span><span class="node-record"></span></article>`).join('')}</div><div class="traffic-label" aria-hidden="true"></div>`;
    this.cards=[...root.querySelectorAll('.node-card')];
    this.resize=()=>{if(this.state)this.render(this.state,this.profile,this.options)};
    new ResizeObserver(this.resize).observe(root);
  }
  render(state,profile,options={}) {
    this.state=state;this.profile=profile;this.options=options;
    const {interactive=false,messages=state.messages || [],progress=1,reduced=false}=options;
    const mobile=this.root.clientWidth<610;
    const positions=mobile?[[180,200],[500,200],[820,200],[330,340],[670,340]]:[[100,220],[300,220],[500,220],[700,220],[900,220]];
    this.root.classList.toggle('mobile-diagram',mobile);
    this.root.querySelector('.sender .person-name').textContent=profile.sender;
    this.root.querySelector('.sender .avatar').textContent=profile.sender[0].toUpperCase();
    this.root.querySelector('.recipients .person-name').textContent=profile.friends.join(', ');
    this.root.querySelector('.sender .person-word').textContent=state.client?.pending?.value || state.client?.value || profile.word;
    this.root.querySelector('.recipients .person-word').textContent=state.friendsValue ?? (interactive && state.client.status==='Saved'?'Saved in the service':'Waiting for the word');
    this.cards.forEach((card,i)=>{
      const n=state.nodes[i],pos=positions[i];
      card.style.left=pos[0]/10+'%';card.style.top=pos[1]/4.2+'%';
      card.dataset.role=n.role.toLowerCase();card.dataset.connected=n.connected!==false;
      card.classList.toggle('saved-group',!!state.groups&&i<3);card.classList.toggle('election-group',!!state.groups&&i>1);
      card.querySelector('.node-role').textContent=state.showRoles===false?'Server':n.role;
      card.querySelector('.node-word').textContent=n.value || '—';
      card.querySelector('.node-status').textContent=state.groups?(i===2?'In both groups':i<3?'Saved group':'Election group'):!n.online?'Offline':n.connected===false?'Connection lost':n.role==='Candidate'?`${n.votes.length} vote${n.votes.length===1?'':'s'}`:n.log?.length>n.applied?'Stored · not applied':n.value?(state.beforeRaft?'Has the word':'Agreed message'):'No message yet';
      const record=card.querySelector('.node-record');record.hidden=!state.showLogs;
      record.textContent=n.log?.length?'Recorded: '+n.log.at(-1).value:'Record empty';
      const button=card.querySelector('.node-circle');button.disabled=!interactive;
      button.setAttribute('aria-label',`${n.name}: ${n.role}, ${n.online?'online':'offline'}, ${n.connected===false?'disconnected, ':''}${n.value?'message '+n.value:'no message'}${interactive?'. Select server for controls.':''}`);
    });
    const layer=this.root.querySelector('.packet-layer');layer.replaceChildren();
    this.root.querySelector('.wires').setAttribute('viewBox','0 0 1000 420');
    this.root.querySelector('.wires').setAttribute('preserveAspectRatio','none');
    const traffic=this.root.querySelector('.traffic-label');
    const expanded=messages.flatMap(m=>(Array.isArray(m.to)?m.to:[m.to]).map(to=>({...m,to})));
    const at=id=>id==='client'?[200,76]:id==='friends'?[800,76]:positions[id];
    const tag=m=>m.label || ({vote:'Vote request',ballot:m.body?.granted?'Vote granted':'Vote declined',append:m.body?.entries?.length?'Copy message':'Heartbeat',ack:'Reply to leader',request:'Save request',result:'App result'}[m.type]||'Message');
    const labelName=id=>id==='client'?profile.sender:id==='friends'?'Friends':names[id];
    const active=expanded.length?expanded[Math.min(expanded.length-1,Math.floor(progress*expanded.length*.999))]:null;
    const sameExchange=expanded.length&&expanded.every(m=>tag(m)===tag(expanded[0]));
    const senders=[...new Set(expanded.map(m=>labelName(m.from)))].join(', '),receivers=[...new Set(expanded.map(m=>labelName(m.to)))].join(', ');
    traffic.textContent=!interactive&&sameExchange?`${senders} → ${receivers} · ${tag(expanded[0])}`:active?`${labelName(active.from)} → ${labelName(active.to)} · ${tag(active)}`:'';
    expanded.forEach((m,i)=>{
      if(interactive && ((m.from!=='client'&&state.nodes[m.from]?.connected===false)||(m.to!=='client'&&state.nodes[m.to]?.connected===false)))return;
      const a=at(m.from),b=at(m.to);if(!a||!b)return;
      const c=[(a[0]+b[0])/2,Math.min(a[1],b[1])-65];
      const start=typeof m.from==='number'?[a[0],a[1]-44]:a,end=typeof m.to==='number'?[b[0],b[1]-44]:b;
      const path=document.createElementNS(svgNS,'path');path.setAttribute('d',`M${start} Q${c} ${end}`);
      const kind=m.kind||(['vote','ballot'].includes(m.type)?'vote':m.type==='result'?'success':'message');
      path.setAttribute('class','message-path '+kind);path.setAttribute('marker-end','url(#arrowhead)');layer.append(path);
      if(!interactive&&progress>=1&&!reduced)return;
      const t=reduced?.55:interactive?Math.min(1,Math.max(0,(state.time-m.start)/(m.end-m.start))):Math.min(1,Math.max(0,progress*1.5-i/Math.max(expanded.length,1)*.5));
      const x=(1-t)**2*start[0]+2*(1-t)*t*c[0]+t*t*end[0],y=(1-t)**2*start[1]+2*(1-t)*t*c[1]+t*t*end[1];
      const dot=document.createElementNS(svgNS,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','5');dot.setAttribute('class','message-dot '+kind);layer.append(dot);
    });
  }
}
