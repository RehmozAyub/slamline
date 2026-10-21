// Online menus: your name, HOST (get a room code) / JOIN (type one), the lobby, and the race
// start handshake. A room holds 2-8 players (the host is p0). The race itself runs in
// RaceSession + net/online.js.
import { MAPS } from './maps/index.js';
import { CARS, PAINTS, saveSettings, clampCars, CAR_COUNT } from './config.js';
import { host, join, onTick } from './net/peer.js';
import { Online, NET_VERSION, MAX_PLAYERS } from './net/online.js';
import { CODE_CHARS } from './net/protocol.js';

const NAME_MAX = 12;
export const cleanName = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 _.\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const cleanCode = (s) => String(s || '').toUpperCase().split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, 4);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (p) => '#' + (PAINTS[p] || PAINTS[0]).hex.toString(16).padStart(6, '0');
const idNum = (id) => Number(String(id).slice(1));

export class OnlineFlow {
  constructor(game) {
    this.game = game;
    this.ui = game.ui;
    this.net = null; // Online, while in a room
    this.role = null; // 'host' | 'guest'
    this.room = null; // host: { code, close }
    this.roster = []; // [{ id, name, car, paint }] - everyone in the room, host first
    this.hostTrack = 0; // guest: the track the host picked (MAPS.length = RANDOM)
    this.cars = null; // cars per race in this room (the host's choice)
    this.index = { online: 0, join: 0, lobby: 0 };
    this.busy = false;
    this.build();
    // test runs in background tabs (?netsim / ?pump): keep the game loop going at 60 fps
    const q = new URLSearchParams(location.search);
    if (q.has('netsim') || q.has('pump')) {
      let last = 0;
      // (only when the browser has stopped drawing frames itself)
      onTick(() => { const t = performance.now(); if (game.renderer && t - (game.lastFrame ?? 0) > 50 && t - last >= 16.6) { last = t; game.frame(); } });
    }
  }

  get active() { return !!this.net; }
  get myName() { return cleanName(this.game.settings.onlineName) || 'DRIVER'; }
  get me() { return this.net ? this.net.me : null; }
  get others() { return this.roster.filter((p) => p.id !== this.me); }
  get hostName() { const h = this.roster.find((p) => p.id === 'p0'); return h ? h.name : 'THE HOST'; }
  handles(state) { return state === 'online' || state === 'join' || state === 'lobby'; }

  build() {
    const root = this.ui.root;
    const add = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const el = t.content.firstChild; root.insertBefore(el, root.querySelector('#rotate')); this.ui.screens[el.id.slice(2)] = el; return el; };
    add(`<section id="s-online" class="screen">
      <h1 class="head"><b>ONLINE</b> RACE</h1>
      <label class="o-field"><span>YOUR NAME</span><input id="o-name" type="text" maxlength="${NAME_MAX}" spellcheck="false" autocomplete="off" autocapitalize="characters" enterkeyhint="done" placeholder="TYPE A NAME"></label>
      <div class="menu" id="m-online"></div>
      <div class="o-msg" id="o-msg"></div>
      <div class="hints">TYPE YOUR NAME &nbsp;·&nbsp; ↑ ↓ SELECT &nbsp;·&nbsp; ENTER CONFIRM &nbsp;·&nbsp; ESC BACK</div>
    </section>`);
    add(`<section id="s-join" class="screen">
      <h1 class="head"><b>JOIN</b> A ROOM</h1>
      <label class="o-field code"><span>ROOM CODE</span><input id="o-code" type="text" maxlength="4" spellcheck="false" autocomplete="off" autocapitalize="characters" enterkeyhint="go" placeholder="····"></label>
      <div class="menu" id="m-join"></div>
      <div class="o-msg" id="o-jmsg"></div>
      <div class="hints">TYPE THE 4-LETTER CODE THE HOST SEES &nbsp;·&nbsp; ENTER JOIN &nbsp;·&nbsp; ESC BACK</div>
    </section>`);
    add(`<section id="s-lobby" class="screen">
      <h1 class="head"><b>ONLINE</b> LOBBY</h1>
      <div class="o-room">ROOM CODE <b id="o-codeshow">····</b><em id="o-ping"></em></div>
      <div class="o-players" id="o-players"></div>
      <div class="menu" id="m-lobby"></div>
      <div class="o-msg" id="o-lmsg"></div>
    </section>`);
    this.hudPing = document.createElement('div');
    this.hudPing.className = 'o-hudping';
    root.appendChild(this.hudPing); // not inside the HUD: that is rebuilt for every race

    const name = root.querySelector('#o-name');
    name.addEventListener('input', () => { const v = cleanName(name.value); if (name.value.toUpperCase() !== v && name.value.trim().toUpperCase() !== v) name.value = v; });
    name.addEventListener('change', () => { this.game.settings.onlineName = cleanName(name.value); saveSettings(this.game.settings); });
    const code = root.querySelector('#o-code');
    code.addEventListener('input', () => { code.value = cleanCode(code.value); });
    this.ui.onMenuClick('m-online', (i) => { this.index.online = i; this.onlineSelect(i); });
    this.ui.onMenuClick('m-join', (i) => { this.index.join = i; this.joinSelect(i); });
    this.ui.onMenuClick('m-lobby', (i, e) => { this.index.lobby = i; this.lobbySelect(i, e); });
  }

  $(sel) { return this.ui.root.querySelector(sel); }
  msg(id, text, bad = false) { const el = this.$(id); el.textContent = text || ''; el.classList.toggle('bad', bad); }

  // --- ONLINE: name, host or join ---------------------------------------------------
  open() {
    const g = this.game;
    g.players = 1;
    g.state = 'online';
    this.ui.show('online');
    const name = this.$('#o-name');
    name.value = cleanName(g.settings.onlineName);
    this.msg('#o-msg', `ONLINE ROOMS: 2 TO ${MAX_PLAYERS} PLAYERS, PLUS AI RIVALS`);
    this.renderOnline();
    if (g.input.lastDevice !== 'pad' && !name.value) setTimeout(() => name.focus(), 50);
  }

  onlineItems() { return [{ label: 'HOST A GAME' }, { label: 'JOIN A GAME' }, { label: 'BACK' }]; }
  renderOnline() { this.ui.menu('m-online', this.onlineItems(), this.index.online); }

  saveName() {
    const g = this.game, v = cleanName(this.$('#o-name').value);
    g.settings.onlineName = v || g.settings.onlineName || `DRIVER ${10 + Math.floor(Math.random() * 90)}`;
    this.$('#o-name').value = g.settings.onlineName;
    saveSettings(g.settings);
  }

  onlineSelect(i) {
    if (this.busy) return;
    this.game.audio.blip(900, 0.06, 0.1);
    this.saveName();
    if (i === 0) this.startHosting();
    else if (i === 1) this.openJoin();
    else this.game.showTitle();
  }

  // --- JOIN: type the code ------------------------------------------------------------
  openJoin() {
    this.game.state = 'join';
    this.ui.show('join');
    this.msg('#o-jmsg', '');
    this.index.join = 0;
    this.ui.menu('m-join', [{ label: 'JOIN' }, { label: 'BACK' }], 0);
    const code = this.$('#o-code');
    code.value = '';
    setTimeout(() => code.focus(), 50);
  }

  async joinSelect(i) {
    if (this.busy) return;
    if (i === 1) { this.open(); return; }
    const code = cleanCode(this.$('#o-code').value);
    if (code.length !== 4) { this.msg('#o-jmsg', 'THE CODE HAS 4 LETTERS', true); return; }
    this.busy = true;
    this.msg('#o-jmsg', `CONNECTING TO ${code}…`);
    try {
      const link = await join(code);
      this.role = 'guest';
      this.net = this.makeNet('guest');
      this.net.addLink('p0', link);
      this.code = code;
      this.roster = [];
      this.net.send({ type: 'hello', v: NET_VERSION, ...this.mine() });
      this.openLobby();
    } catch (e) {
      this.msg('#o-jmsg', e.text || "CAN'T CONNECT ON THIS NETWORK", true);
    }
    this.busy = false;
  }

  // --- HOST ---------------------------------------------------------------------------
  async startHosting() {
    this.busy = true;
    this.msg('#o-msg', 'OPENING A ROOM…');
    try {
      this.role = 'host';
      this.net = this.makeNet('host');
      this.roster = [{ id: 'p0', ...this.mine() }];
      this.room = await host((link) => this.onGuest(link), (e) => this.msg('#o-lmsg', e.text, true));
      this.code = this.room.code;
      this.openLobby();
    } catch (e) {
      this.net = null;
      this.role = null;
      this.msg('#o-msg', e.text || "CAN'T REACH THE ONLINE SERVICE", true);
    }
    this.busy = false;
  }

  makeNet(role) {
    return new Online(role, {
      onMessage: (m, from) => this.onMessage(m, from),
      onLeft: (id) => this.onLeft(id),
      onClosed: () => this.onClosed(),
      onResults: (list) => this.onHostResults(list),
    });
  }

  // host: someone connected; they get a player id and join the roster once they say hello
  onGuest(link) {
    if (!this.net) { link.close(); return; }
    let id = null;
    for (let k = 1; k < MAX_PLAYERS; k++) if (!this.net.links.has(`p${k}`)) { id = `p${k}`; break; }
    if (!id) { link.send({ type: 'refuse', why: 'full' }); setTimeout(() => link.close(), 200); return; }
    this.net.addLink(id, link);
  }

  mine() { const s = this.game.sel; return { name: this.myName, car: s.car, paint: s.paint }; }
  roomCars() { return Math.max(this.roster.length, clampCars(this.cars ?? this.game.carCount())); }

  // host: tell everyone who is in the room and what the race will be
  broadcastRoster() {
    if (this.role !== 'host' || !this.net) return;
    const me = this.roster.find((p) => p.id === 'p0');
    if (me) Object.assign(me, this.mine());
    this.net.send({ type: 'roster', players: this.roster, track: this.game.sel.track, cars: this.roomCars() });
  }

  // --- lobby ----------------------------------------------------------------------------
  openLobby(note = '') {
    const g = this.game;
    g.state = 'lobby';
    g.players = 1;
    this.ui.show('lobby');
    this.$('#o-codeshow').textContent = this.code || '····';
    this.index.lobby = Math.min(this.index.lobby, this.lobbyItems().length - 1);
    this.renderLobby();
    this.lobbyNote(note);
    this.broadcastRoster();
  }

  lobbyNote(text, bad = false) {
    let waiting;
    if (this.role === 'host') {
      const n = this.roster.length;
      waiting = n < 2 ? 'WAITING FOR FRIENDS TO JOIN · SEND THEM THE CODE' : `${n}/${MAX_PLAYERS} IN THE ROOM · MORE CAN JOIN WITH THE CODE`;
    } else waiting = this.inRace ? 'A RACE IS ON · YOU JOIN THE NEXT ONE' : `WAITING FOR ${this.hostName} TO START`;
    this.msg('#o-lmsg', text || waiting, bad);
  }

  lobbyItems() {
    const t = this.role === 'host' ? this.game.sel.track : this.hostTrack;
    const trackName = t >= MAPS.length ? 'RANDOM' : MAPS[t].name;
    if (this.role === 'host') {
      return [
        { label: 'START RACE', disabled: this.roster.length < 2 },
        { label: 'TRACK', value: `‹ ${trackName} ›` },
        { label: 'CARS', value: `‹ ${this.roomCars()} ›` },
        { label: 'CAR', value: CARS[this.game.sel.car].name },
        { label: 'LEAVE' },
      ];
    }
    return [{ label: 'TRACK', value: trackName, disabled: true }, { label: 'CARS', value: String(this.roomCars()), disabled: true }, { label: 'CAR', value: CARS[this.game.sel.car].name }, { label: 'LEAVE' }];
  }

  renderLobby() {
    if (this.game.state !== 'lobby') return;
    this.ui.menu('m-lobby', this.lobbyItems(), this.index.lobby);
    const list = this.roster.length ? this.roster : [{ id: this.me || '?', ...this.mine() }];
    this.$('#o-players').innerHTML = list.map((p) => {
      const tag = [p.id === 'p0' ? 'HOST' : '', p.id === this.me ? 'YOU' : ''].filter(Boolean).join(' · ') || 'PLAYER';
      return `<div class="o-card${p.id === this.me ? ' me' : ''}"><i style="background:${hex(p.paint)}"></i><b>${esc(p.name)}</b><span>${tag}</span><em>${esc((CARS[p.car] || CARS[0]).name)}</em></div>`;
    }).join('') + (this.role === 'host' && list.length < 2 ? '<div class="o-card empty"><b>WAITING…</b></div>' : '');
    this.$('#o-ping').textContent = this.net && this.net.pingMs ? `PING ${this.net.pingMs} MS` : '';
  }

  lobbySelect(i, e) {
    const g = this.game, key = this.role === 'host' ? ['start', 'track', 'cars', 'car', 'leave'][i] : ['track', 'cars', 'car', 'leave'][i];
    const half = () => { const r = e && e.target.closest('em') ? e.target.closest('em').getBoundingClientRect() : null; return r && e.clientX < (r.left + r.right) / 2 ? -1 : 1; };
    if (key === 'start') {
      if (this.roster.length < 2) { this.lobbyNote(''); g.audio.blip(300, 0.06, 0.08); return; }
      this.hostStart(g.sel.track);
    } else if (key === 'track') {
      if (this.role !== 'host') return;
      this.cycleTrack(half());
    } else if (key === 'cars') {
      if (this.role !== 'host') return;
      this.cycleCars(half());
    } else if (key === 'car') {
      g.audio.blip(900, 0.06, 0.1);
      g.showCars(0);
    } else if (key === 'leave') this.leave();
  }

  cycleTrack(d) {
    const g = this.game, n = MAPS.length + 1;
    g.sel.track = (g.sel.track + d + n) % n;
    g.audio.blip(600, 0.03, 0.06);
    this.renderLobby();
    this.broadcastRoster();
  }

  cycleCars(d) {
    const lo = Math.max(CAR_COUNT.min, this.roster.length);
    const v = this.roomCars() + d;
    this.cars = v < lo ? CAR_COUNT.max : v > CAR_COUNT.max ? lo : v;
    this.game.audio.blip(600, 0.03, 0.06);
    this.renderLobby();
    this.broadcastRoster();
  }

  // the car screen was confirmed (or backed out of) while online
  carChosen() {
    this.openLobby();
    if (this.role === 'guest' && this.net) this.net.send({ type: 'me', ...this.mine() });
  }

  onAction(a, code) {
    const g = this.game, st = g.state;
    // typing in a text field: letters, digits, space and arrows belong to the field
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (typing && code && (/^(Key|Digit|Numpad)/.test(code) || code === 'Space' || code === 'Backspace' || code === 'ArrowLeft' || code === 'ArrowRight' || code === 'Minus' || code === 'Period')) return;
    if (typing && (a === 'up' || a === 'down')) document.activeElement.blur();
    const move = (key, n, d) => { this.index[key] = (this.index[key] + d + n) % n; g.audio.blip(600, 0.03, 0.06); };
    if (st === 'online') {
      if (a === 'up' || a === 'down') { move('online', 3, a === 'up' ? -1 : 1); this.renderOnline(); }
      if (a === 'confirm') this.onlineSelect(this.index.online);
      if (a === 'back') { if (typing) document.activeElement.blur(); g.showTitle(); }
    } else if (st === 'join') {
      if (a === 'up' || a === 'down') { move('join', 2, a === 'up' ? -1 : 1); this.ui.menu('m-join', [{ label: 'JOIN' }, { label: 'BACK' }], this.index.join); }
      if (a === 'confirm') this.joinSelect(typing ? 0 : this.index.join);
      if (a === 'back') { if (typing) document.activeElement.blur(); this.open(); }
    } else if (st === 'lobby') {
      const n = this.lobbyItems().length;
      if (a === 'up' || a === 'down') { move('lobby', n, a === 'up' ? -1 : 1); this.renderLobby(); }
      if ((a === 'left' || a === 'right') && this.role === 'host' && this.index.lobby === 1) this.cycleTrack(a === 'left' ? -1 : 1);
      if ((a === 'left' || a === 'right') && this.role === 'host' && this.index.lobby === 2) this.cycleCars(a === 'left' ? -1 : 1);
      if (a === 'confirm' && code !== 'Space') this.lobbySelect(this.index.lobby);
      if (a === 'back') this.leave();
    }
  }

  // lobby messages
  onMessage(m, from) {
    const g = this.game;
    if (this.role === 'host') {
      if (m.type === 'hello') {
        if (m.v !== NET_VERSION) { this.net.sendTo(from, { type: 'refuse', why: 'version' }); setTimeout(() => this.net && this.net.dropLink(from), 200); return; }
        const p = { id: from, name: cleanName(m.name) || `PLAYER ${idNum(from) + 1}`, car: m.car | 0, paint: m.paint | 0 };
        this.roster = this.roster.filter((q) => q.id !== from).concat(p).sort((a, b) => idNum(a.id) - idNum(b.id));
        this.net.sendTo(from, { type: 'welcome', id: from, racing: !!(g.session && g.session.online) });
        this.broadcastRoster();
        g.audio.chime(2);
        if (g.state === 'lobby') { this.renderLobby(); this.lobbyNote(`${p.name} JOINED`); }
        else if (g.session && g.session.online) g.session.popupAll(`${p.name} JOINED`, 'JOINS THE NEXT RACE');
      } else if (m.type === 'me') {
        const p = this.roster.find((q) => q.id === from);
        if (p) Object.assign(p, { name: cleanName(m.name) || p.name, car: m.car | 0, paint: m.paint | 0 });
        this.broadcastRoster();
        this.renderLobby();
      } else if (m.type === 'bye') { this.net.dropLink(from); this.onLeft(from); }
      return;
    }
    // guest
    if (m.type === 'welcome') { this.net.me = m.id; this.inRace = !!m.racing; if (g.state === 'lobby') { this.renderLobby(); this.lobbyNote(''); } }
    else if (m.type === 'roster') {
      this.roster = (m.players || []).map((p) => ({ id: p.id, name: cleanName(p.name) || 'PLAYER', car: p.car | 0, paint: p.paint | 0 }));
      this.hostTrack = m.track | 0;
      this.cars = clampCars(m.cars);
      if (g.state === 'lobby') { this.renderLobby(); this.lobbyNote(''); }
    } else if (m.type === 'refuse') {
      this.disconnect();
      this.open();
      this.msg('#o-msg', m.why === 'full' ? `THAT ROOM IS FULL (${MAX_PLAYERS} PLAYERS)` : 'THE HOST HAS A DIFFERENT VERSION OF THE GAME', true);
    } else if (m.type === 'start') {
      if (m.players.some((p) => p.id === this.me)) this.raceStart(m);
      else { this.inRace = true; if (g.state === 'lobby') this.lobbyNote(''); } // started before we joined
    } else if (m.type === 'tolobby') {
      this.inRace = false;
      if (g.state !== 'lobby') this.backToLobby(); else this.lobbyNote('');
    } else if (m.type === 'bye') this.onClosed();
  }

  // --- races ------------------------------------------------------------------------------
  // host: pick the track (RANDOM rolls one) and a seed, tell everyone, start
  hostStart(track) {
    const g = this.game;
    if (this.roster.length < 2 || this.starting) return;
    const t = track >= MAPS.length ? g.rollTrack() : track;
    const seed = (Math.random() * 2 ** 31) | 0;
    Object.assign(this.roster[0], this.mine());
    const players = this.roster.map((p) => ({ id: p.id, name: p.name, carIndex: p.car, paintIndex: p.paint }));
    const m = { type: 'start', track: t, random: track >= MAPS.length, seed, cars: this.roomCars(), players };
    this.net.send(m);
    this.raceStart(m);
  }

  async raceStart(m) {
    const g = this.game;
    this.starting = true;
    this.inRace = true;
    this.lastResults = null;
    g.raceTrack = m.track;
    await g.startRace(false, { net: { role: this.role, me: this.me, seed: m.seed }, players: m.players, random: m.random, cars: Math.max(m.players.length, clampCars(m.cars)) });
    this.starting = false;
    if (!this.net || !g.session) return;
    this.net.attach(g.session, m.seed);
    // players who left while everyone was loading
    for (const p of m.players) if (this.role === 'host' && p.id !== 'p0' && !this.net.links.has(p.id)) this.net.takeOver(p.id);
    this.net.raceLoaded();
  }

  // results screen while online
  resultsItems() {
    if (!this.net) return [{ label: 'MAIN MENU' }];
    if (this.role === 'host') return [{ label: 'RACE AGAIN' }, { label: 'NEXT TRACK' }, { label: 'LOBBY' }];
    return [{ label: `WAITING FOR ${esc(this.hostName)}…`, disabled: true }, { label: 'LEAVE' }];
  }

  resultsSelect(i) {
    const g = this.game;
    if (!this.net) { this.leave(); return; }
    if (this.role === 'host') {
      if (i === 0) this.hostStart(g.raceTrack);
      else if (i === 1) {
        // NEXT TRACK: the next card, or another random one when RANDOM was picked
        if (g.sel.track < MAPS.length) g.sel.track = (g.raceTrack + 1) % MAPS.length;
        this.hostStart(g.sel.track);
      }
      else { this.net.send({ type: 'tolobby' }); this.backToLobby(); }
    } else if (i === 1) this.leave();
  }

  // the host's results are the official ones; everyone else shows those
  sendResults(list) { if (this.net && this.role === 'host') this.net.rsend({ type: 'results', list }); }

  onHostResults(list) {
    this.lastResults = list.map((r) => ({ ...r, isPlayer: r.owner === this.me && r.racer }));
    if (this.game.state === 'results') this.ui.resultRows(this.lastResults);
  }

  headline(list) {
    const me = list.find((r) => r.isPlayer);
    const humans = list.filter((r) => r.racer);
    if (!me) return '<b>RESULTS</b>';
    if (humans.length < 2) return me.pos === 1 ? '<b>VICTORY</b>' : `<b>P${me.pos}</b> FINISH`;
    const best = humans.reduce((a, r) => (r.pos < a.pos ? r : a));
    if (best === me) return humans.length === 2 ? `<b>YOU</b> BEAT ${esc(humans.find((r) => r !== me).name)}` : '<b>YOU</b> BEAT EVERYONE';
    return `<b>${esc(best.name)}</b> WINS`;
  }

  async backToLobby() {
    const g = this.game;
    this.inRace = false;
    if (this.net) this.net.detach();
    g.ui.fade(true);
    await new Promise((r) => setTimeout(r, 350));
    g.endSession();
    g.setViews(1);
    g.buildShowroom();
    g.ui.overlay('hud', false);
    g.audio.setMenuMode(true);
    this.openLobby();
    g.ui.fade(false);
  }

  pauseItems() { return [{ key: 'resume', label: 'RESUME' }, { key: 'assist0', label: 'DRIVE ASSIST', value: this.game.assistOn(0) ? 'ON' : 'OFF' }, { key: 'settings', label: 'SETTINGS' }, { key: 'quit', label: 'LEAVE RACE' }]; }

  // every frame
  frame() {
    if (this.net) this.net.frame();
    const g = this.game;
    const show = this.net && g.session && g.session.online && (g.state === 'race' || g.state === 'pause');
    if (show) {
      const n = g.session.racers.length;
      this.hudPing.textContent = `${n} PLAYER${n === 1 ? '' : 'S'} · ${this.net.pingMs || '–'} MS`;
    }
    this.hudPing.classList.toggle('show', !!show);
    if (g.state === 'lobby' && this.net && (this.pingShown !== this.net.pingMs)) { this.pingShown = this.net.pingMs; this.$('#o-ping').textContent = this.net.pingMs ? `PING ${this.net.pingMs} MS` : ''; }
  }

  // --- leaving ----------------------------------------------------------------------------
  // host: a guest left (closed the game, lost connection or chose LEAVE)
  onLeft(id) {
    const g = this.game;
    const p = this.roster.find((q) => q.id === id);
    if (!p) return;
    this.roster = this.roster.filter((q) => q !== p);
    this.broadcastRoster();
    if (g.session && g.session.online && this.net.session) {
      const wasRacing = g.session.racers.some((c) => c.owner === id);
      this.net.takeOver(id);
      if (wasRacing) g.session.popupAll(`${p.name} LEFT`, 'THEIR CAR IS AN AI NOW', 'bad');
    }
    if (g.state === 'lobby') { this.renderLobby(); this.lobbyNote(`${p.name} LEFT`, true); }
    if (g.state === 'results') g.renderResults();
  }

  // guest: the host is gone
  onClosed() {
    const g = this.game;
    if (!this.net) return;
    const name = this.hostName;
    const inRace = g.session && g.session.online && (g.state === 'race' || g.state === 'pause' || g.state === 'results' || g.state === 'loading');
    this.disconnect();
    if (inRace) {
      g.session.popupAll(`${name} LEFT`, 'THE ROOM IS CLOSED', 'bad');
      setTimeout(() => { if (!this.net) g.quitToMenu(); }, 2500);
    } else { this.open(); this.msg('#o-msg', `${name} CLOSED THE ROOM`, true); }
  }

  disconnect() {
    if (this.net) { this.net.detach(); const n = this.net; this.net = null; n.close(); }
    if (this.room) { this.room.close(); this.room = null; }
    this.roster = [];
    this.role = null;
    this.inRace = false;
  }

  leave() {
    const g = this.game;
    g.audio.blip(500, 0.06, 0.1);
    this.disconnect();
    if (g.session) g.quitToMenu(); else g.showTitle();
  }
}
