// RECORD from the pause menu: films the race (picture, game sound and a slim HUD drawn on top)
// until the finish line or STOP RECORDING, then saves the video on this device only: a download
// in the browser, the Videos\SLAMLINE folder for the exe (electron/main.cjs). Nothing is
// uploaded. Phones film at 720p / 30 fps, other devices at up to 1080p / 60 fps.
// The 3D canvas is copied into a 2D canvas right after each render (so WebGL needs no
// preserveDrawingBuffer), the HUD is drawn from the values the DOM HUD shows, and the
// recording pauses while the game is paused.
import { IS_MOBILE } from './config.js';

const MAX_MINUTES = 15; // a forgotten recording stops itself
const TYPES = ['video/mp4;codecs=avc1.42E028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export class Recorder {
  constructor(game) {
    this.game = game;
    this.rec = null;
    this.supported = typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && TYPES.some((t) => MediaRecorder.isTypeSupported(t));
    this.dot = document.createElement('div');
    this.dot.className = 'rec-dot';
    this.dot.innerHTML = '<i></i><span>REC</span><b>0:00</b>';
    game.ui.root.appendChild(this.dot);
  }

  get on() { return !!this.rec; }

  start() {
    if (!this.supported || this.rec) return;
    const g = this.game, src = g.renderer.renderer.domElement;
    const phone = IS_MOBILE || g.stats.platform === 'web-phone';
    const maxH = phone ? 720 : 1080, fps = phone ? 30 : 60;
    const h = Math.min(maxH, src.height) & ~1, w = Math.round((h * src.width) / src.height) & ~1;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const stream = c.captureStream(fps);
    // game sound: a tap off the audio engine's output, next to the speakers
    const a = g.audio;
    if (a.ctx && a.out) {
      this.tap = a.ctx.createMediaStreamDestination();
      a.out.connect(this.tap);
      for (const t of this.tap.stream.getAudioTracks()) stream.addTrack(t);
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: phone ? 3_000_000 : 8_000_000, audioBitsPerSecond: 128_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => this.save(new Blob(chunks, { type: mimeType.split(';')[0] }));
    rec.start(1000);
    this.rec = rec;
    this.canvas = c;
    this.ctx2d = c.getContext('2d');
    this.time = 0;
    this.track = g.raceTrack;
    this.dot.classList.add('show');
    g.ui.popup('RECORDING', 'STOP IT FROM THE PAUSE MENU', 'hot');
  }

  // after the finish: keep filming a moment, then save
  stopSoon(seconds = 2.5) {
    if (!this.rec || this.stopTimer) return;
    this.stopTimer = setTimeout(() => this.stop(), seconds * 1000);
  }

  stop() {
    clearTimeout(this.stopTimer);
    this.stopTimer = null;
    const rec = this.rec;
    if (!rec) return;
    this.rec = null;
    this.dot.classList.remove('show');
    if (rec.state === 'paused') rec.resume();
    rec.stop();
    if (this.tap) { try { this.game.audio.out.disconnect(this.tap); } catch {} this.tap = null; }
  }

  save(blob) {
    const g = this.game;
    const name = `SLAMLINE ${(g.world && g.world.def.name) || 'race'} ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const where = g.stats.platform === 'exe' ? 'IN VIDEOS \\ SLAMLINE' : 'IN YOUR DOWNLOADS';
    if (g.session && (g.state === 'race' || g.state === 'results' || g.state === 'pause')) g.ui.popup('VIDEO SAVED', where, 'hot');
    else this.savedNote = where;
  }

  // every frame, right after the game renders
  frame(dt) {
    if (!this.rec) return;
    const g = this.game, racing = g.state === 'race' || g.state === 'results';
    if (!racing && this.rec.state === 'recording') this.rec.pause();
    else if (racing && this.rec.state === 'paused') this.rec.resume();
    if (!racing) return;
    this.time += dt;
    const s = Math.floor(this.time);
    this.dot.lastChild.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (this.time > MAX_MINUTES * 60) { this.stop(); return; }
    const c = this.canvas, x = this.ctx2d;
    x.drawImage(g.renderer.renderer.domElement, 0, 0, c.width, c.height);
    if (g.players === 1) this.drawHud(x, c.width, c.height);
  }

  // position, lap, speed, the boost bar, banners and popups, from player 1's DOM HUD
  drawHud(x, w, h) {
    const e = this.game.ui.huds[0];
    if (!e) return;
    const L = e.last, u = h / 100;
    x.save();
    x.textBaseline = 'alphabetic';
    x.shadowColor = 'rgba(0,0,0,0.7)';
    x.shadowBlur = u * 0.8;
    const font = (size, weight = 800) => `italic ${weight} ${size * u}px Bahnschrift, 'Arial Narrow', sans-serif`;
    // position and lap, top left
    x.fillStyle = '#fff';
    x.font = font(9);
    x.fillText(String(L.pos ?? ''), u * 4, u * 12);
    const pw = x.measureText(String(L.pos ?? '')).width;
    x.font = font(3.4, 600);
    x.globalAlpha = 0.8;
    x.fillText(`/${L.total ?? ''}`, u * 4.6 + pw, u * 12);
    x.fillText(`LAP ${L.lap ?? ''}/${L.laps ?? ''}`, u * 4, u * 17);
    x.globalAlpha = 1;
    // speed, bottom right
    x.textAlign = 'right';
    x.font = font(8);
    x.fillText(String(L.speed ?? 0), w - u * 10, h - u * 6);
    x.font = font(2.6, 600);
    x.fillText('KM/H', w - u * 4, h - u * 6);
    // boost bar under it
    const bw = u * 30, bx = w - u * 4 - bw, by = h - u * 4.2;
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(bx, by, bw, u * 1);
    const frac = parseFloat(e.boost.style.width) / 100 || 0;
    const grad = x.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#ff2d55'); grad.addColorStop(1, '#ff8a00');
    x.fillStyle = grad;
    x.fillRect(bx, by, bw * frac, u * 1);
    // countdown, banner and popups, centred
    x.textAlign = 'center';
    x.shadowBlur = u * 0.8;
    const cd = e.countdown.textContent;
    if (cd) { x.font = font(18); x.fillStyle = '#fff'; x.fillText(cd, w / 2, h * 0.45); }
    if (L.banner) { x.font = font(3.4); x.fillStyle = '#ffd400'; x.fillText(L.banner, w / 2, u * 9); }
    let y = h * 0.3;
    for (const p of e.popups.children) {
      const t = p.querySelector('.t'), sub = p.querySelector('.s');
      x.globalAlpha = p.classList.contains('out') ? 0.4 : 1;
      x.font = font(5.2);
      x.fillStyle = p.classList.contains('bad') ? '#ff2d55' : p.classList.contains('takedown') || p.classList.contains('hot') ? '#ffd400' : '#fff';
      if (t) x.fillText(t.textContent, w / 2, y);
      if (sub && sub.textContent) { x.font = font(2.6, 600); x.fillStyle = '#fff'; x.fillText(sub.textContent, w / 2, y + u * 3.6); }
      y += u * 9;
    }
    x.restore();
  }
}
