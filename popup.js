const KEY = "speeds";
const OFF_KEY = "noRemember";
const $ = (id) => document.getElementById(id);
const slider = $("rate"), num = $("num");
const MIN = 0.07, MAX = 16;

let host = null;
let canControl = false;

function send(msg) {
  return chrome.tabs.query({ active: true, currentWindow: true })
    .then(([tab]) => chrome.tabs.sendMessage(tab.id, msg));
}

const ARC = 251.33; // length of the gauge arc
const GAUGE_MAX = 4;
const PRESETS = [0.5, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

PRESETS.forEach((r) => {
  const b = document.createElement("button");
  b.className = "chip";
  b.dataset.r = r;
  b.textContent = r + "x";
  b.onclick = () => setRate(r);
  $("chips").appendChild(b);
});

function speedLabel(r) {
  if (r < 0.9) return "Slow-mo";
  if (r <= 1.05) return "Normal";
  if (r <= 1.5) return "Brisk";
  if (r <= 2.1) return "Fast";
  if (r <= 3) return "Turbo";
  return "Ludicrous";
}

let shown = null;
let countRaf = 0;
function show(rate) {
  const frac = Math.min(1, Math.max(0, rate / GAUGE_MAX));
  slider.value = rate;
  $("arc").style.strokeDashoffset = ARC * (1 - frac);
  $("label").textContent = speedLabel(rate);
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.r) === rate));

  // count the big number up/down smoothly
  const from = shown ?? rate, t0 = performance.now();
  cancelAnimationFrame(countRaf);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 350);
    const v = from + (rate - from) * (1 - Math.pow(1 - k, 3));
    $("big").textContent = Math.round(v * 100) / 100;
    if (k < 1) countRaf = requestAnimationFrame(step);
  };
  countRaf = requestAnimationFrame(step);
  if (shown !== null && shown !== rate) {
    const ro = $("readout");
    ro.classList.remove("pop");
    void ro.offsetWidth;
    ro.classList.add("pop");
  }
  shown = rate;
}

function setRate(rate) {
  rate = Math.round(Math.min(MAX, Math.max(MIN, rate)) * 100) / 100;
  show(rate);
  if (canControl) send({ type: "set", rate }).catch(() => {});
}

function applyCustom() {
  const n = parseFloat(num.value.trim().replace(",", ".").replace(/x$/i, ""));
  if (!isFinite(n) || n <= 0) {
    $("msg").textContent = "Enter a number like 1.75 (allowed: 0.07 – 16).";
    return;
  }
  $("msg").textContent = n > MAX || n < MIN ? `Clamped to ${n > MAX ? MAX : MIN}x.` : "";
  setRate(n);
  num.value = "";
  num.blur();
}

function showRemember(on) {
  $("remember").checked = on;
  $("state").textContent = on ? "ON" : "OFF";
  $("status").textContent = on ? "ACTIVE" : "INACTIVE";
  $("status").classList.toggle("active", on);
  $("rememberCard").classList.toggle("on", on);
  $("dot").classList.toggle("on", on);
}

slider.addEventListener("input", () => setRate(Number(slider.value)));
num.addEventListener("keydown", (e) => { if (e.key === "Enter") applyCustom(); });
$("setCustom").addEventListener("click", applyCustom);


$("remember").addEventListener("change", (e) => {
  showRemember(e.target.checked);
  if (canControl) send({ type: "remember", on: e.target.checked }).catch(() => {});
});

$("resetAll").addEventListener("click", async () => {
  await chrome.storage.local.remove([KEY, OFF_KEY]);
  if (canControl) { send({ type: "reset" }).catch(() => {}); show(1); showRemember(true); }
  renderSaved();
  $("msg").textContent = "All saved speeds cleared.";
});

$("viewSaved").addEventListener("click", () => {
  const el = $("saved");
  el.hidden = !el.hidden;
  if (!el.hidden) renderSaved();
});

async function renderSaved() {
  const el = $("saved");
  const speeds = (await chrome.storage.local.get(KEY))[KEY] || {};
  const hosts = Object.keys(speeds).sort();
  el.replaceChildren();
  if (!hosts.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No saved sites yet.";
    el.append(p);
    return;
  }
  hosts.forEach((h, n) => {
    const row = document.createElement("div");
    row.className = "item";
    row.style.setProperty("--n", n);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = h;
    const spd = document.createElement("span");
    spd.className = "spd";
    spd.textContent = speeds[h] + "x";
    const del = document.createElement("button");
    del.className = "del";
    del.title = "Forget this site";
    del.textContent = "✕";
    del.onclick = async () => {
      const cur = (await chrome.storage.local.get(KEY))[KEY] || {};
      delete cur[h];
      await chrome.storage.local.set({ [KEY]: cur });
      if (h === host && canControl) send({ type: "reset" }).catch(() => {});
      if (h === host) show(1);
      row.classList.add("out");
      setTimeout(renderSaved, 300);
    };
    row.append(name, spd, del);
    el.append(row);
  });
}

send({ type: "get" })
  .then((r) => {
    canControl = true;
    host = r.host;
    $("host").textContent = r.host;
    show(r.rate);
    showRemember(r.remember);
    if (!r.hasVideo) $("msg").textContent = "No video found on this page (yet).";
  })
  .catch(() => {
    showRemember(false);
    $("remember").disabled = true;
    slider.disabled = true;
    $("msg").textContent = "Can't control this page. Try reloading it.";
  });
