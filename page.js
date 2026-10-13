// Runs in the page's own JS world so it can call the site's player API.
document.addEventListener("vsm-set-rate", (e) => {
  const rate = e.detail;
  // YouTube: going through the player updates its settings-menu speed label.
  const yt = document.getElementById("movie_player") || document.querySelector(".html5-video-player");
  if (yt && typeof yt.setPlaybackRate === "function" && yt.getPlaybackRate?.() !== rate) {
    try { yt.setPlaybackRate(rate); } catch (_) {}
  }
});
