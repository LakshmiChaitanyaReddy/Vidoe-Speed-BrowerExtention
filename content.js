(() => {
  const KEY = "speeds"; // { [hostname]: rate }
  const OFF_KEY = "noRemember"; // { [hostname]: true } sites where remembering is switched off
  // Key by the top-level site so iframes (embedded players) share the page's setting.
  const HOST = (() => {
    try {
      const o = location.ancestorOrigins;
      if (o && o.length) return new URL(o[o.length - 1]).hostname || location.hostname;
    } catch (_) {}
    return location.hostname;
  })();
  const isTop = window.top === window;
  const STEP = 0.25;
  const MIN = 0.0625;
  const MAX = 16;

  let desired = null; // saved rate for this site, null = never set
  let remember = true; // false = speed applies to this page only, nothing is stored
  const badges = new WeakMap();

  const clamp = (r) => Math.min(MAX, Math.max(MIN, Math.round(r * 100) / 100));

  function save(rate) {
    desired = rate;
    if (!remember) return;
    chrome.storage.local.get(KEY, (d) => {
      const speeds = d[KEY] || {};
      speeds[HOST] = rate;
      chrome.storage.local.set({ [KEY]: speeds });
    });
  }

  function setRate(rate, persist = true) {
    rate = clamp(rate);
    if (persist) save(rate);
    else desired = rate;
    pushToSite(rate);
    document.querySelectorAll("video, audio").forEach((v) => {
      if (v.playbackRate !== rate) v.playbackRate = rate;
      flash(v);
    });
  }

  // Let the page's own player (e.g. YouTube) know, so its speed indicator updates.
  function pushToSite(rate) {
    document.dispatchEvent(new CustomEvent("vsm-set-rate", { detail: rate }));
  }

  // Remember the last real user interaction, to tell "user picked a speed in the
  // site's own menu" apart from "the site reset the speed on its own".
  let lastUser = { t: 0, menu: false, key: false };
  const MENU = '[role="menu"],[role="menuitem"],[role="listbox"],[role="option"],.ytp-panel,.ytp-popup,.ytp-menuitem';
  ["pointerdown", "keydown"].forEach((ev) =>
    window.addEventListener(ev, (e) => {
      if (!e.isTrusted) return;
      lastUser = {
        t: Date.now(),
        menu: !!(e.target.closest && e.target.closest(MENU)),
        key: e.type === "keydown" && (e.key === "<" || e.key === ">"),
      };
    }, true)
  );

  function setRemember(on) {
    remember = on;
    chrome.storage.local.get([KEY, OFF_KEY], (d) => {
      const speeds = d[KEY] || {};
      const off = d[OFF_KEY] || {};
      if (on) {
        delete off[HOST];
        if (desired != null) speeds[HOST] = desired;
      } else {
        off[HOST] = true;
        delete speeds[HOST];
      }
      chrome.storage.local.set({ [KEY]: speeds, [OFF_KEY]: off });
    });
  }

  function currentRate() {
    const v = document.querySelector("video");
    return desired ?? (v ? v.playbackRate : 1);
  }

  // --- on-video badge -------------------------------------------------------
  const fmt = (r) => String(Math.round(r * 100) / 100);

  function flash(video) {
    const b = badges.get(video);
    if (!b) return;
    const input = b.querySelector(".vsm-input");
    if (document.activeElement !== input) input.value = fmt(video.playbackRate);
    b.classList.add("vsm-show");
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove("vsm-show"), 1500);
  }

  function addBadge(video) {
    if (badges.has(video) || !video.parentElement || video.tagName !== "VIDEO") return;
    const parent = video.parentElement;
    if (getComputedStyle(parent).position === "static") return; // avoid breaking layout
    const b = document.createElement("div");
    b.className = "vsm-badge";
    b.innerHTML =
      '<button data-d="-1" title="Slower">−</button>' +
      '<input class="vsm-input" type="text" inputmode="decimal" title="Type a speed and press Enter">' +
      '<span class="vsm-x">×</span>' +
      '<button data-d="1" title="Faster">+</button>';
    const input = b.querySelector(".vsm-input");
    input.value = fmt(video.playbackRate);

    const commit = () => {
      const n = parseFloat(input.value.replace(",", "."));
      if (isFinite(n) && n > 0) setRate(n);
      input.value = fmt(video.playbackRate);
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // keep the site's shortcuts out of it
      if (e.key === "Enter") { commit(); input.blur(); }
      else if (e.key === "Escape") { input.value = fmt(video.playbackRate); input.blur(); }
    });
    ["keyup", "keypress"].forEach((ev) => input.addEventListener(ev, (e) => e.stopPropagation()));
    input.addEventListener("focus", () => input.select());
    input.addEventListener("blur", commit);

    b.addEventListener("click", (e) => {
      const d = e.target.dataset && e.target.dataset.d;
      e.stopPropagation();
      if (!d) return;
      e.preventDefault();
      setRate(video.playbackRate + Number(d) * STEP);
    }, true);
    ["dblclick", "mousedown"].forEach((ev) => b.addEventListener(ev, (e) => e.stopPropagation()));
    parent.appendChild(b);
    badges.set(video, b);
  }

  // --- video hookup ---------------------------------------------------------
  function hook(video) {
    if (video._vsm) return;
    video._vsm = true;

    const apply = () => {
      if (desired == null) return;
      if (video.playbackRate !== desired) {
        video.playbackRate = desired;
        pushToSite(desired);
      }
    };

    // Sites reset the rate when the source changes.
    ["loadstart", "loadedmetadata", "emptied", "play", "playing"].forEach((ev) =>
      video.addEventListener(ev, apply, true)
    );

    video.addEventListener("ratechange", () => {
      const rate = video.playbackRate;
      if (rate === desired) return;
      const recent = Date.now() - lastUser.t < 1500;
      const userPicked = recent && (lastUser.menu || lastUser.key);
      if (userPicked) {
        // chosen through the site's own UI: adopt and remember
        save(rate);
        document.querySelectorAll("video").forEach((v) => {
          if (v !== video && v.playbackRate !== rate) v.playbackRate = rate;
        });
        flash(video);
      } else if (desired != null) {
        // the site changed it by itself: put our speed back
        apply();
      }
    }, true);

    addBadge(video);
    apply();
  }

  function scan(root = document) {
    root.querySelectorAll && root.querySelectorAll("video").forEach(hook);
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.tagName === "VIDEO") hook(n);
        else scan(n);
      });
    }
  }).observe(document, { childList: true, subtree: true });

  // Typing in our speed box must never trigger the site's shortcuts.
  ["keydown", "keyup", "keypress"].forEach((ev) =>
    window.addEventListener(ev, (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("vsm-input")) e.stopImmediatePropagation();
    }, true)
  );

  // --- keyboard: Shift+< slower, Shift+> faster, Shift+? reset ---------------
  window.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.ctrlKey || e.metaKey || e.altKey || !e.shiftKey) return;
    if (!document.querySelector("video")) return;
    if (e.key === "<") setRate(currentRate() - STEP);
    else if (e.key === ">") setRate(currentRate() + STEP);
    else if (e.key === "?") setRate(1);
    else return;
    e.stopPropagation();
  }, true);

  // --- messages from the popup ----------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    const hasMedia = !!document.querySelector("video, audio");
    if (!hasMedia && !isTop) return; // let the frame with the video (or the top frame) answer
    if (msg.type === "get") {
      reply({ host: HOST, rate: currentRate(), remember, hasVideo: !!document.querySelector("video, audio") });
    } else if (msg.type === "set") {
      setRate(msg.rate);
      reply({ rate: desired });
    } else if (msg.type === "remember") {
      setRemember(msg.on);
      reply({ remember });
    } else if (msg.type === "reset") {
      // storage was already cleared by the popup; just go back to normal speed
      remember = true;
      setRate(1, false);
      desired = null;
      reply({});
    }
  });

  // --- init -----------------------------------------------------------------
  chrome.storage.local.get([KEY, OFF_KEY], (d) => {
    remember = !(d[OFF_KEY] || {})[HOST];
    const saved = (d[KEY] || {})[HOST];
    if (saved) desired = saved;
    scan();
    if (desired != null) setRate(desired, false);
  });
  document.addEventListener("DOMContentLoaded", () => scan());
})();
