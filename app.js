const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const SAMPLE_RATE = 48000;

const recipes = [
  { id:"piano-motif", name:"Piano motif", blurb:"Short piano figure on the 1 and 3." },
  { id:"nylon-answer", name:"Nylon answer", blurb:"Nylon answers the piano on offbeats." },
  { id:"trumpet-call", name:"Trumpet call", blurb:"Trumpet states the motif once per bar." },
  { id:"violin-hold", name:"Violin hold", blurb:"Violin sustains the third of the chord." },
  { id:"bass-walk", name:"Bass walk", blurb:"Upright walks the motif down." }
];

const grooves = [
  { id:"amber", name:"Amber", bpm:92, key:"A minor",
    chords:["Am","F","C","G","Am","F","C","G"] },
  { id:"porch", name:"Porch", bpm:86, key:"E major",
    chords:["E","B","C#m","A","E","B","C#m","A"] },
  { id:"fold", name:"Fold", bpm:104, key:"D minor",
    chords:["Dm","Bb","F","C","Dm","Bb","F","C"] }
];

const state = {
  groove: grooves[0],
  recipe: recipes[0],
  bpm: 92,
  key: "A minor",
  bars: 8,
  playing: false,
  step: 0,
  nextStepTime: 0,
  mode: null,
  mutes: {},
  activeSources: []
};

let ctx, master, compressor, timerId = null;
let buffers = {};
let rawBuffers = {};

const chordNotes = {
  "Am": [57,60,64,67], "F": [53,57,60,65], "C": [48,52,55,60], "G": [43,47,50,55],
  "E": [40,44,47,52], "B": [35,39,42,47], "C#m": [44,47,51,56], "A": [33,37,40,45],
  "Dm": [38,41,45,50], "Bb": [34,38,41,46]
};

async function loadSamples() {
  const files = [
    ["kick","drums/kick.mp3"],["snare","drums/snare.mp3"],["hat","drums/hihat.mp3"],
    ["pianoC3","piano/C3.mp3"],["pianoC4","piano/C4.mp3"],["pianoA3","piano/A3.mp3"],
    ["bassE1","bass/E1.mp3"],["bassA1","bass/A1.mp3"],
    ["guitarE2","guitar/E2.mp3"],["guitarA2","guitar/A2.mp3"],
    ["trumpetC4","trumpet/C4.mp3"],["violinA3","violin/A3.mp3"]
  ];
  let loaded = 0;
  const missing = [];
  for (const [k, path] of files) {
    try {
      const r = await fetch(`${CDN}/${path}`);
      if (!r.ok) throw new Error("not ok");
      const ab = await r.arrayBuffer();
      rawBuffers[k] = ab;
      buffers[k] = await ctx.decodeAudioData(ab.slice(0));
    } catch (e) {
      missing.push(k);
    }
    loaded++;
    document.getElementById("status").textContent = `Seating chairs ${loaded}/${files.length}`;
  }
  if (missing.length) {
    document.getElementById("status").textContent = `Missing: ${missing.join(", ")}`;
    return false;
  }
  document.getElementById("status").textContent = "Chairs seated · live FluidR3";
  return true;
}

function playSample(name, when, rate = 1, gain = 0.4, duration = 0.2) {
  const buf = buffers[name];
  if (!buf || !ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.01);
  g.gain.linearRampToValueAtTime(gain * 0.7, when + duration * 0.8);
  g.gain.linearRampToValueAtTime(0, when + duration);
  src.connect(g);
  g.connect(master);
  src.start(when);
  src.stop(when + duration + 0.05);
  state.activeSources.push(src);
  return src;
}

function rateForMidi(midi, base = 60) {
  const semi = midi - base;
  if (Math.abs(semi) > 4) return 1;
  return Math.pow(2, semi / 12);
}

function scheduleStep(step, when) {
  const stepDur = 60 / state.bpm / 4;
  const bar = Math.floor(step / 16);
  const stepInBar = step % 16;
  const chordName = state.groove.chords[bar % state.groove.chords.length];
  const notes = chordNotes[chordName] || [60,64,67];

  if (stepInBar % 2 === 0) playSample("hat", when, 1, 0.08, 0.1);
  if (stepInBar === 0) playSample("kick", when, 1, 0.6, 0.15);
  if (stepInBar === 8) playSample("snare", when, 1, 0.45, 0.15);

  if (stepInBar === 0) {
    const bassMidi = notes[0] - 24;
    playSample("bassA1", when, rateForMidi(bassMidi, 33), 0.5, stepDur * 4);
  }

  const rec = state.recipe.id;
  if (rec === "piano-motif" && (stepInBar === 0 || stepInBar === 8)) {
    playSample("pianoC4", when, rateForMidi(notes[1], 60), 0.35, 0.3);
  }
  if (rec === "nylon-answer" && stepInBar === 4) {
    playSample("guitarA2", when, rateForMidi(notes[2], 45), 0.3, 0.25);
  }
  if (rec === "trumpet-call" && stepInBar === 0) {
    playSample("trumpetC4", when, rateForMidi(notes[2], 60), 0.4, 0.4);
  }
  if (rec === "violin-hold" && stepInBar === 0) {
    playSample("violinA3", when, rateForMidi(notes[1], 57), 0.25, stepDur * 8);
  }
  if (rec === "bass-walk" && stepInBar === 4) {
    playSample("bassE1", when, rateForMidi(notes[0]-12, 28), 0.4, 0.2);
  }
}

function scheduler() {
  while (state.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(state.step, state.nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    state.nextStepTime += stepDur;
    state.step = (state.step + 1) % (state.bars * 16);
  }
}

function start() {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  stop();
  state.playing = true;
  state.nextStepTime = ctx.currentTime + 0.1;
  state.step = 0;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  requestAnimationFrame(updatePlayhead);
}

function stop() {
  state.playing = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  state.activeSources.forEach(s => { try { s.stop(); } catch(e){} });
  state.activeSources = [];
  document.querySelectorAll(".bar").forEach(b => b.classList.remove("active"));
}

function updatePlayhead() {
  if (!state.playing) return;
  const bar = Math.floor(state.step / 16) % state.bars;
  document.querySelectorAll(".bar").forEach((el, i) => {
    el.classList.toggle("active", i === bar);
  });
  requestAnimationFrame(updatePlayhead);
}

async function exportWav() {
  const length = Math.round(state.bars * 4 * 60 / state.bpm * SAMPLE_RATE);
  const offline = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const rendered = await offline.startRendering();
  downloadWav(rendered, `MotifFour-recipe-${state.bpm}bpm-${state.key.replace(" ","")}.wav`);
}

function downloadWav(buffer, name) {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const len = left.length;
  const data = new Int16Array(len * 2);
  for (let i = 0; i < len; i++) {
    data[i*2] = Math.max(-1, Math.min(1, left[i])) * 0x7FFF;
    data[i*2+1] = Math.max(-1, Math.min(1, right[i])) * 0x7FFF;
  }
  const blob = new Blob([wavHeader(len, SAMPLE_RATE), data], {type:"audio/wav"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function wavHeader(samples, rate) {
  const h = new ArrayBuffer(44);
  const v = new DataView(h);
  const w = (o,s) => { for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  w(0,"RIFF"); v.setUint32(4, 36+samples*4, true); w(8,"WAVE"); w(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true);
  v.setUint32(24,rate,true); v.setUint32(28,rate*4,true); v.setUint16(32,4,true); v.setUint16(34,16,true);
  w(36,"data"); v.setUint32(40, samples*4, true);
  return h;
}

function exportMidi() {
  const blob = new Blob(["MThd\x00\x00\x00\x06\x00\x01\x00\x01\x01\xe0"], {type:"audio/midi"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `MotifFour-recipe-${state.bpm}bpm-${state.key.replace(" ","")}.mid`;
  a.click();
}

function render() {
  const gEl = document.getElementById("grooves");
  gEl.innerHTML = "";
  grooves.forEach(g => {
    const b = document.createElement("button");
    b.className = "card" + (state.groove.id === g.id ? " on" : "");
    b.innerHTML = `<b>${g.name}</b><span>${g.bpm} BPM · ${g.key}</span>`;
    b.onclick = () => { state.groove = g; state.bpm = g.bpm; state.key = g.key; document.getElementById("bpm").value = g.bpm; render(); };
    gEl.appendChild(b);
  });
  const rEl = document.getElementById("recipes");
  rEl.innerHTML = "";
  recipes.forEach(r => {
    const b = document.createElement("button");
    b.className = "card" + (state.recipe.id === r.id ? " on" : "");
    b.innerHTML = `<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick = () => { state.recipe = r; render(); };
    rEl.appendChild(b);
  });
  const bEl = document.getElementById("bars");
  bEl.innerHTML = "";
  for (let i = 0; i < state.bars; i++) {
    const d = document.createElement("div");
    d.className = "bar" + (i >= 4 ? " motif" : "");
    d.innerHTML = `<div class="n">${i+1}</div><div class="c">${state.groove.chords[i % state.groove.chords.length]}</div>`;
    bEl.appendChild(d);
  }
  document.getElementById("punch").textContent = punch();
}

function punch() {
  return `MotifFour punch list\n${state.groove.name} · ${state.bpm} BPM · ${state.key} · ${state.recipe.name}\n\nThe problem: sections dump chords without identity.\nThe move: ${state.recipe.blurb}\n\nLive chairs only. Distinct from TagFour, ModEight, LiftTwo, PreEight, AfterHook, EndEight, LastHook.\nDrop the WAV on the section.`;
}

document.getElementById("playA").onclick = () => { state.mode = "loop"; start(); };
document.getElementById("playB").onclick = () => { state.mode = "motif"; start(); };
document.getElementById("play8").onclick = () => { state.mode = "eight"; start(); };
document.getElementById("stop").onclick = stop;
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(punch());
document.getElementById("exportWav").onclick = exportWav;
document.getElementById("exportMid").onclick = exportMidi;
document.getElementById("bpm").onchange = e => { state.bpm = +e.target.value; };
document.getElementById("key").onchange = e => { state.key = e.target.value; };
document.getElementById("bars").onchange = e => { state.bars = +e.target.value; render(); };

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});

async function init() {
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.8;
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -1;
  compressor.knee.value = 0;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.1;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  document.getElementById("status").textContent = "Tap to start audio";
  document.body.addEventListener("click", async () => {
    if (ctx.state === "suspended") await ctx.resume();
  }, {once:true});
  await loadSamples();
  render();
}
window.addEventListener("beforeunload", () => {
  localStorage.setItem("motifFour", JSON.stringify({bpm:state.bpm, key:state.key, bars:state.bars}));
});
init();
