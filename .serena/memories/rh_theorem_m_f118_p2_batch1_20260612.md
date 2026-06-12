# RH Theorem M F118 P2 clean-room batch 1 (2026-06-12)

Fable F117 promoted §1.4a to PROVED and opened publication-hardening P2 clean-room re-derivations. GPT started its queue with W1, W2, W3, A1 and patched `docs/rh/theorem_M_draft.md` §4a.

W1 PASS: from ODE `C''-(w/2d)C'+C=0`, `d_x(|C|^2+|C'|^2)=2Re(C'barC+C''barC')=2Re(C'barC+((w/2d)C'-C)barC')=(x/d)|C'|^2`. Cross terms cancel; imaginary part of `w` contributes no real part.

W2 PASS: Riccati `psi'=(w/2d)psi-1-psi^2`; vertical derivative `d_y|psi|^2=-(y/d)|psi|^2-2(1-|psi|^2)Im psi`. At critical wall foot `psi(c)=0`; with `Im psi<0`, a first upward crossing of `|psi|=1` is impossible since derivative at barrier is `-y/d<0`.

W3 PASS with wording hygiene: chain `|C(v(c+iy))|^2<=|C(vc+iy)|^2<=E(vc)<=E(c)=|C(c+iy)|^2(1+|psi(c+iy)|^2)<2|C(c+iy)|^2`. This uses W1 on `0<=vc<=c`, so the proof is for `c>=0`; negative walls follow by evenness. Patched §2.4 to say this explicitly. No mathematical change.

A1 PASS: the same Riccati identity holds on any vertical line. If `|psi|>1`, both terms in the derivative are strictly negative for `y>0` because `Im psi<0`; hence `|psi|` decreases while above 1 and cannot exceed `max(|psi(x+iH)|,1)` above height `H`.

Remaining GPT P2 queue: E1/E1b, E7a/E7b, X-wall chain, Corollary T, W2′, B_ref.