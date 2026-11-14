// Deterministic teaching frames, not a Raft implementation or a live trace.
// Every frame is a complete snapshot, so back/seek/restart cannot leave stale work running.
export const places = ['West', 'Central', 'East'];
export const chapters = ['Why three servers?', 'Choose a leader', 'Save the plan', 'Leader fails', 'Change the plan', 'Catch up'];
const copy = value => structuredClone(value);
const entry = (index, term, value, expected) => ({ index, term, value, expected });
const node = (role = 'Follower') => ({ role, online: true, term: 0, votedFor: null, timer: 1, log: [], commit: 0, applied: 0, value: null, version: 0 });
const majority = (label = 'MAJORITY RULE', value = '2 of 3', note = 'servers must agree', blocked = false) => ({ label, value, note, blocked });
const message = (from, to, label, kind = 'copy') => ({ from, to: Array.isArray(to) ? to : [to], label, kind });
function append(n, e) { n.log.push(copy(e)); }
function apply(n, through) {
  n.commit = through;
  while (n.applied < through) {
    const e = n.log[n.applied++];
    if (e.expected === n.version) { n.value = e.value; n.version++; }
  }
}
function builder(initial) {
  const state = copy(initial);
  const frames = [];
  return {
    state, frames,
    add(tag, chapter, title, text, technical, msg = null, meter = majority()) {
      frames.push({ tag, chapter, title, text, technical, message: msg, meter, ...copy(state) });
    }
  };
}
const initial = {
  nodes: [node(), node(), node()],
  client: { request: 'Meet at the library', status: 'Not saved yet', kind: 'ready', confirmed: null }
};

function mainStory() {
  const b = builder(initial), s = b.state, n = s.nodes;
  const first = entry(1, 1, 'Library', 0), second = entry(2, 2, 'Café', 1);
  s.phase = 'Start with the app';
  b.add('intro', 0, 'You type a plan into an app.',
    'Imagine you and a friend use an app to keep your meeting plans in one place. You type “Meet at the library.” It is still a draft. What has to happen before the app can honestly tell you it is saved?',
    'The example is a versioned key/value update: meeting = Library. The diagram will introduce the storage and agreement machinery before sending this request.',
    null, majority('YOUR PLAN', 'A draft', 'not saved yet'));
  s.phase = 'Where the plan is kept';
  b.add('server-purpose', 0, 'The app needs somewhere to keep it.',
    'The app on your phone sends saved plans to a service running on other computers: servers. That lets your friend open the same plan from their phone. Each box below represents one of the servers behind this app.',
    'The client and server are separate roles. This illustration places the three server replicas in named regions for orientation; the runnable Go demo uses in-process RPC.',
    null, majority('BEHIND THE APP', '3 servers', 'each can store a copy'));
  b.add('why-three', 0, 'Extra copies help when a computer fails.',
    'If the plan existed on just one server, you could lose access when that server went offline. This service uses three servers so that, when one stops responding, two others can still hold the plan and keep working.',
    'The configured cluster has three members. Raft can make progress with two communicating, functioning members; retaining a copy alone is not enough to establish a new write.',
    null, majority('THE SETUP', '3 servers', 'one may go offline'));
  s.phase = 'The problem with separate copies';
  b.add('why-agreement', 0, 'But copies can disagree.',
    'Suppose you change the meeting place while one server is offline. Its copy will be older than the others. The servers need shared rules for deciding which changes count and in what order to follow them.',
    'Replication needs an agreement protocol. A server having a stored operation does not by itself establish that operation as committed.',
    null, majority('THE QUESTION', 'Which plan?', 'copies need shared rules'));
  s.phase = 'What Raft is for';
  b.add('what-is-raft', 0, 'Raft is the set of rules they follow.',
    'The servers exchange messages. Raft tells them how to choose a coordinator, when an update can be treated as saved, and how to replace that coordinator after a failure. Let’s follow those rules using your plan.',
    'Raft provides an ordered, replicated log. The KV service applies committed commands in that order. The explanation introduces those mechanisms one at a time.',
    null, majority('OUR GOAL', 'Agree', 'then confirm the save'));
  s.phase = 'Introducing the server roles';
  b.add('need-leader', 0, 'One server will coordinate the updates.',
    'Raft calls the coordinator the leader. It receives updates from the app and sends them to the others, called followers. All three start as followers, so their first job is to elect a leader.',
    'Every node starts in term 0 with no vote and an empty log. Follower, candidate and leader are protocol roles, not different kinds of hardware.');
  s.phase = 'How a server gets chosen';
  b.add('election-rule', 1, 'A server needs more than its own vote.',
    'To become leader, it needs votes from a majority: more than half the group. Here that means two of the three servers. The third server remains part of the group, even when it cannot respond.',
    'The fixed membership determines the majority. It is two of the original three, not a majority of whichever servers happen to be online.',
    null, majority('VOTES NEEDED', '2 of 3', 'more than half'));
  s.phase = 'Leader election';
  n[0].timer = .15; n[1].timer = .65; n[2].timer = .85;
  b.add('election-wait', 1, 'Each server waits a different amount of time.',
    'Each server has a randomly chosen waiting time. If nobody announces a leader before its time runs out, it can ask to take charge. West’s time will run out first in this example.',
    'Election deadlines are randomized. The bars illustrate remaining time rather than measured milliseconds. Different deadlines make simultaneous campaigns less likely.',
    null, majority('LEADER', 'None', 'waiting for an election'));
  n[0].role = 'Candidate'; n[0].term = 1; n[0].votedFor = 0; n[0].timer = 0;
  b.add('initial-request-vote', 1, 'West asks: “May I lead?”',
    'West’s wait ends first. It becomes a candidate—a server asking to lead. It votes for itself and sends a vote request to both other servers. It still needs another vote.',
    'West increments its term to 1 and persists its self-vote before sending RequestVote to both peers. Each request describes its last log term and index.',
    message(0, [1, 2], 'West → both followers · request vote', 'vote'), majority('VOTES RECEIVED', '1 of 3', 'need at least 2', true));
  n[1].term = 1; n[1].votedFor = 0; n[2].term = 1; n[2].votedFor = 0;
  b.add('initial-grant-vote', 1, 'The followers can vote for West.',
    'A server must check that a candidate has not missed saved changes before voting for it. Nothing has been saved yet, so both can vote for West. Central’s reply is the first to reach it.',
    'A follower persists its vote before replying and grants at most one candidate a vote per term. East also grants a vote in this schedule, but its reply is not needed to reach a majority.',
    message(1, 0, 'Central → West · vote granted', 'vote'), majority('VOTES RECEIVED', '1 of 3', 'another is on its way'));
  n[0].role = 'Leader'; n.forEach(x => { x.timer = 1; });
  b.add('initial-leader', 1, 'Two votes choose a leader.',
    'West receives Central’s vote. Together with its own vote, that is two of three. West now coordinates the group.',
    'The candidate becomes leader after receiving a majority. Both other servers remain followers. A new leader begins AppendEntries heartbeats.',
    message(0, [1, 2], 'West → followers · I am the leader'), majority('VOTES RECEIVED', '2 of 3', 'West becomes leader'));
  s.phase = 'Heartbeats';
  b.add('initial-heartbeat', 1, 'The leader keeps in touch.',
    'How do the followers know West is still working? It regularly sends short messages called heartbeats. Receiving one restarts their waiting time. They only need a new election if the leader stays silent for too long.',
    'An AppendEntries heartbeat can carry no new operations. A valid leader message resets the follower’s randomized election deadline.',
    message(0, [1, 2], 'West → followers · heartbeat'), majority('LEADER', 'West', 'followers keep waiting'));
  s.phase = 'Replicating your plan';
  s.client.status = 'Waiting…'; s.client.kind = 'waiting';
  b.add('request-library', 2, 'Now let’s save “Meet at the library.”',
    'Your app sends the plan to West. Watch its status: it must keep saying “Waiting” until the leader can safely confirm the save.',
    'The request is Put("meeting", "Library", version 0). Version 0 creates a missing key. The client does not receive success just because a server accepts the request.',
    message('client', 0, 'Your app → West · save Library'));
  b.add('introduce-log', 2, 'Each server keeps an ordered record of changes.',
    'This record is called a log. It is different from the current plan: an update can be written in the log while the servers are still deciding whether to accept it. Watch the record and the current plan separately.',
    'The log stores proposed operations. commitIndex identifies the agreed prefix, and lastApplied identifies how far the state machine has executed it. Those counters are available under Technical details.',
    null, majority('NEXT', 'Store copies', 'before changing the plan'));
  append(n[0], first);
  b.add('copy-library', 2, 'West writes it down and sends copies.',
    'West writes “set the meeting place to Library” into its log and sends it to both followers. The outlined entry means stored, not yet accepted as the current plan. Your app is still waiting.',
    'Raft.Start persists log index 1 in term 1. The leader sends AppendEntries to both followers; the simulated deliveries can finish at different times.',
    message(0, [1, 2], 'West → both followers · copy Library'), majority('STORED COPIES', '1 of 3', 'not safe to confirm yet', true));
  append(n[1], first);
  b.add('ack-library', 2, 'Central replies: “I have a copy.”',
    'Central stores Library and sends an acknowledgment. East’s copy is still arriving. The leader needs Central’s reply before it can count that copy.',
    'The follower persists index 1 before acknowledging it. Neither follower has yet been told that this operation is committed.',
    message(1, 0, 'Central → West · Library stored'), majority('STORED COPIES', '2 of 3', 'acknowledgment in flight'));
  append(n[2], first); apply(n[0], 1); s.phase = 'Committing the plan';
  b.add('commit-library', 2, 'The leader has enough agreement.',
    'Central’s reply gives West evidence of two stored copies: its own and Central’s. Raft now lets West commit the update—treat it as agreed. West then applies it, changing its current plan to Library, and replies to the app.',
    'The leader can commit a current-term entry after its own copy plus one follower acknowledgment. East has also stored the entry by this frame but its acknowledgment is not required.',
    message(0, 'client', 'West → your app · plan saved'), majority('CONFIRMED COPIES', '2 of 3', 'enough to commit'));
  s.client.status = 'Saved ✓'; s.client.kind = 'saved'; s.client.confirmed = 'Library';
  b.add('confirmed-library', 2, 'Your app can finally say “Saved.”',
    'The reply reaches your app, which can now show Saved. West also tells the followers that the update is committed. They can then apply the same update to their current plans.',
    'Commitment and application on the leader precede the client’s OK. Followers learn the commit index from a later AppendEntries message, not instantaneously.',
    message(0, [1, 2], 'West → followers · apply Library'), majority('APP RESULT', 'Saved', 'meet at the library'));
  apply(n[1], 1); apply(n[2], 1);
  b.add('all-library', 2, 'The plan is saved on all three.',
    'Each server now shows Library. Next, we will take the leader offline and see whether the saved plan survives.',
    'Each replica has applied index 1 and holds meeting = Library, version = 1. In the Go implementation, normal client reads also pass through the replicated log.',
    null, majority('CURRENT PLANS', '3 match', 'all say Library'));
  s.phase = 'Detecting a failure';
  n[0].online = false; n[0].role = 'Offline';
  b.add('leader-down', 3, 'West goes offline. Is the plan lost?',
    'West’s card freezes at its last known plan. Central and East still have Library, but they have stopped receiving the leader’s heartbeats.',
    'A server failure does not change membership. Two of the original three remain online, enough to elect a replacement and continue.',
    null, majority('ONLINE SERVERS', '2 of 3', 'both kept the plan'));
  n[1].timer = .1; n[2].timer = .55;
  b.add('failure-wait', 3, 'The silence triggers another election.',
    'Central’s waiting time runs out first. The same process you saw at the beginning can choose a replacement.',
    'Servers do not instantly know a leader has crashed. They infer a possible failure when no valid leader messages arrive before their election deadlines.',
    null, majority('LEADER', 'Offline', 'Central is timing out'));
  s.phase = 'Electing a replacement';
  n[1].role = 'Candidate'; n[1].term = 2; n[1].votedFor = 1; n[1].timer = 0;
  b.add('request-vote', 3, 'Central asks East for a vote.',
    'Central starts a new election and votes for itself. It asks East to vote too; the offline West cannot respond.',
    'Central enters term 2, persists its self-vote and sends RequestVote. Requests to the offline node are omitted visually.',
    message(1, 2, 'Central → East · request vote', 'vote'), majority('VOTES RECEIVED', '1 of 3', 'still need 2', true));
  n[2].term = 2; n[2].votedFor = 1;
  b.add('grant-vote', 3, 'East checks the history before voting.',
    'Central has the saved Library operation. Its history is up to date, so East grants its vote.',
    'East compares Central’s last log term and index with its own before granting a vote. The log freshness rule is essential to preserving committed history.',
    message(2, 1, 'East → Central · vote granted', 'vote'), majority('VOTES RECEIVED', '1 of 3', 'East’s reply is coming'));
  n[1].role = 'Leader'; n[1].timer = 1; n[2].timer = 1;
  b.add('new-leader', 3, 'A replacement takes over. Library survives.',
    'Central receives East’s vote and becomes leader. It resumes heartbeats. Your confirmed plan is still here.',
    'Central’s self-vote and East’s vote elect it in term 2. The configured majority remains two of three, not two of two.',
    message(1, 2, 'Central → East · heartbeat'), majority('VOTES RECEIVED', '2 of 3', 'Central becomes leader'));
  s.phase = 'Changing the plan';
  s.client = { request: 'New plan: meet at the café', status: 'Ready to send', kind: 'ready', confirmed: 'Library' };
  b.add('change-plan', 4, 'You decide to meet at the café instead.',
    'West is still offline. Can the two working servers save your new plan? They will use the same agreement process.',
    'The next write expects KV version 1. The majority threshold remains two. Raft does not require all servers to be available.',
    null, majority('ONLINE SERVERS', '2 of 3', 'enough to keep working'));
  s.client.status = 'Waiting…'; s.client.kind = 'waiting';
  b.add('request-cafe', 4, 'Send the new plan to Central.',
    'Your app asks the new leader to save Café. The current plan remains Library while the update is pending.',
    'Put("meeting", "Café", version 1) enters the normal replicated path. Client retries and leader discovery are condensed in this illustration.',
    message('client', 1, 'Your app → Central · save Café'));
  append(n[1], second);
  b.add('copy-cafe', 4, 'Central sends the new history entry to East.',
    'The Café operation appears as stored in Central’s history. East needs a copy before this change can be confirmed.',
    'Index 2 is in the current term, 2. West’s saved log still ends at index 1.',
    message(1, 2, 'Central → East · copy Café'), majority('NEW COPIES', '1 of 3', 'need at least 2', true));
  append(n[2], second);
  b.add('ack-cafe', 4, 'East stores it and replies.',
    'Both online servers hold the Café operation. East’s acknowledgment tells Central that the second copy is safe.',
    'A log entry is stored before acknowledgment. The version check and value change happen later, when the committed operation is applied.',
    message(2, 1, 'East → Central · Café stored'), majority('NEW COPIES', '2 of 3', 'reply on its way'));
  apply(n[1], 2); s.phase = 'Committing the new plan';
  b.add('commit-cafe', 4, 'Central applies the agreed change.',
    'The acknowledgment arrives. Central commits the operation, changes its current plan to Café, and replies to your app.',
    'The expected KV version 1 matches, so the state machine changes meeting to Café and increments the version to 2.',
    message(1, 'client', 'Central → your app · new plan saved'), majority('CONFIRMED COPIES', '2 of 3', 'enough to commit'));
  s.client.status = 'Saved ✓'; s.client.kind = 'saved'; s.client.confirmed = 'Café';
  b.add('confirmed-cafe', 4, 'The new plan is saved.',
    'Your app receives success. Central tells East to apply Café. West’s frozen card still says Library because it missed this change.',
    'The acknowledgment follows commitment and application at the leader. East learns commit index 2 in the next leader message.',
    message(1, 2, 'Central → East · apply Café'), majority('APP RESULT', 'Saved', 'meet at the café'));
  apply(n[2], 2);
  b.add('offline-stale', 4, 'Now the difference is visible.',
    'Central and East say Café. The offline West last knew Library. When it returns, it must catch up rather than replace the newer plan.',
    'The offline display is a last-known value, not a usable read. The leader will repair the returning follower’s log with the missing suffix.',
    null, majority('ONLINE SERVERS', '2 of 3', 'both say Café'));
  s.phase = 'Recovering the old server';
  n[0].online = true; n[0].role = 'Follower'; n[0].value = null; n[0].version = 0; n[0].commit = 0; n[0].applied = 0;
  b.add('restart-west', 5, 'West returns with its saved history.',
    'Its history still contains Library, but its in-memory plan starts empty. It needs to rebuild the plan and receive the change it missed.',
    'The Go demo restarts Raft with the same in-memory Persister. Term, vote and log survive this simulated restart, while the KV map is rebuilt. KV snapshot integration is disabled.',
    null, majority('WEST HISTORY', '1 entry', 'Café is missing'));
  b.add('catchup-send', 5, 'Central sends the missing Café entry.',
    'The current leader shares the missing operation and tells West which part of the history is committed.',
    'After any necessary log matching, AppendEntries carries the missing suffix, term 2 and commit index 2. Intermediate retry rounds are condensed.',
    message(1, 0, 'Central → West · missing Café entry'));
  n[0].term = 2; n[0].votedFor = null; append(n[0], second); n[0].commit = 2;
  b.add('catchup-stored', 5, 'The history matches. Now replay it.',
    'West has both log entries again, but has not used them to rebuild its current plan. Remember the difference: the log records changes; applying those changes produces the plan you can see.',
    'West knows commit index 2 but has applied index 0. This is why observing its new term alone cannot prove that its KV state has recovered.',
    message(0, 1, 'West → Central · history received'), majority('WEST HISTORY', '2 entries', 'ready to replay'));
  apply(n[0], 1); n[0].commit = 2;
  b.add('replay-library', 5, 'First, restore the original plan.',
    'West applies the Library operation. Next comes the later change, in the same order as on the other servers.',
    'The single RSM reader applies committed operations in index order. Index 1 creates the Library plan at version 1.',
    null, majority('WEST REPLAY', '1 of 2', 'operations applied'));
  apply(n[0], 2);
  b.add('recovered', 5, 'Everyone has the café plan again.',
    'West applies the second operation and catches up. Your saved plan survived a failure, changed during the outage, and reached the returning server.',
    'All three replicas hold meeting = Café, version = 2, with commit index = applied index = 2. The real Go driver separately verifies the restarted server’s actual applied state.',
    null, majority('CURRENT PLANS', '3 match', 'all say Café'));
  return b.frames;
}

export const story = mainStory();

function quorumStory() {
  const start = copy(story.at(-1));
  delete start.message;
  const b = builder({ nodes: start.nodes, client: start.client }), s = b.state, n = s.nodes;
  b.add('quorum-intro', 0, 'What if two servers go offline?', 'Your plan is “Meet at the café,” saved on all three servers. Central is the elected leader. What happens if two servers go offline?',
    'A three-server cluster needs a majority of two. Availability changes; membership does not.', null, majority('MAJORITY RULE', '2 of 3', 'always required'));
  n[0].role = 'Offline'; n[0].online = false; n[2].role = 'Offline'; n[2].online = false;
  b.add('quorum-lost', 1, 'One server cannot decide alone.', 'Only Central is online. It still has the saved plan, but cannot confirm any new update by itself.',
    'An isolated leader may still consider itself leader. It cannot commit a new entry without another replica. Reads also require consensus in this implementation.',
    null, majority('ONLINE SERVERS', '1 of 3', 'need at least 2', true));
  s.client = { request: 'Meeting place: Park', status: 'Waiting…', kind: 'waiting', confirmed: 'Café' };
  b.add('quorum-request', 2, 'You ask to move the meetup to the park.', 'Central can receive a request. It cannot promise success while the other two servers are offline.',
    'The leader can accept an operation at a proposed log index even without a quorum. Start returning an index is not proof of commitment.',
    message('client', 1, 'App → Central · save Park'), majority('ONLINE SERVERS', '1 of 3', 'no majority', true));
  append(n[1], entry(3, 2, 'Park', 2));
  b.add('quorum-pending', 2, 'Waiting is the correct answer.', 'Park is only a pending entry. The current plan stays Café and the app keeps waiting. The server will not claim a save it cannot establish.',
    'Only one copy of index 3 exists. commitIndex and lastApplied stay at 2. The client has no successful result; the real Clerk has no request deadline.',
    null, majority('NEW COPIES', '1 of 3', 'cannot commit', true));
  n[2].online = true; n[2].role = 'Follower';
  b.add('quorum-return', 3, 'A second server returns.', 'East comes back. Central can now send it the pending update.',
    'This illustrated short outage ends before East starts another election. It retains its saved log and receives index 3 from the current leader.',
    message(1, 2, 'Central → East · pending update'), majority('ONLINE SERVERS', '2 of 3', 'majority available'));
  append(n[2], n[1].log[2]);
  b.add('quorum-ack', 3, 'The second copy is stored.', 'East acknowledges the new entry. Central can use that reply to establish a majority.',
    'East persists index 3 before replying. The client must still wait for the leader to receive the acknowledgment and apply the operation.',
    message(2, 1, 'East → Central · stored'), majority('NEW COPIES', '2 of 3', 'reply on its way'));
  apply(n[1], 3);
  b.add('quorum-commit', 4, 'Now it can be confirmed.', 'Central commits Park, applies it, and sends success to the app.',
    'Index 3 is in the leader’s current term. Two replicas establish commitment; the version check succeeds against version 2.',
    message(1, 'client', 'Central → App · saved Park'), majority('AGREEMENT', '2 of 3', 'majority reached'));
  s.client = { request: 'Meeting place: Park', status: 'Saved ✓', kind: 'saved', confirmed: 'Park' };
  b.add('quorum-notify', 4, 'The wait ends with a real save.', 'The app receives confirmation. Central tells East to apply the update.',
    'The app learns success after the leader applies the committed operation. East learns commitment from a subsequent leader message.',
    message(1, 2, 'Central → East · update committed'), majority('CLIENT RESULT', 'Saved', 'meeting = Park'));
  apply(n[2], 3);
  b.add('quorum-done', 4, 'A majority restores progress.', 'Central and East show Park. West is still offline. Two of the original three are enough.',
    'This branch ends with one offline replica and two caught-up replicas. Restart the guided story to return to its initial state.',
    null, majority('ONLINE SERVERS', '2 of 3', 'both show Park'));
  return b.frames;
}

function versionStory() {
  const b = builder({ nodes: story.at(-1).nodes, client: story.at(-1).client }), s = b.state, n = s.nodes;
  b.add('version-intro', 0, 'Two friends edit the same plan.', 'Alice and Bob both see “Meet at the café,” version 2. Alice changes it to the park; Bob changes it to the museum. Can they accidentally overwrite each other?',
    'Central is already the elected leader in this scenario. The reads are assumed complete here. In the Go implementation each Get travels through the replicated log too. This branch shows only the subsequent writes.',
    null, majority('STARTING VERSION', 'v2', 'Alice and Bob read it'));
  s.client = { request: 'Alice: Park · expects v2', status: 'Waiting…', kind: 'waiting', confirmed: 'Café' };
  b.add('alice-request', 1, 'Alice’s update arrives first.', 'Alice asks to save Park, provided the value is still at version 2.',
    'Put("meeting", "Park", version 2) is a conditional update, not an unconditional overwrite.',
    message('client', 1, 'Alice → Central · save Park if v2'));
  append(n[1], entry(3, 2, 'Park', 2));
  b.add('alice-copy', 1, 'Agree on Alice’s operation.', 'Central stores Alice’s operation and sends it to both followers. The current plan is still Café.',
    'The operation’s version check runs when the committed command is applied, not before replication.',
    message(1, [0, 2], 'Central → followers · copy operation'), majority('NEW COPIES', '1 of 3', 'need at least 2', true));
  append(n[0], n[1].log[2]); append(n[2], n[1].log[2]);
  b.add('alice-ack', 1, 'A follower acknowledges.', 'East’s acknowledgment travels back. Central needs only one follower’s reply in addition to its own copy.',
    'Both followers stored index 3 in this illustrated schedule. One follower acknowledgment plus the leader is a majority.',
    message(2, 1, 'East → Central · stored'), majority('STORED COPIES', '3 of 3', 'one reply is enough'));
  apply(n[1], 3);
  b.add('alice-commit', 2, 'Alice’s version matches.', 'Central applies Alice’s update: the value becomes Park and the version becomes 3. It replies with success.',
    'The KV state machine compares expected version 2 with current version 2, then updates the value and increments its version.',
    message(1, 'client', 'Central → Alice · saved Park'), majority('VERSION CHECK', '2 = 2', 'update accepted'));
  s.client.status = 'Saved ✓'; s.client.kind = 'saved'; s.client.confirmed = 'Park';
  b.add('alice-notify', 2, 'The followers learn the result.', 'Alice receives confirmation. Central tells the followers to apply the same committed operation.',
    'All replicas execute the same deterministic version check in the same log order.',
    message(1, [0, 2], 'Central → followers · operation committed'));
  apply(n[0], 3); apply(n[2], 3);
  s.client = { request: 'Bob: Museum · expects v2', status: 'Waiting…', kind: 'waiting', confirmed: 'Park' };
  b.add('bob-request', 3, 'Bob still expects the old version.', 'Bob asks to save Museum using version 2. The value has already changed to version 3.',
    'Bob’s Put must still go through consensus. The leader does not reject it locally before replication.',
    message('client', 1, 'Bob → Central · save Museum if v2'));
  append(n[1], entry(4, 2, 'Museum', 2));
  b.add('bob-copy', 3, 'Replicate the request, even now.', 'Central copies Bob’s operation to the followers. The system must agree on the order before applying the version check.',
    'A log entry records an operation. Committing that entry does not mean the application-level update will succeed.',
    message(1, [0, 2], 'Central → followers · copy operation'), majority('NEW COPIES', '1 of 3', 'need at least 2', true));
  append(n[0], n[1].log[3]); append(n[2], n[1].log[3]);
  b.add('bob-ack', 3, 'The request is stored.', 'East acknowledges Bob’s operation. Central can now establish commitment once that reply arrives.',
    'Index 4 is replicated, but the plan stays Park. The pending value Museum has not been applied.',
    message(2, 1, 'East → Central · stored'), majority('STORED COPIES', '3 of 3', 'operation, not result'));
  apply(n[1], 4);
  b.add('bob-rejected', 4, 'The version check protects Alice’s update.', 'Bob expected version 2, but the value is at version 3. Central leaves Park unchanged and replies “Version changed.”',
    'The committed operation returns ErrVersion when applied. It is a definite rejection on this first attempt. A mismatch after an uncertain earlier attempt may instead produce ErrMaybe.',
    message(1, 'client', 'Central → Bob · version changed'), majority('VERSION CHECK', '2 ≠ 3', 'update rejected'));
  s.client.status = 'Version changed'; s.client.kind = 'rejected';
  b.add('bob-notify', 4, 'Everyone applies the same check.', 'Bob receives the rejection. Central tells the followers that this operation is committed too.',
    'The log grows even though the KV value does not change. The followers apply the same rejected operation, advancing their applied index.',
    message(1, [0, 2], 'Central → followers · operation committed'));
  apply(n[0], 4); apply(n[2], 4);
  b.add('version-done', 4, 'No silent overwrite.', 'All three servers still show Park at version 3. Bob must read the latest value before deciding how to update it.',
    'All replicas have applied index 4. Conditional writes prevent stale overwrites; they do not resolve client uncertainty after lost replies.',
    null, majority('APPLIED COPIES', '3 of 3', 'Alice’s value survives'));
  return b.frames;
}

export const scenarios = {
  story: { title: 'ONE SERVER FAILS', chapters, frames: story },
  quorum: { title: 'TWO SERVERS FAIL', chapters: ['The saved plan', 'Two fail', 'Try a change', 'One returns', 'Save the change'], frames: quorumStory() },
  version: { title: 'TWO PEOPLE CHANGE THE PLAN', chapters: ['Same version', 'Alice writes', 'Accepted', 'Bob writes', 'Protected'], frames: versionStory() }
};

export function chapterStart(frames, chapter) { return frames.findIndex(f => f.chapter === chapter); }

// New concepts are introduced in the narration before their UI appears.
export function presentation(frame, scenario = 'story') {
  if (scenario !== 'story') return { level: 5, cue: scenario === 'version'
    ? 'Each friend sends the version they read. Watch the log advance even when an outdated edit is rejected.'
    : 'The group still has three members. Watch whether the app receives confirmation when only one is online.' };
  const opening = {
    intro: [0, 'The plan below is still on your device. Nothing has been saved on a server.'],
    'server-purpose': [1, 'Top: the app you use. Below: three separate computers that will store its data.'],
    'why-three': [1, 'These are three servers for the same app, not three different meeting plans.'],
    'why-agreement': [1, 'Keeping copies and agreeing which changes are valid are different problems.'],
    'what-is-raft': [1, 'We will start with choosing a coordinator, then come back to saving your plan.'],
    'need-leader': [2, 'Leader and follower describe what a server is doing, not different hardware.'],
    'election-rule': [2, 'A majority means more than half. In this group, that is two of three.']
  };
  if (opening[frame.tag]) return { level: opening[frame.tag][0], cue: opening[frame.tag][1] };
  if (frame.chapter === 1) return { level: 3, cue: frame.tag === 'initial-heartbeat'
    ? 'A heartbeat resets the waiting time. A long silence lets a follower start a new election.'
    : 'Watch the role labels, the votes, and the direction of the messages. These messages are about leadership, not your plan.' };
  if (frame.tag === 'request-library') return { level: 3, cue: 'The app has sent a request. Waiting means it has not received a successful result yet.' };
  if (frame.tag === 'introduce-log' || frame.tag === 'copy-library' || frame.tag === 'ack-library')
    return { level: 4, cue: 'Outlined log entry: the change is stored. Current plan: the result after agreed changes have been applied.' };
  return { level: 5, cue: frame.chapter === 5
    ? 'The returning server must receive the missing log entries, then apply them in the same order.'
    : 'Stored → committed (agreed) → applied (current plan updated). The app receives success after the leader applies the change.' };
}

export function readingDuration(frame) {
  // Automatic mode gives the explanation time to be read; Next remains the primary control.
  return Math.max(7500, Math.min(16000, frame.text.split(/\s+/).length * 230 + 2500));
}
