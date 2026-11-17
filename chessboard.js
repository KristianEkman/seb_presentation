// Move generation demo: from the start position, make and unmake every legal
// move to depth 1, 2 or 3 and count the positions reached (perft 20 / 400 / 8,902).
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

  // Speed per depth. Depth 1 animates one step every `delay` ms. Deeper runs are
  // time-based (`rate` steps per ms) so they take ~7 s even if timers get throttled.
  const SPEED = {
    1: { delay: 450, moveMs: 350 },
    2: { delay: 16, rate: 0.18, moveMs: 0 },
    3: { delay: 16, rate: 4, moveMs: 0 },
  };
  const LOOP_PAUSE_MS = 2500;

  const glyph = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const backRank = "rnbqkbnr";

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

  // ---- Visual runner ----
  let timer = null, events = null, count = 0, depth = 1, lastTick = 0;

  function clearHighlights() {
    squareEls.forEach((el) => el.classList.remove("board__sq--hl"));
  }

  function apply(e, speed) {
    if (e.kind === "leaf") {
      count++;
      return;
    }
    const { m } = e;
    const piece = (e.kind === "make" ? board[m.to] : board[m.from]).el;
    piece.style.zIndex = 2;
    if (e.kind === "make") {
      place(piece, m.to);
      if (m.captured) m.captured.el.classList.add("board__piece--captured");
    } else {
      place(piece, m.from);
      if (m.captured) m.captured.el.classList.remove("board__piece--captured");
    }
    setTimeout(() => (piece.style.zIndex = ""), speed.moveMs + 50);
    if (speed.moveMs) {
      clearHighlights();
      if (e.kind === "make") [m.from, m.to].forEach((sq) => squareEls[sq].classList.add("board__sq--hl"));
    }
  }

  function tick() {
    const speed = SPEED[depth];
    const now = performance.now();
    const steps = speed.rate ? Math.max(1, Math.round((now - lastTick) * speed.rate)) : 1;
    lastTick = now;
    for (let i = 0; i < steps; i++) {
      const { value, done } = events.next();
      if (done) return finish();
      apply(value, speed);
    }
    countEl.textContent = count.toLocaleString("en-US");
    timer = setTimeout(tick, speed.delay);
  }

  function finish() {
    countEl.textContent = count.toLocaleString("en-US");
    clearHighlights();
    // Depth 1 keeps looping as the slide's idle animation; deeper runs hold their result.
    timer = depth === 1 ? setTimeout(() => run(1), LOOP_PAUSE_MS) : null;
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  function run(d) {
    stop();
    depth = d;
    count = 0;
    countEl.textContent = "0";
    root.style.setProperty("--move-ms", `${SPEED[d].moveMs}ms`);
    root.classList.toggle("board--instant", SPEED[d].moveMs === 0);
    buttons.forEach((b) => b.classList.toggle("is-active", Number(b.dataset.depth) === d));
    rows.forEach((r) => r.classList.toggle("is-active", Number(r.dataset.row) === d));
    clearHighlights();
    setupPosition();
    events = walk(d, "w");
    lastTick = performance.now() + (d === 1 ? 600 : 300);
    timer = setTimeout(tick, d === 1 ? 600 : 300);
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
