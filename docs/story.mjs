import { names } from './cluster.mjs';
export const sections = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'leader-election', label: 'Leader Election' },
  { id: 'persistence', label: 'Persistence' },
  { id: 'failure', label: 'Hardware / Network Failure' },
  { id: 'experiment', label: 'Experiment' }
];
export const defaults = { sender: 'You', friends: ['Maya', 'Sam', 'Noor'], word: 'Hello' };
export function validateProfile(sender, friends, word) {
  const cleanWord = word.trim();
  const cleanFriends = friends.split(',').map(x => x.trim()).filter(Boolean);
  if (!/^[\p{L}\p{M}\p{N}]{1,14}$/u.test(cleanWord)) return { error: 'Use one word of 1–14 letters or numbers, without spaces or punctuation.' };
  if (!sender.trim() || sender.trim().length > 20) return { error: 'Your name needs 1–20 characters.' };
  if (!cleanFriends.length || cleanFriends.length > 3 || cleanFriends.some(n => n.length > 20)) return { error: 'Enter up to three names, separated by commas. Keep each name under 21 characters.' };
  return { profile: { sender: sender.trim(), friends: cleanFriends, word: cleanWord } };
}
export function buildStory(p = defaults) {
  const word = p.word, friend = p.friends[0];
  const nodes = names.map((name,id) => ({id,name,role:'Server',online:true,connected:true,value:null,log:[],commit:0,applied:0,term:0,vote:null,votes:[]}));
  const state = { nodes, client:{value:word,status:'Ready to send'}, friendsValue:null, showRoles:false, showLogs:false, meter:null, groups:null, beforeRaft:true };
  const frames=[];
  const msg=(from,to,label,kind='message')=>({from,to:Array.isArray(to)?to:[to],label,kind});
  const add=(tag,section,title,text,action,messages=[])=>frames.push({...structuredClone(state),tag,section,title,text,action,messages});
  const stored=i=>{nodes[i].log=[{term:1,value:word,expected:0,request:1}];};
  const applied=i=>{stored(i);nodes[i].commit=nodes[i].applied=1;nodes[i].value=word;};
  add('context','introduction','Your friends may reach different servers.',
    'An app can run on many servers in different places. You and your friends may reach different ones, but should still find the same saved message. Raft helps those servers agree. Let’s see why they need it.',
    'Send your word');
  nodes[0].value=word;state.client.status='Reached West · not confirmed';
  add('one-copy','introduction','One server has your word. The others don’t.',
    `Imagine an app that has not coordinated its copies yet. “${word}” reached West. If ${friend} connects through East, that server has no copy to show.`,
    `Let ${friend} read`,[msg('client',0,`Send “${word}”`)]);
  state.friendsValue='No message yet';
  add('different-copies','introduction','The same app gives a different answer.',
    `${friend} reached East and found nothing. Extra servers are useful only if they can agree on which changes count. Now let’s send the same word using Raft, starting by choosing a coordinator.`,
    'Choose a coordinator',[msg(2,'friends','No message yet','warning')]);
  nodes.forEach(n=>{n.role='Follower';n.value=null;});state.beforeRaft=false;state.showRoles=true;state.friendsValue=null;state.client.status='Waiting for a leader';
  add('roles','leader-election','Every server starts as a follower.',
    'Raft gives a server one of three roles: a follower listens, a candidate asks to lead, and a leader coordinates changes. Nobody is leader yet. Each follower waits a different amount of time before asking.',
    'Let West’s wait run out');
  nodes[0].role='Candidate';nodes[0].term=1;nodes[0].vote=0;nodes[0].votes=[0];
  state.meter={label:'Votes received by West',value:'1 of 5',note:'3 needed to lead'};
  add('candidate','leader-election','West becomes a candidate and asks for votes.',
    'West’s wait ended first. It votes for itself and asks the other four servers to support it. One vote is not enough: a majority of five means at least three.',
    'Collect Central’s vote',[msg(0,[1,2,3,4],'May I lead?','vote')]);
  nodes[1].vote=0;nodes[1].term=1;nodes[0].votes.push(1);state.meter.value='2 of 5';
  add('two-votes','leader-election','Two votes. West is still a candidate.',
    'Central grants its vote. A server votes for at most one candidate in an election and checks that the candidate’s history is up to date. There is no saved history yet, so West passes that check.',
    'Collect East’s vote',[msg(1,0,'Vote for West','vote')]);
  nodes[2].vote=0;nodes[2].term=1;nodes[0].votes.push(2);nodes[0].role='Leader';state.meter.value='3 of 5';state.meter.note='A majority chose West';
  add('elected','leader-election','Three votes make West the leader.',
    'East’s vote brings West to three. West can now coordinate updates. The other four remain followers. The leader is elected by the group; it is not a special kind of computer.',
    'See how followers stay in touch',[msg(2,0,'Vote for West','vote')]);
  nodes.forEach(n=>n.term=1);state.client.status='Ready to send';state.meter={label:'Coordinator',value:'West',note:'Followers listen for heartbeats'};
  add('heartbeat','leader-election','The leader regularly says, “I’m still here.”',
    'These small messages are called heartbeats. They keep followers from starting another election. If the messages stop for long enough, a follower can ask to become the next leader.',
    `Send “${word}” to West`,[msg(0,[1,2,3,4],'Heartbeat')]);
  state.client.status='Waiting · no success yet';state.meter=null;
  add('request','persistence','Receiving a message is not the same as saving it.',
    `Your app asks West to save “${word}”. The app keeps waiting. If the only copy were on West and West failed now, the group could not promise your friends that the message was saved.`,
    'Record the word',[msg('client',0,`Save “${word}”`)]);
  stored(0);state.showLogs=true;state.meter={label:'Stored copies',value:'1 of 5',note:'Not enough to confirm'};
  add('record','persistence','West records the change before sending copies.',
    'Each server keeps an ordered record called a log. Writing there is a proposal, not permission to show a successful save. Raft retains this history so a server can recover after restarting.',
    'Send copies to the followers');
  stored(1);stored(2);state.meter.value='3 of 5';state.meter.note='Copies exist · replies still needed';
  add('copies','persistence','The followers write it down too.',
    `West sends “${word}” to the followers. We follow the first two copies, reaching Central and East. They must reply before West knows those copies exist. The current message is still unchanged.`,
    'Return the acknowledgments',[msg(0,[1,2],`Copy “${word}”`)]);
  nodes[0].commit=1;nodes[0].applied=1;nodes[0].value=word;state.meter={label:'Copies known to West',value:'3 of 5',note:'Enough to commit this change'};
  add('commit','persistence','Three copies let the leader commit the change.',
    'Central and East acknowledge their copies. Including West’s own copy, that is a majority. West commits the change—makes it part of the agreed history—then applies it to the current message.',
    'Confirm the save',[msg(1,0,'Copy stored'),msg(2,0,'Copy stored')]);
  state.client.status='Saved';state.client.value=word;state.meter={label:'Your app',value:'Saved',note:'Agreement came before confirmation'};
  add('confirmed','persistence','Now your app can honestly say “Saved.”',
    'The confirmation reaches your app. Followers learn which changes are committed in later leader messages; every copy does not change at the exact same instant. Reads must also go through the service’s coordination rules.',
    'Bring the followers up to date',[msg(0,'client','Saved','success')]);
  nodes.forEach((n,i)=>applied(i));state.friendsValue=word;state.meter=null;
  add('applied','persistence','Your friends can get the agreed message.',
    `All five servers have now applied “${word}”. Your friends ask the service to read it; the service returns the agreed value. In this project, reads are ordered through Raft too, rather than trusting an arbitrary stale copy.`,
    'Why does a majority matter?',[msg(0,[1,2,3,4],'Change agreed'),msg(0,'friends',`“${word}”`,'success')]);
  state.groups=true;state.meter={label:'Every pair of majorities overlaps',value:'3 + 3 > 5',note:'At least one server is shared'};
  add('overlap','persistence','A new majority cannot avoid the old one.',
    'The blue three saved the word; the amber three could elect the next leader. They share East. Together with the rule that candidates need an up-to-date history, this overlap protects changes already confirmed as saved.',
    'See what happens when West fails');
  state.groups=null;nodes[0].online=false;nodes[0].role='Offline';state.meter={label:'Servers able to communicate',value:'4 of 5',note:'A majority is still possible'};
  add('crash','failure','West stops. Its heartbeats stop too.',
    `The leader is offline, but the other servers still have “${word}”. They cannot instantly know what happened; they notice that heartbeats are missing. After a waiting time, one can start an election.`,
    'Let Central start an election');
  nodes[1].role='Candidate';nodes[1].term=2;nodes[1].vote=1;nodes[1].votes=[1];state.meter={label:'Votes received by Central',value:'1 of 5',note:'Still needs 3, even with West offline'};
  add('reelection','failure','Central asks to take over.',
    'Central becomes a candidate and votes for itself. It has the saved word in its history. The others check that history before voting, so an outdated server cannot simply replace the agreed message.',
    'Collect two more votes',[msg(1,[2,3,4],'May I lead?','vote')]);
  nodes[1].role='Leader';nodes[1].votes=[1,2,3];nodes[2].vote=1;nodes[3].vote=1;nodes[2].term=nodes[3].term=2;state.meter={label:'Votes received by Central',value:'3 of 5',note:'Central becomes leader'};
  add('new-leader','failure','A new leader, with the same saved word.',
    `East and North grant their votes. Central becomes leader and resumes coordination. “${word}” survives because the replacement carries the agreed history forward.`,
    'Take a second server offline',[msg(2,1,'Vote for Central','vote'),msg(3,1,'Vote for Central','vote')]);
  nodes[4].online=false;nodes[4].role='Offline';state.meter={label:'Servers able to communicate',value:'3 of 5',note:'New changes can still be agreed'};
  add('two-fail','failure','Two servers are down. Three can still agree.',
    'Central, East, and North can still form a majority. The service can continue confirming new changes. Five servers can tolerate two unavailable members, as long as the remaining three can communicate.',
    'Disconnect North’s network');
  nodes[3].connected=false;state.meter={label:'Connected group',value:'2 of 5',note:'Too small to confirm a new save'};
  add('network-failure','failure','A running computer can still be unreachable.',
    'North is powered on but its connection is broken. Central can reach only East. The saved word is still there, but new saves must wait: two servers cannot establish a majority of five.',
    'Restore the servers and connection');
  nodes.forEach(n=>{n.online=true;n.connected=true;n.role=n.id===1?'Leader':'Follower';n.term=2;});nodes[0].value=null;nodes[0].applied=0;nodes[0].commit=0;nodes[4].value=null;nodes[4].applied=0;nodes[4].commit=0;state.meter={label:'Retained history',value:'Still here',note:'Restarted servers rebuild their current state'};
  add('restore','failure','The computers restart with their recorded history.',
    'West and South have lost their working memory, but retained their logs. Central tells them which history is agreed. They replay it in order, receiving any missing entries before applying them.',
    'Rebuild the current message',[msg(1,[0,4],'Agreed history')]);
  nodes.forEach((n,i)=>applied(i));state.meter=null;
  add('recovered','failure','Five servers. One agreed history.',
    'Raft elects a coordinator, agrees on an order of changes, and preserves confirmed information through failures. It needs a communicating majority to make progress. You have seen the whole idea; now try changing the conditions yourself.',
    'Try it yourself');
  return frames;
}
