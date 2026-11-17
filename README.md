# SEB AI Presentation

This is a presentation for SEB about AI.

It is developed using HTML and JavaScript.

It has pages like a PowerPoint presentation that you can navigate back and forth.

## Running

```bash
./start.sh
```

Serves the deck on http://localhost:8000 (or the next free port; override with `PORT=9000 ./start.sh`) and opens it in your browser.

Stop it with Ctrl+C, or from anywhere with:

```bash
./stop.sh
```

This stops every server started from this folder, whatever port it's on.

## Speaker notes

Press `S` during the presentation to open the presenter view (notes, next slide, timer).
Notes live in `notes.json` (git-ignored), keyed by slide number. Copy `notes.example.json` to get started.
Start with `./start.sh` so the notes file can load over HTTP.
