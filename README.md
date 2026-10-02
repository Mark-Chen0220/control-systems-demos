# Control Systems Demos

Interactive, self-contained teaching demos for control systems.

The gallery links to the natural-frequency explorer, Pole–Zero Bode Studio, and Nyquist Plotter.

## Local preview

Run `python build_site.py`, then `python -m http.server 8000` and open `http://127.0.0.1:8000/`.

The original Python version of the natural-frequency demo is in `natural_frequency_explorer.py`. Run it with `python natural_frequency_explorer.py`.

## Publishing

This repository is prepared for GitHub Pages with **Deploy from a branch → main → /(root)**. After editing a demo, run `python build_site.py`, review the resulting site, commit, and push. GitHub Pages publishes the updated files at stable URLs.

`build_site.py` regenerates the natural-frequency page and gallery. The Bode and Nyquist demos live in their own directories and can be edited there. Add a gallery card for each future demo in `build_site.py`.

For each topic, place the live demo URL in the corresponding Notion lesson with a short explanation and a few slider experiments. The lesson link stays the same after later site updates.

Only original demo code and generated site files belong in this repository. Course PDFs and textbook images are intentionally excluded.
