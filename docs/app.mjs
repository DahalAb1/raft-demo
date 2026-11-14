import { scenarios, places, chapterStart, presentation, readingDuration } from './story.mjs';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svgNS = 'http://www.w3.org/2000/svg';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let scenario = 'story', index = 0, playing = false, elapsed = 0, previousTime = 0, speed = 1, request = null;
let routes = [];
const current = () => scenarios[scenario].frames[index];

function svg(tag, attrs) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}
function resetClock() { elapsed = 0; previousTime = 0; }
function setPlaying(value) {
  playing = value;
  previousTime = 0;
  if (request !== null) cancelAnimationFrame(request);
  request = null;
  drawControls();
  if (playing && !document.hidden) request = requestAnimationFrame(tick);
  else drawPackets();
}
function drawControls() {
  const final = index === scenarios[scenario].frames.length - 1;
  $('play').innerHTML = playing ? 'Pause autoplay <span aria-hidden="true">Ⅱ</span>' : final ? 'Replay automatically <span aria-hidden="true">↻</span>' : index === 0 ? 'Play automatically <span aria-hidden="true">▶</span>' : 'Play automatically <span aria-hidden="true">▶</span>';
  $('play').setAttribute('aria-label', playing ? 'Pause animation' : final ? 'Replay this scenario' : 'Play animation');
  $('next').textContent = final ? 'Walkthrough complete' : index === 0 ? 'See what happens next →' : 'Next step →';
  $('previous').disabled = index === 0;
  $('next').disabled = final;
}
function drawChapters() {
  $('chapters').style.setProperty('--chapter-count', scenarios[scenario].chapters.length);
  $('chapters').innerHTML = scenarios[scenario].chapters.map((name, i) =>
    '<button class="chapter" data-chapter="' + i + '"><span>0' + (i + 1) + '</span>' + escape(name) + '</button>').join('');
}
function selectScenario(name) {
  if (!scenarios[name]) return;
  setPlaying(false);
  scenario = name; index = 0; resetClock();
  drawChapters(); render();
}
function seek(next) {
  setPlaying(false);
  index = Math.max(0, Math.min(scenarios[scenario].frames.length - 1, next));
  resetClock(); render();
}
function serverFoot(n) {
  if (!n.online) return 'Not responding';
  if (n.log.length > n.applied) {
    const last = n.log.at(-1);
    if (n.commit > n.applied) return 'Applying the agreed history';
    return 'Stored, not applied: ' + last.value;
  }
  if (n.role === 'Candidate') return 'Asking to coordinate the group';
  if (n.role === 'Leader') return 'Coordinates changes for the app';
  return n.applied ? 'Follows the agreed history' : current().nodes.some(peer => peer.online && peer.role === 'Leader') ? 'Ready to copy the leader' : 'Waiting for an elected leader';
}

function planIcon(value) {
  return ({ Library: '📚', 'Café': '☕', Park: '🌳', Museum: '🏛' })[value] || '·';
}
function render() {
  const f = current();
  const teaching = presentation(f, scenario);
  $('demo').dataset.level = teaching.level;
  $('network').dataset.level = teaching.level;
  $('agreement').hidden = teaching.level < 3 && f.tag !== 'election-rule';
  $('demo').dataset.meter = String(!$('agreement').hidden);
  $('network').setAttribute('aria-label', teaching.level === 0 ? 'Your unsaved plan in the app' : 'The app and its three servers in illustrative locations');
  $('reading-guide').textContent = teaching.cue;
  $('scenario-label').textContent = f.phase || scenarios[scenario].title;
  $('back-to-story').hidden = scenario === 'story';
  $('availability').textContent = teaching.level < 3 && f.tag !== 'election-rule' ? 'Three separate servers for the same app' : f.nodes.filter(n => n.online).length + ' of 3 online · majority needs 2';
  $('client-request').textContent = f.client.request;
  $('client-status').textContent = f.client.status;
  $('client').dataset.status = f.client.kind;
  $('network').dataset.kind = f.message?.kind || 'copy';
  $('network').dataset.scenario = scenario;
  const election = f.phase?.includes('election') || f.phase?.includes('Electing');
  const showVotes = election || f.tag === 'initial-leader' || f.tag === 'new-leader';
  const showWait = election || f.phase === 'Heartbeats' || f.phase === 'Detecting a failure' || f.tag === 'initial-leader' || f.tag === 'new-leader';
  const latestTerm = Math.max(...f.nodes.map(n => n.term));
  $('servers').innerHTML = f.nodes.map((n, i) => {
    const active = f.message && (f.message.from === i || f.message.to.includes(i));
    const work = showVotes && n.online
      ? '<div class="vote-detail">' + (n.term < latestTerm ? 'Awaiting the vote request' : n.votedFor === null ? 'No vote cast yet' : '✓ Voted for ' + places[n.votedFor]) + '</div>'
      : '<div class="server-foot"' + (teaching.level < 2 ? ' hidden' : '') + '>' + escape(serverFoot(n)) + '</div>';
    const timer = showWait && n.online && n.role === 'Follower'
      ? '<div class="election-wait"><span>Time before a new election</span><div class="wait-track" role="meter" aria-label="' + places[i] + ' election wait remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(n.timer * 100) + '"><i style="width:' + (n.timer * 100) + '%"></i></div></div>' : '';
    let appliedVersion = 0;
    const history = n.log.length ? n.log.map(e => {
      const applied = e.index <= n.applied;
      const accepted = e.expected === appliedVersion;
      if (applied && accepted) appliedVersion++;
      const result = applied ? (accepted ? 'applied' : 'rejected') : e.index <= n.commit ? 'agreed' : 'stored';
      return '<div class="history-entry" data-applied="' + applied + '" data-result="' + result + '"><span>' + e.index + '. ' + escape(e.value) + '</span><small>' + result + '</small></div>';
    }).join('') : '<div class="history-empty">No changes stored yet</div>';
    return '<article class="server" id="server-' + i + '" data-role="' + n.role + '" data-active="' + !!active + '" data-pending="' + (n.online && n.log.length > n.applied) + '" aria-label="' + places[i] + ', ' + n.role + ', ' + (n.online ? 'current plan ' : 'last known plan ') + (n.value ?? 'empty') + '">' +
      '<div class="server-head"><span class="location"><span class="server-status-dot" aria-hidden="true"></span>' + places[i] + '</span><span class="role"' + (teaching.level < 2 ? ' hidden' : '') + '>' + n.role + '</span></div>' +
      work + timer +
      '<div class="value-label">' + (n.online ? 'CURRENT PLAN' : 'LAST KNOWN PLAN') + '</div>' +
      '<div class="value-row"><span class="plan-symbol" aria-hidden="true">' + planIcon(n.value) + '</span><span class="server-value" data-empty="' + (n.value === null) + '">' + escape(n.value ?? 'Not saved yet') + '</span><span class="server-version">v' + n.version + '</span></div>' +
      '<div class="server-history"' + (teaching.level < 4 ? ' hidden' : '') + '><span class="history-label">CHANGE LOG</span>' + history + '</div></article>';
  }).join('');
  $('step-number').textContent = String(f.chapter + 1).padStart(2, '0');
  $('step-title').textContent = f.title;
  $('step-text').textContent = f.text;
  $('agreement-label').textContent = f.meter.label;
  $('agreement-value').textContent = f.meter.value;
  $('agreement-note').textContent = f.meter.note;
  $('agreement').dataset.state = f.meter.blocked ? 'blocked' : 'ready';
  $('message-caption').textContent = f.message?.label || '';
  $('technical-note').textContent = f.technical;
  $('logs').innerHTML = f.nodes.map((n, i) => '<section class="log-node"><h3>' + places[i] + (n.online ? '' : ' · offline') +
    '</h3><p class="log-meta">Term ' + n.term + ' · committed ' + n.commit + ' · applied ' + n.applied + '</p><div class="log-entries">' +
    (n.log.length ? n.log.map(e => {
      const status = e.index <= n.applied ? 'applied' : e.index <= n.commit ? 'committed' : 'stored';
      return '<span class="log-entry ' + status + '" title="Index ' + e.index + ', term ' + e.term + ', expects version ' + e.expected + ', ' + status + '">#' + e.index + ' · ' + e.value + ' / v' + e.expected + '</span>';
    }).join('') : '<span class="log-empty">Empty log</span>') + '</div></section>').join('');
  for (const button of $('chapters').querySelectorAll('button')) {
    if (Number(button.dataset.chapter) === f.chapter) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  for (const button of document.querySelectorAll('[data-scenario]')) {
    button.setAttribute('aria-pressed', String(button.dataset.scenario === scenario));
  }
  $('position').textContent = (index + 1) + ' / ' + scenarios[scenario].frames.length;
  const progress = index / (scenarios[scenario].frames.length - 1) * 100;
  $('progress').style.width = progress + '%';
  $('timeline').setAttribute('aria-valuenow', String(Math.round(progress)));
  $('timeline').setAttribute('aria-valuetext', f.title);
  drawControls(); drawRoutes();
}
function endpoint(id) {
  const network = $('network').getBoundingClientRect();
  const rect = (id === 'client' ? $('client') : $('server-' + id)).getBoundingClientRect();
  return { x: rect.left - network.left + rect.width / 2, y: (id === 'client' ? rect.bottom : rect.top) - network.top };
}
function curve(a, b, involvesClient) {
  if (involvesClient) {
    const mid = (a.y + b.y) / 2;
    return 'M' + a.x + ',' + a.y + ' C' + a.x + ',' + mid + ' ' + b.x + ',' + mid + ' ' + b.x + ',' + b.y;
  }
  const rise = Math.min(80, Math.abs(a.x - b.x) * .22 + 30);
  return 'M' + a.x + ',' + a.y + ' C' + a.x + ',' + (a.y - rise) + ' ' + b.x + ',' + (b.y - rise) + ' ' + b.x + ',' + b.y;
}
function drawRoutes() {
  const g = $('routes'); g.replaceChildren(); routes = [];
  const f = current();
  if (presentation(f, scenario).level < 2) return;
  for (const [a, b] of [[0, 1], [1, 2]]) {
    g.append(svg('path', { d: curve(endpoint(a), endpoint(b), false), class: 'route-idle' }));
  }
  if (!f.message) return;
  for (const destination of f.message.to) {
    const path = svg('path', { d: curve(endpoint(f.message.from), endpoint(destination), f.message.from === 'client' || destination === 'client'), class: 'route', 'marker-end': 'url(#arrow)' });
    const dot = svg('circle', { r: 5, class: 'message-dot' });
    g.append(path, dot);
    routes.push({ path, dot });
  }
  drawPackets();
}
function drawPackets() {
  // A paused/manual step retains a readable static message; no independent CSS timers.
  const progress = reducedMotion.matches ? .55 : Math.min(.98, playing || elapsed ? elapsed / 1500 : .55);
  const eased = progress * progress * (3 - 2 * progress);
  for (const { path, dot } of routes) {
    const point = path.getPointAtLength(path.getTotalLength() * eased);
    dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y);
  }
}
function tick(now) {
  request = null;
  if (!playing || document.hidden) return;
  if (previousTime) elapsed += Math.min(now - previousTime, 100) * speed;
  previousTime = now;
  if (elapsed >= readingDuration(current())) {
    if (index < scenarios[scenario].frames.length - 1) {
      index++; resetClock(); render();
    } else { setPlaying(false); return; }
  }
  drawPackets();
  request = requestAnimationFrame(tick);
}

$('play').addEventListener('click', () => {
  if (index === scenarios[scenario].frames.length - 1 && !playing) { index = 0; resetClock(); render(); }
  setPlaying(!playing);
});
$('previous').addEventListener('click', () => seek(index - 1));
$('next').addEventListener('click', () => seek(index + 1));
$('restart').addEventListener('click', () => seek(0));
$('speed').addEventListener('change', event => { speed = Number(event.target.value); });
$('chapters').addEventListener('click', event => {
  const button = event.target.closest('[data-chapter]');
  if (button) seek(chapterStart(scenarios[scenario].frames, Number(button.dataset.chapter)));
});
$('back-to-story').addEventListener('click', () => selectScenario('story'));
for (const button of document.querySelectorAll('[data-scenario]')) {
  button.addEventListener('click', () => {
    selectScenario(button.dataset.scenario);
    $('demo').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    $('next').focus({ preventScroll: true });
  });
}
$('technical').addEventListener('toggle', () => { if ($('technical').open) setPlaying(false); });
document.addEventListener('visibilitychange', () => {
  previousTime = 0;
  if (document.hidden) {
    if (request !== null) cancelAnimationFrame(request);
    request = null;
  } else if (playing && request === null) request = requestAnimationFrame(tick);
});
reducedMotion.addEventListener('change', () => { setPlaying(false); drawPackets(); });
new ResizeObserver(drawRoutes).observe($('network'));
// Paused and fully explained on first load, including reduced-motion users.
drawChapters(); render();
