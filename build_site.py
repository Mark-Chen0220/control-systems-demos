"""Build the static GitHub Pages site from the local Python demo source."""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from natural_frequency_explorer import PAGE  # noqa: E402


CLIENT_MODEL = r"""
function modelClient(zeta, omega_n, duration) {
  const alpha=zeta*omega_n;
  let omega_d=null,theta=null,period=null,settling=null,overshoot=0,poles,regime;
  if(zeta<1){
    const beta=Math.sqrt(1-zeta*zeta);
    omega_d=omega_n*beta;
    poles=[[-alpha,omega_d],[-alpha,-omega_d]];
    regime=zeta===0?'Undamped':'Underdamped';
    theta=Math.acos(zeta)*180/Math.PI;
    overshoot=100*Math.exp(-Math.PI*zeta/beta);
    period=2*Math.PI/omega_d;
    if(alpha>0)settling=4/alpha;
  }else if(zeta===1){
    poles=[[-omega_n,0],[-omega_n,0]];
    regime='Critically damped';
  }else{
    const root=Math.sqrt(zeta*zeta-1);
    poles=[[-omega_n*(zeta-root),0],[-omega_n*(zeta+root),0]];
    regime='Overdamped';
  }
  function step(t){
    if(zeta<1){const beta=Math.sqrt(1-zeta*zeta),wd=omega_n*beta;
      return 1-Math.exp(-zeta*omega_n*t)*(Math.cos(wd*t)+zeta/beta*Math.sin(wd*t));}
    if(zeta===1)return 1-Math.exp(-omega_n*t)*(1+omega_n*t);
    const root=Math.sqrt(zeta*zeta-1),r1=-omega_n*(zeta-root),r2=-omega_n*(zeta+root);
    return 1+(r2*Math.exp(r1*t)-r1*Math.exp(r2*t))/(r1-r2);
  }
  const response=Array.from({length:900},(_,i)=>{const t=duration*i/899;return [t,step(t)]});
  return {zeta,omega_n,duration,alpha,omega_d,poles,regime,theta,overshoot,period,settling,response};
}
"""


INDEX = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Control Systems Demos</title><style>
body{font-family:Inter,Segoe UI,Arial,sans-serif;background:#edf3f7;color:#19324a;margin:0}
main{max-width:850px;margin:9vh auto;padding:28px}h1{font-size:42px;letter-spacing:-.04em;margin:0 0 12px}
p{color:#587087;line-height:1.6}a.card{display:block;text-decoration:none;color:inherit;background:#fff;border:1px solid #dce6ed;border-radius:15px;padding:25px;margin-top:28px;box-shadow:0 2px 7px #18344f0b}
a.card:hover{border-color:#42b9c1;transform:translateY(-2px)}.tag{color:#21887b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}
h2{margin:9px 0 4px}footer{font-size:13px;margin-top:48px;color:#71869a}
</style></head><body><main><div class="tag">Interactive learning</div><h1>Control Systems Demos</h1>
<p>Small experiments that connect equations, pole locations, and system behavior. Move the controls and test your intuition.</p>
<a class="card" href="natural-frequency.html"><div class="tag">Second-order systems</div><h2>Natural frequency and damping</h2>
<p>Adjust ζ and ωₙ; watch the poles and unit-step response change together.</p><strong>Open demo →</strong></a>
<footer>Each demo runs in your browser. No sign-in or data entry is needed.</footer></main></body></html>
"""


def build() -> None:
    api_call = "fetch(`/api?zeta=${z}&omega=${w}&duration=${t}`)"
    static_call = "Promise.resolve({ok:true,json:async()=>modelClient(z,w,t)})"
    if PAGE.count(api_call) != 1 or PAGE.count("async function update()") != 1:
        raise RuntimeError("Demo source changed; review the static conversion")
    html = PAGE.replace(api_call, static_call)
    html = html.replace("async function update()", CLIENT_MODEL + "\nasync function update()")
    target = ROOT / "natural-frequency.html"
    target.write_text(html, encoding="utf-8")
    (ROOT / "index.html").write_text(INDEX, encoding="utf-8")
    (ROOT / ".nojekyll").touch()
    print(f"Built {target}")


if __name__ == "__main__":
    build()
