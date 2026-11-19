// Move generation demo: from the start position, count every position reached at
// depth 1, 2 or 3 (perft 20 / 400 / 8,902). Every move is shown: depth 1 at a calm
// pace, deeper runs start at that pace and speed up until the whole tree is walked.
// Castling, en passant and promotion can't occur within 3 plies of the start
// position, so the generator leaves them out.
(() => {
  const root = document.querySelector("[data-chessboard]");
  const panel = document.querySelector("[data-movegen]");
  if (!root || !panel) return;
  const slide = root.closest(".slide");
  const countEl = panel.querySelector("[data-count]");
  const buttons = Array.from(panel.querySelectorAll("[data-depth]"));
  const rows = Array.from(panel.querySelectorAll("[data-row]"));

  // Timing (ms). Pieces glide for MOVE_MS; the next step waits for the delays below.
  const MOVE_MS = 450;
  const DELAY = { make: 750, unmake: 500, pause: 700 };
  const RUN_MS = { 2: 15000, 3: 20000 }; // how long a full depth-2 / depth-3 walk takes
  const START_RATE = 1.6; // move events per second at the start (about the depth-1 pace)
  const LOOP_PAUSE_MS = 2500;

  const glyph = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const backRank = "rnbqkbnr";

  // Dark frame around the board with file (a–h) and rank (1–8) labels
  const boardFrame = document.createElement("div");
  boardFrame.className = "board-frame";
  root.replaceWith(boardFrame);
  boardFrame.appendChild(root);
  const files = document.createElement("div");
  files.className = "board-frame__files";
  const ranks = document.createElement("div");
  ranks.className = "board-frame__ranks";
  for (let i = 0; i < 8; i++) {
    const f = document.createElement("span");
    f.textContent = "abcdefgh"[i];
    files.appendChild(f);
    const r = document.createElement("span");
    r.textContent = String(8 - i);
    ranks.appendChild(r);
  }
  boardFrame.append(files, ranks);

  // Squares (drawn rank 8 at the top)
  const squareEls = [];
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const el = document.createElement("div");
      el.className = "board__sq " + ((file + row) % 2 ? "board__sq--dark" : "board__sq--light");
      root.appendChild(el);
      squareEls[(7 - row) * 8 + file] = el; // index by square: rank * 8 + file
    }
  }

  // ---- Board state: board[sq] = { t: type, c: "w" | "b", el } or null ----
  let board = [];

  const place = (el, sq) => {
    el.style.transform = `translate(${(sq % 8) * 100}%, ${(7 - (sq >> 3)) * 100}%)`;
  };

  function setupPosition() {
    root.querySelectorAll(".board__piece").forEach((el) => el.remove());
    board = new Array(64).fill(null);
    const add = (t, c, sq) => {
      const el = document.createElement("div");
      el.className = `board__piece board__piece--${c}`;
      el.textContent = glyph[t] + "︎";
      root.appendChild(el);
      place(el, sq);
      board[sq] = { t, c, el };
    };
    for (let f = 0; f < 8; f++) {
      add(backRank[f], "w", f);
      add("p", "w", 8 + f);
      add("p", "b", 48 + f);
      add(backRank[f], "b", 56 + f);
    }
  }

  // ---- Move generation ----
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

  function pseudoMoves(side) {
    const moves = [];
    const push = (from, to) => moves.push({ from, to, captured: board[to] });
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p || p.c !== side) continue;
      const f = sq % 8, r = sq >> 3;
      const target = (tf, tr) => {
        if (!onBoard(tf, tr)) return "off";
        const q = board[tr * 8 + tf];
        return !q ? "empty" : q.c === side ? "own" : "enemy";
      };
      const steps = (dirs) => {
        for (const [df, dr] of dirs) {
          const s = target(f + df, r + dr);
          if (s === "empty" || s === "enemy") push(sq, (r + dr) * 8 + f + df);
        }
      };
      const slides = (dirs) => {
        for (const [df, dr] of dirs) {
          for (let k = 1; ; k++) {
            const s = target(f + df * k, r + dr * k);
            if (s === "off" || s === "own") break;
            push(sq, (r + dr * k) * 8 + f + df * k);
            if (s === "enemy") break;
          }
        }
      };
      if (p.t === "p") {
        const dir = side === "w" ? 1 : -1, startRank = side === "w" ? 1 : 6;
        if (target(f, r + dir) === "empty") {
          push(sq, (r + dir) * 8 + f);
          if (r === startRank && target(f, r + 2 * dir) === "empty") push(sq, (r + 2 * dir) * 8 + f);
        }
        for (const df of [-1, 1]) if (target(f + df, r + dir) === "enemy") push(sq, (r + dir) * 8 + f + df);
      } else if (p.t === "n") steps(KNIGHT);
      else if (p.t === "k") steps(KING);
      else if (p.t === "b") slides(DIAG);
      else if (p.t === "r") slides(ORTHO);
      else slides([...DIAG, ...ORTHO]);
    }
    return moves;
  }

  const make = (m) => { board[m.to] = board[m.from]; board[m.from] = null; };
  const unmake = (m) => { board[m.from] = board[m.to]; board[m.to] = m.captured; };
  const other = (side) => (side === "w" ? "b" : "w");

  function legalMoves(side) {
    return pseudoMoves(side).filter((m) => {
      make(m);
      const king = board.findIndex((p) => p && p.t === "k" && p.c === side);
      const inCheck = pseudoMoves(other(side)).some((x) => x.to === king);
      unmake(m);
      return !inCheck;
    });
  }

  // Depth-first walk that yields an event after each make / unmake / leaf.
  function* walk(depth, side) {
    for (const m of legalMoves(side)) {
      make(m);
      yield { kind: "make", m };
      if (depth === 1) yield { kind: "leaf" };
      else yield* walk(depth - 1, other(side));
      unmake(m);
      yield { kind: "unmake", m };
    }
  }

  // Number of make + unmake events in a full walk (runs instantly; the board is restored after).
  function countMoveEvents(depth) {
    let n = 0;
    for (const e of walk(depth, "w")) if (e.kind !== "leaf") n++;
    return n;
  }

  // Deeper runs walk every position, starting at the calm depth-1 pace and speeding up
  // exponentially: rate(t) = START_RATE * e^(k t). Pick k so the walk ends after RUN_MS.
  function solveGrowth(events, seconds) {
    const done = (k) => (START_RATE / k) * (Math.exp(k * seconds) - 1);
    let lo = 1e-6, hi = 10;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (done(mid) < events) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ---- Visual runner ----
  let timer = null, frame = null, events = null, count = 0, depth = 1;
  let runStart = 0, growth = 0, moveEvents = 0, applied = 0;

  function clearHighlights() {
    squareEls.forEach((el) => el.classList.remove("board__sq--hl"));
  }

  const showCount = (n) => (countEl.textContent = n.toLocaleString("en-US"));

  function apply(e, glideMs = MOVE_MS) {
    if (e.kind === "leaf") {
      showCount(++count);
      return;
    }
    if (e.kind === "pause") return;
    const { m } = e;
    const piece = (e.kind === "make" ? board[m.to] : board[m.from]).el;
    const transition = `transform ${glideMs}ms ease, opacity ${glideMs}ms ease`;
    piece.style.transition = transition;
    if (m.captured) m.captured.el.style.transition = transition;
    piece.style.zIndex = 2;
    if (e.kind === "make") {
      place(piece, m.to);
      if (m.captured) m.captured.el.classList.add("board__piece--captured");
    } else {
      place(piece, m.from);
      if (m.captured) m.captured.el.classList.remove("board__piece--captured");
    }
    setTimeout(() => (piece.style.zIndex = ""), glideMs + 50);
    clearHighlights();
    if (e.kind === "make") [m.from, m.to].forEach((sq) => squareEls[sq].classList.add("board__sq--hl"));
  }

  // Depth 1: one event at a time at the calm pace.
  function tick() {
    const { value, done } = events.next();
    if (done) return finish();
    apply(value);
    timer = setTimeout(tick, value.kind === "leaf" ? 0 : DELAY[value.kind]);
  }

  // Depth 2 and 3: each frame, apply as many events as the accelerating schedule allows.
  function step(now) {
    const t = Math.max(0, (now - runStart) / 1000);
    const target = Math.min(moveEvents, (START_RATE / growth) * (Math.exp(growth * t) - 1) + 1);
    const rate = START_RATE * Math.exp(growth * t); // move events per second right now
    const glideMs = Math.round(Math.min(MOVE_MS, (1000 / rate) * 0.8));
    while (applied < target) {
      const { value, done } = events.next();
      if (done) { frame = null; return finish(); }
      apply(value, glideMs < 30 ? 0 : glideMs);
      if (value.kind !== "leaf") applied++;
    }
    frame = requestAnimationFrame(step);
  }

  function finish() {
    clearHighlights();
    // Depth 1 keeps looping as the slide's idle animation; deeper runs hold their result.
    timer = depth === 1 ? setTimeout(() => run(1), LOOP_PAUSE_MS) : null;
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = frame = null;
  }

  function run(d) {
    stop();
    depth = d;
    count = 0;
    showCount(0);
    buttons.forEach((b) => b.classList.toggle("is-active", Number(b.dataset.depth) === d));
    rows.forEach((r) => r.classList.toggle("is-active", Number(r.dataset.row) === d));
    clearHighlights();
    setupPosition();
    if (d === 1) {
      events = walk(1, "w");
      timer = setTimeout(tick, 400);
    } else {
      moveEvents = countMoveEvents(d);
      growth = solveGrowth(moveEvents, RUN_MS[d] / 1000);
      applied = 0;
      events = walk(d, "w");
      timer = setTimeout(() => {
        runStart = performance.now();
        frame = requestAnimationFrame(step);
      }, 400);
    }
  }

  buttons.forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation(); // don't advance the slide
      run(Number(b.dataset.depth));
    })
  );
  // Keep key presses on a focused button from also activating it via Enter/Space.
  buttons.forEach((b) => b.addEventListener("keydown", (e) => e.preventDefault()));

  // Start at depth 1 when the slide is shown; stop when it's hidden.
  let wasActive = false;
  function sync() {
    const active = slide.classList.contains("active");
    if (active && !wasActive) run(1);
    else if (!active && wasActive) stop();
    wasActive = active;
  }
  setupPosition();
  new MutationObserver(sync).observe(slide, { attributes: true, attributeFilter: ["class"] });
  sync();
})();
