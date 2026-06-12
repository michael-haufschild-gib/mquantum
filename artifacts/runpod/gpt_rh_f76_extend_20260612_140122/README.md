# GPT RH F76 Extended Cache Archive

Archive created from GPT's dedicated Runpod endpoint:

```text
ssh root@157.157.221.30 -p 12784 -i ~/.ssh/id_ed25519
```

Remote workdir:

```text
/workspace/gpt_rh/f76_extend/run_20260612_114257
```

Run:

```text
gpt_xihead_audit.py --workdir run_20260612_114257 --jmax 360 --degree 1 --dps 300 --workers 4 --nmax 50 --shifts "" --samples 64
```

Contents:

- `run_20260612_114257/xi_log_moments.json`: cached log moments through `j=360`.
- `run_20260612_114257/xihead_audit_events.jsonl`: run event log.
- `run_20260612_114257/f76_sinf_extended.json`: remote F76 diagnostic from the helper available on the pod.
- `f76_sinf_extended_local.json`: local recomputation with additional `c0(k)` rows and residual block signs.
- `f76_tail_diagnostics.txt`: plain-text tail audit from the archived cache.
- `f228_telescoping.json`: exact telescoping diagnostic for `C(k)=(LG_1-LG_0)-(LG_{k+1}-LG_k)`.
- `remote_manifest.txt`: remote environment, process state, file sizes, and remote SHA-256 hashes.
- `gpt_xihead_audit.py`, `gpt_f76_sinf_cache.py`, `latest.out`, `latest.err`, `latest.pid`: scripts and top-level run files copied from the pod.

Key result:

```text
S(40)  = 0.9720053891554054548522328445142213661365812686572
S(80)  = 0.98701943999881836237680163814744047339350849590399
S(120) = 0.99229137140882323448971075190484744548652668087294
S(166) = 0.99529285471291903956943367033374809002476972322022
S(200) = 0.99664636718784532849770632374273866690333286722146
S(240) = 0.9977596685505956925491843362458360459663566865145
S(280) = 0.99856225343505658415804788437317843847048105402231
S(320) = 0.999168682283630483567809559355026294686263082815
S(359) = 0.99963266628162076474285401355869058581433797707528
```

Interpretation:

The earlier target `S_inf=0.99870846` is crossed by the extended cache. Direct
constant diagnostics remain close to the `e` scale but now from the other side:

```text
c0(166) = -1.001765295220596022542166972242924563792
c0(240) = -0.9997496107061855533106747394961830115695
c0(359) = -0.9982364279015664681907889329184881254312
exp(-c0(359))/e = 0.998237982081069529525717485338745341061
```

The residual blocks `c_j-c_j^W` are still positive through `321-359`; the last
stored residual is about `1.06632e-5`. Therefore the one-term W-telescoping
constant is not settled by this cache. The proof debt is now sharper: derive
the next asymptotic correction or a certified tail bound, rather than treating
the `e` constant as numerically confirmed.

F228 update:

```text
LG_j = log(moment_j) + log Gamma(j+1) - log Gamma(2j+1)
C(k)=sum_{j=1}^k c_j=(LG_1-LG_0)-(LG_{k+1}-LG_k)
A=LG_1-LG_0=log(M_2/(2M_0))
```

Normalized moments and target:

```text
M_0 = 0.49712077818831410991277373968539771980729360955770518593323423399849552904554349
M_2 = 0.022971944315145437535249876497632170264593013837589063499144622165183631858892554
A   = -3.7677065326292670057110312914149004284968287898000080944579008087128584571928877
A-1 = -4.7677065326292670057110312914149004284968287898000080944579008087128584571928877
```

The intermediate `S_inf=1` hypothesis used this analytic saddle target:

```text
LG_{k+1}-LG_k+C^W(k) -> A-1.
```

At `k=359`, `S(k)=0.99963266628162076474285401355869058581433797707528`, so
the remaining gap to `1` is `0.00036733371837923525714598644130941418566202292471872`.

F88 supersession:

Fable's F88 closed form supersedes both the earlier `e` scale and the
intermediate `S_inf=1` hypothesis. The cache verifies:

```text
c0 = log(8 M_2/M_0)
   = -0.99511781038948576804210280558219415619482825235898707797518077073928396931410885
exp(-c0)
   = 2.7050430046781109373306180620323100273605569639163249930615102194788091615481771
```

Using `C*=1.28796206` in `c0^W = EulerGamma - 2C*` gives:

```text
S_inf = c0 - c0^W
      = 1.0035906447089811886611843592073082627691159273260893232190519943758483039082265
S_inf - S(359)
      = 0.003957978427360423918330345648617676954777950250808
```

Scale trajectory:

```text
r_160/W^2 = 2.73226051121661801871185712492089545598
r_200/W^2 = 2.72686682592145691034408314069447902419
r_240/W^2 = 2.72326295433932368758618559974338205203
r_280/W^2 = 2.72068395615880188279495597466961967575
r_320/W^2 = 2.71874663661259126334020788544012960488
r_359/W^2 = 2.71727140417022488720545397987265005169
```

Watson ratio check:

```text
M_161/M_160 / (W(320/pi)/2)^2 = 1.01006176481905723100607236310293079078
M_201/M_200 / (W(400/pi)/2)^2 = 1.00806782783327428783428738494014907040
M_241/M_240 / (W(480/pi)/2)^2 = 1.00673554898376961286222392107641498516
M_281/M_280 / (W(560/pi)/2)^2 = 1.00578214522047946323484653576571624399
M_321/M_320 / (W(640/pi)/2)^2 = 1.00506595714403845576059801719687066316
M_360/M_359 / (W(718/pi)/2)^2 = 1.00452059337724617041337836450900324392
```

These rows directly check the saddle claim
`M_{k+1}/M_k = (W(2k/pi)/2)^2(1+o(1))` used in the F88 constant derivation.
