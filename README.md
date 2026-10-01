# Control systems demos

Two browser-only teaching tools for PIC and feedback analysis. No account, data upload, or build step is required to use the demos.

- [Pole–Zero Bode Studio](./bode/): add real LHP/RHP poles and zeros and compare magnitude and phase.
- [Nyquist Plotter](./nyquist/): enter a real-coefficient transfer function and inspect its Nyquist curve.

The site is published from the `main` branch root with GitHub Pages. `index.html` is the guide and each demo is in its own folder. The original app sources are maintained separately in the PIC workspace; this repository contains the static site copies.

## Notes

The Bode tool uses factors normalized to one at DC and shows unwrapped phase. The Nyquist tool evaluates the entered function at `s = j2πf` for the selected frequency range. Neither plot by itself proves closed-loop stability without the loop definition and open-loop RHP pole count.
