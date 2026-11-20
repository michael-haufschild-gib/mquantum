"""Bake with python3 scripts/modular-horizon/bake.py (NumPy and SciPy).
Coefficients from Booker, Strömbergsson and Venkatesh:
https://www2.math.uu.se/~ast10761/emaass/emaass.html
Chart z = 0.17 + 1.3i(1+w)/(1-w). Positive sine for odd forms.
"""
import gzip
import json
from pathlib import Path

import numpy as np
from scipy.special import roots_legendre

here = Path(__file__).resolve().parent
root = here.parents[1]
modes = json.loads((here / "coefficients.json").read_text())
freq = np.array([m["frequency"] for m in modes])
# Even trapezoidal quadrature for exp(pi*r/2) K_ir(v).
u = np.linspace(0, 5, 161)
weights = np.full(u.size, u[1])
weights[[0, -1]] *= .5
v = np.arange(5.38, 66, .002)
table = np.exp(-v[:, None]*np.cosh(u)) @ (np.cos(u[:, None]*freq)*weights[:, None]*np.exp(.5*np.pi*freq))

def basis(x, y):
    fields = []
    for j, mode in enumerate(modes):
        field = np.zeros_like(x)
        trig = np.sin if mode["odd"] else np.cos
        for n, a in enumerate(mode["coefficients"], 1):
            k = 2*np.pi*n
            field += a*trig(k*x)*np.interp(k*y, v, table[:, j], right=0)
        fields.append(field*np.sqrt(y))
    return np.array(fields)

q, qw = roots_legendre(120)
x = np.broadcast_to(q[:, None]/2, (q.size, q.size))
bottom = np.sqrt(1-x*x)
y = bottom+(q[None, :]+1)*(12-bottom)/2
mu = qw[:, None]*qw[None, :]*(12-bottom)/(4*y*y)
fields = basis(x, y).reshape(3, -1)
gram = (fields*mu.ravel()) @ fields.T
norm = np.sqrt(gram.diagonal())
assert np.max(abs(gram/np.outer(norm,norm)-np.eye(3))) < 1e-5
for mode, scale in zip(modes, norm):
    mode["norm"] = float(scale)
(root/"src/lib/physics/modularHorizon/modes.json").write_text(json.dumps(modes, indent=2)+"\n")

# Each mip carries means of U_i, U_i², and U_i U_j independently.
size = 1024
row, col = np.indices((size,size))
w = ((col+.5)/size*2-1) + 1j*(1-(row+.5)/size*2)
mask = abs(w)<1
w = w[mask]
z = .17+1.3j*(1+w)/(1-w)
for _ in range(40):
    z -= np.floor(z.real+.5)
    invert = abs(z)<1-1e-13
    if not np.any(invert): break
    z[invert] = -1/z[invert]
assert np.min(abs(z))>.999999
a,b,c = basis(z.real,z.imag)/norm[:,None]
tiles = np.minimum(np.arcsinh((.5-abs(z.real))/z.imag),np.arcsinh((abs(z)**2-1)/(2*z.imag)))
line = np.exp(-2*(tiles*size*(1-abs(w)**2)/4)**2)
atlas = np.zeros((3,size,size,4),np.float32)
atlas[:,mask,:] = np.stack([np.stack(group,axis=-1) for group in [(a,b,c,line),(a*a,b*b,c*c,line),(a*b,b*c,c*a,line)]])
path = root/'public/data/modular-horizon/basis.atlas'
with path.open('wb') as dest, gzip.GzipFile(fileobj=dest,mode='wb',mtime=0) as out:
    while size>1:
        # First 2x2 reduction antialiases the shipped 512-square base.
        atlas=atlas.reshape(3,size//2,2,size//2,2,4).mean(axis=(2,4))
        size//=2
        out.write(atlas.astype('<f2').tobytes())
