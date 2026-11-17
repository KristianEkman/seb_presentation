// Slide navigation: arrow keys, space, PageUp/PageDown, click, swipe, and #<n> in the URL.
(() => {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const bar = document.querySelector(".progress__bar");
  const counter = document.querySelector(".counter");
  let current = 0;

  // Screenshot slideshows: still until clicked, then 3s per image, looping. Click again to stop.
  // Optional data-audio="file" plays (looped) while the slideshow runs.
  const slideshows = Array.from(document.querySelectorAll("[data-slideshow]")).map((el) => {
    const imgs = Array.from(el.querySelectorAll("img"));
    const audio = el.dataset.audio ? new Audio(el.dataset.audio) : null;
    if (audio) { audio.loop = true; audio.preload = "auto"; }
    let i = 0, timer = null;
    const go = (n) => {
      imgs[i].classList.remove("is-current");
      i = n % imgs.length;
      imgs[i].classList.add("is-current");
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
      el.classList.remove("is-playing");
      if (audio) { audio.pause(); audio.currentTime = 0; }
      go(0);
    };
    el.addEventListener("click", () => {
      if (timer) return stop();
      el.classList.add("is-playing");
      audio?.play().catch(() => {});
      go(i + 1);
      timer = setInterval(() => go(i + 1), 3000);
    });
    return { el, stop };
  });

  function show(index) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((s, i) => s.classList.toggle("active", i === current));
    bar.style.width = `${((current + 1) / slides.length) * 100}%`;
    counter.textContent = `${current + 1} / ${slides.length}`;
    history.replaceState(null, "", `#${current + 1}`);
    slideshows.forEach((ss) => { if (!slides[current].contains(ss.el)) ss.stop(); });
    broadcast();
  }

  // Presenter view sync (press S to open presenter.html; notes live in notes.json).
  const channel = new BroadcastChannel("deck");
  const titles = slides.map((s) => (s.querySelector("h1, h2")?.textContent || "").trim());
  function broadcast() {
    channel.postMessage({ type: "state", index: current, total: slides.length, titles });
  }
  channel.onmessage = (e) => {
    if (e.data.type === "hello") broadcast();
    else if (e.data.type === "go") show(e.data.index);
  };

  const next = () => show(current + 1);
  const prev = () => show(current - 1);

  document.addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(slides.length - 1);
    else if (e.key === "s" || e.key === "S") window.open("presenter.html", "presenter", "width=900,height=600");
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("a, button, input, [data-slideshow]")) return;
    e.clientX < window.innerWidth / 3 ? prev() : next();
  });

  let touchX = null;
  document.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; });
  document.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchX = null;
  });

  const fromHash = parseInt(location.hash.slice(1), 10);
  show(Number.isFinite(fromHash) ? fromHash - 1 : 0);
})();
