const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const FakeTimers = require('@sinonjs/fake-timers');
const { createCanvas } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ui/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const source = fs.readFileSync(process.env.PEEKY_TEST_SOURCE || path.join(root, 'ui/app.js'), 'utf8');

function setup(skin = 'jarvis', reduced = false) {
  const errors = [], events = {}, calls = { fxClears: 0, skyClears: 0, viz: [] };
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e));
  const dom = new JSDOM(html, { url: 'https://peeky.test/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const clock = FakeTimers.withGlobal(w).install({ now: 1700000000000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  w.matchMedia = () => ({ matches: reduced, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.devicePixelRatio = 2;
  const canvases = new WeakMap();
  const canvasFor = el => { if (!canvases.has(el)) canvases.set(el, createCanvas(el.width || 300, el.height || 150)); return canvases.get(el); };
  for (const prop of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(w.HTMLCanvasElement.prototype, prop);
    Object.defineProperty(w.HTMLCanvasElement.prototype, prop, { get: d.get, set(v) { d.set.call(this, v); if (canvases.has(this)) canvases.get(this)[prop] = v; } });
  }
  w.HTMLCanvasElement.prototype.getContext = function() {
    const el = this, ctx = canvasFor(el).getContext('2d');
    return new Proxy(ctx, { get(target, prop) {
      if (prop === 'clearRect') return (...args) => { if (el.id === 'fx') calls.fxClears++; if (el.id === 'sky') calls.skyClears++; return target.clearRect(...args); };
      if (prop === 'createPattern') return (img, ...args) => target.createPattern(img instanceof w.HTMLCanvasElement ? canvasFor(img) : img, ...args);
      if (prop === 'drawImage') return (img, ...args) => target.drawImage(img instanceof w.HTMLCanvasElement ? canvasFor(img) : img, ...args);
      const v = target[prop]; return typeof v === 'function' ? v.bind(target) : v;
    }, set(target, prop, value) { target[prop] = value; return true; } });
  };
  Object.defineProperty(w.HTMLElement.prototype, 'offsetWidth', { get() {
    if (this.id === 'island') return parseFloat(this.style.width) || 98;
    if (this.id === 'stack') return 440;
    if (this.classList.contains('view')) return this.dataset.view === 'idle' ? 98 : 460;
    return 100;
  } });
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return this.offsetWidth; } });
  w.HTMLElement.prototype.getBoundingClientRect = function() {
    const width = this.offsetWidth, height = this.id === 'stack' ? 220 : 36, top = this.id === 'stack' ? 84 : 8, left = (700 - width) / 2;
    return { width, height, top, left, right: left + width, bottom: top + height, x: left, y: top };
  };
  w.addEventListener('error', e => errors.push(e.error || e.message));
  const settings = { skin, face: 'eyes', visuals: true, musicReact: true, toured: true, dndHint: true, autoHide: true };
  const on = name => cb => { (events[name] ||= []).push(cb); };
  const noop = () => {};
  const qazi = new Proxy({
    getSettings: async () => settings, speedo: async () => ({ok: false}), setTyping: async () => ({}), shelfGet: async () => [], notesGet: async () => [], clipsGet: async () => [], vaultList: async () => ({ items: [] }),
    setViz: value => calls.viz.push(value),
  }, { get(target, name) { return name in target ? target[name] : name.startsWith('on') ? on(name) : noop; } });
  w.qazi = qazi;
  w.eval(source);
  return { w, clock, calls, errors, emit(name, payload) { for (const cb of events[name] || []) cb(payload); }, close() { clock.uninstall(); dom.window.close(); } };
}

async function settled(t) { await t.clock.tickAsync(3000); assert.deepEqual(t.errors, []); }

test('Iron Man sleeps at rest, responds to native cursor, and sleeps again', async () => {
  const t = setup();
  try {
    await settled(t);
    assert.equal(t.w.document.body.style.getPropertyValue('--im-eye'), '0.000');
    let fx = t.calls.fxClears, sky = t.calls.skyClears;
    await t.clock.tickAsync(3000);
    assert.equal(t.calls.fxClears, fx, 'idle fx must not repaint');
    assert.equal(t.calls.skyClears, sky, 'idle sky must not repaint');
    t.emit('onCursor', { x: 0, y: 480 });
    await t.clock.tickAsync(300);
    assert.equal(t.calls.fxClears, fx, 'far-away mouse movement must not wake the visor');
    t.emit('onCursor', { x: 350, y: 70 });
    await t.clock.tickAsync(2500);
    assert.ok(Number(t.w.document.body.style.getPropertyValue('--im-eye')) > 0.5);
    fx = t.calls.fxClears;
    await t.clock.tickAsync(2000);
    assert.equal(t.calls.fxClears, fx, 'a still cursor does not keep repainting');
    t.emit('onCursor', { x: -100, y: 540 });
    await settled(t);
    assert.equal(t.w.document.body.style.getPropertyValue('--im-eye'), '0.000');
    assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('view changes, stack, skin switches and high DPI wake the renderer', async () => {
  const t = setup();
  try {
    await settled(t);
    const st = t.w.__qazi.st;
    st.force = 'tools'; t.w.__qazi.render(); await t.clock.tickAsync(1500);
    assert.ok(t.w.document.querySelector('[data-view="tools"]').classList.contains('on'));
    const fx = t.calls.fxClears;
    await t.clock.tickAsync(1000);
    assert.ok(t.calls.fxClears > fx, 'expanded reactor remains animated');
    st.holdUntil = t.w.Date.now() + 10000; t.w.__qazi.setStack(true, 'settings'); await t.clock.tickAsync(1000);
    assert.ok(st.stackOpen); assert.equal(t.w.document.querySelector('#fx').height, 856);
    t.w.__qazi.setStack(false); st.force = 'idle'; st.holdUntil = 0; t.w.__qazi.render(); await settled(t);
    t.emit('onSettings', { skin: 'spider', face: 'eyes', toured: true, dndHint: true }); await settled(t);
    assert.equal(t.w.document.querySelector('#fx').height, 720);
    t.emit('onSettings', { skin: 'black', face: 'eyes', toured: true, dndHint: true }); await settled(t);
    assert.equal(t.w.document.querySelector('#fx').height, 110);
    const before = t.calls.skyClears; await t.clock.tickAsync(2000); assert.equal(t.calls.skyClears, before);
    assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('full-screen tucked mode stops painting and audio capture, then resumes', async () => {
  const t = setup();
  try {
    await settled(t);
    t.emit('onHelper', { t: 'media', active: true, playing: true, pos: 0, dur: 100000, key: 'one', title: 'Track' });
    await t.clock.tickAsync(500); assert.equal(t.calls.viz.at(-1), true);
    t.emit('onHelper', { t: 'cover', covered: true, full: true });
    // Allow the app's normal reveal grace period to expire.
    await t.clock.tickAsync(5000); assert.equal(t.w.__qazi.st.tucked, true); assert.equal(t.calls.viz.at(-1), false);
    const n = t.calls.fxClears; await t.clock.tickAsync(2000); assert.equal(t.calls.fxClears, n);
    t.emit('onHelper', { t: 'cover', covered: false, full: false }); await t.clock.tickAsync(1000);
    assert.equal(t.w.__qazi.st.tucked, false); assert.equal(t.calls.viz.at(-1), true); assert.ok(t.calls.fxClears > n);
    assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('reduced-motion idle also settles', async () => {
  const t = setup('jarvis', true);
  try { await settled(t); const n = t.calls.fxClears; await t.clock.tickAsync(2000); assert.equal(t.calls.fxClears, n); assert.deepEqual(t.errors, []); } finally { t.close(); }
});

test('all themes render, switch away cleanly and tolerate open/close transitions', async () => {
  const t = setup('black');
  try {
    await settled(t);
    const st = t.w.__qazi.st;
    for (const skin of ['nebula', 'crystal', 'ember', 'reactor', 'venom', 'cloud', 'water', 'lava', 'ice', 'spider', 'jarvis', 'black']) {
      st.skin = skin; t.emit('onSettings', { skin, face: 'eyes', toured: true, dndHint: true });
      // Some legacy visual themes are not offered by the settings panel but remain supported by the renderer.
      st.skin = skin; st.force = 'tools'; t.w.__qazi.render();
      await t.clock.tickAsync(950);
      st.holdUntil = t.w.Date.now() + 3000; t.w.__qazi.setStack(true, 'notifs'); await t.clock.tickAsync(500);
      t.w.__qazi.setStack(false); st.force = 'idle'; st.holdUntil = 0; t.w.__qazi.render(); await t.clock.tickAsync(950);
      assert.deepEqual(t.errors, [], `${skin} produced a rendering error`);
    }
  } finally { t.close(); }
});

test('timer completion and notification still wake a sleeping renderer', async () => {
  const t = setup();
  try {
    await settled(t);
    const timer = t.w.__qazi.timer;
    timer.running = true; timer.endAt = t.w.Date.now() + 1300;
    t.w.__qazi.tick();
    await t.clock.tickAsync(2000);
    assert.equal(timer.running, false);
    assert.equal(timer.done, true);
    assert.equal(t.w.document.querySelector('[data-view="notif"]').classList.contains('on'), true);
    assert.ok(t.calls.fxClears > 0);
    assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});
