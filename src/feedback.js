// The FEEDBACK chip on the title screen and its form: Bug / Idea / Other plus a short text,
// sent anonymously to SLAMLINE's server (stats.js `post`, server/). The game version, platform,
// last track and graphics level go with it; no name or contact (PRIVACY.md). People who want an
// answer are pointed to GitHub Issues.
import { post } from './stats.js';
import { MAPS } from './maps/index.js';
import { VERSION } from './version.js';

export const REPO = 'https://github.com/RehmozAyub/slamline';
const MAX = 1000;
const KINDS = [['bug', 'BUG'], ['idea', 'IDEA'], ['other', 'OTHER']];

export class Feedback {
  constructor(game) {
    this.game = game;
    this.kind = 'bug';
    this.sending = false;
    const root = game.ui.root;
    const t = document.createElement('template');
    t.innerHTML = `<section id="s-feedback" class="screen">
      <h1 class="head"><b>SEND</b> FEEDBACK</h1>
      <div class="fb-form">
        <div class="fb-kinds" role="radiogroup" aria-label="Kind of feedback">${KINDS.map(([k, l]) => `<button type="button" data-kind="${k}" role="radio">${l}</button>`).join('')}</div>
        <textarea id="fb-text" maxlength="${MAX}" spellcheck="true" placeholder="What happened, or what would make the game better?"></textarea>
        <div class="fb-row"><span id="fb-count">0 / ${MAX}</span><span class="fb-msg" id="fb-msg"></span></div>
        <p class="fb-note">Anonymous, so there's no reply. Please leave out names, emails and other personal details. The game version, platform, last track and graphics level are sent with it. Want an answer? <a href="${REPO}/issues" target="_blank" rel="noopener">Open an issue on GitHub</a>.</p>
        <div class="fb-buttons"><button type="button" class="fb-send" id="fb-send">SEND</button><button type="button" id="fb-back">BACK</button></div>
      </div>
    </section>`;
    this.screen = t.content.firstChild;
    root.insertBefore(this.screen, root.querySelector('#rotate'));
    game.ui.screens.feedback = this.screen;

    // the chip (and the privacy notice) in the title screen's corner
    const corner = document.createElement('div');
    corner.className = 'fb-corner';
    corner.innerHTML = `<button type="button" class="fb-chip" id="fb-chip">FEEDBACK</button><a class="fb-chip" href="${REPO}/blob/main/PRIVACY.md" target="_blank" rel="noopener">PRIVACY</a>`;
    root.querySelector('#s-title').appendChild(corner);

    this.text = this.screen.querySelector('#fb-text');
    this.count = this.screen.querySelector('#fb-count');
    this.msg = this.screen.querySelector('#fb-msg');
    this.sendBtn = this.screen.querySelector('#fb-send');
    corner.querySelector('#fb-chip').addEventListener('click', () => this.open());
    for (const b of this.screen.querySelectorAll('[data-kind]')) b.addEventListener('click', () => this.setKind(b.dataset.kind));
    this.text.addEventListener('input', () => { this.count.textContent = `${this.text.value.length} / ${MAX}`; this.say(''); });
    this.sendBtn.addEventListener('click', () => this.send());
    this.screen.querySelector('#fb-back').addEventListener('click', () => this.close());
    this.setKind('bug');
  }

  open() {
    const g = this.game;
    if (g.state !== 'title') return;
    g.audio.blip(900, 0.06, 0.1);
    g.state = 'feedback';
    g.ui.show('feedback');
    this.say('');
    // (the screen fades in, and a hidden box can't take the cursor)
    setTimeout(() => { if (g.state === 'feedback') this.text.focus(); }, 320);
  }

  close() {
    this.text.blur();
    this.game.showTitle();
  }

  setKind(k) {
    this.kind = k;
    for (const b of this.screen.querySelectorAll('[data-kind]')) b.setAttribute('aria-checked', String(b.dataset.kind === k));
  }

  say(text, bad = false) {
    this.msg.textContent = text;
    this.msg.classList.toggle('bad', bad);
  }

  async send() {
    if (this.sending) return;
    const text = this.text.value.trim();
    if (text.length < 3) { this.say('WRITE A FEW WORDS FIRST', true); return; }
    const g = this.game, stats = g.stats;
    if (!stats.official && !stats.debug) { this.say('FEEDBACK ONLY WORKS IN THE RELEASED GAME', true); return; }
    this.sending = true;
    this.sendBtn.disabled = true;
    this.say('SENDING…');
    const track = g.raceTrack != null && MAPS[g.raceTrack] ? MAPS[g.raceTrack].id : undefined;
    const r = await post('/v1/feedback', { kind: this.kind, text, v: VERSION, p: stats.platform, track, q: g.qualityName }, stats);
    this.sending = false;
    this.sendBtn.disabled = false;
    if (r.ok) {
      this.text.value = '';
      this.count.textContent = `0 / ${MAX}`;
      this.say('THANKS! IT\'S SENT.');
      setTimeout(() => { if (g.state === 'feedback') this.close(); }, 1600);
    } else if (r.status === 429) this.say(r.error === 'full today' ? 'TOO MUCH FEEDBACK TODAY · TRY AGAIN TOMORROW' : 'WAIT A MINUTE, THEN SEND AGAIN', true);
    else if (r.error === 'too many links') this.say('PLEASE USE FEWER LINKS', true);
    else this.say('COULDN\'T SEND · CHECK YOUR CONNECTION AND TRY AGAIN', true);
  }
}
