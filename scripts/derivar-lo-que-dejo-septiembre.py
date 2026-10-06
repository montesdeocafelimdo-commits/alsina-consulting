# Deriva la versión web (capítulos 1 y 2 + Próximamente) desde el HTML aprobado, sin tocarlo.
# Uso: python3 derivar.py <original.html> <salida.html>   (la salida nunca puede ser el original)
import hashlib, os, sys
SRC, DST = sys.argv[1:3]
assert os.path.abspath(SRC) != os.path.abspath(DST)
raw = open(SRC, 'rb').read()
assert hashlib.sha256(raw).hexdigest() == '18d425e0aa53d942f908f48971ed1f1851cdef49a55dddaac9a4c46a7c2780ff'
L = raw.decode('utf-8').split('\n')
def ln(n): return L[n-1]
assert ln(797).startswith('<!-- ============ CAPÍTULO 3') and ln(1146) == '</section>' and ln(1148).startswith('<footer')
assert ln(1390).startswith('/* ================= capítulo 3') and ln(1599).startswith('/* ================= reloj')
assert ln(1659).startswith('  /* los 20 distritos') and ln(1687) == '})();'

PROX = '''<!-- ============ PRÓXIMAMENTE ============ -->
<section class="chap dark" id="proximamente">
  <div class="wrap">
    <header class="chap-h rv"><div class="chap-n">03</div><div><div class="chap-k">Próximamente</div><h2>El informe sigue</h2></div></header>
    <div class="prose"><p style="color:inherit">Los próximos capítulos de <em>Lo que dejó septiembre</em> se publican en las próximas entregas de la serie.</p></div>
    <ol class="prox rv">
      <li><span>03</span>El intendente todavía pesa<em>Próximamente</em></li>
      <li><span>04</span>LLA encontró territorio<em>Próximamente</em></li>
      <li><span>05</span>Cuando la boleta también habla<em>Próximamente</em></li>
      <li><span>06</span>Una participación que también cuenta una historia<em>Próximamente</em></li>
      <li><span>07</span>Cuarenta y nueve días después<em>Próximamente</em></li>
      <li><span>08</span>Lo que septiembre dejó para 2027<em>Próximamente</em></li>
    </ol>
    <div class="final-cta"><a class="cta" href="https://alsinaar.com/municipios-data-hub.html" target="_blank" rel="noopener">Abrí el Monitor 135</a><a class="cta ghost" href="https://alsinaar.com" target="_blank" rel="noopener">Recibí la próxima entrega</a></div>
  </div>
</section>'''

out = L[:796] + PROX.split('\n') + L[1146:1389] + L[1598:1658] + L[1686:]
t = '\n'.join(out)

def rep(a, b):
    global t
    assert t.count(a) == 1, (t.count(a), a[:80])
    t = t.replace(a, b)

AUT = 'Gastón Corti, Pablo Rodríguez y Luz Landívar'
FOTOS = [('gaston-corti', 'Gastón Corti'), ('pablo-rodriguez', 'Pablo Rodríguez'), ('luz-landivar', 'Luz Landívar')]
FIRMA = '<span class="autores">' + ''.join(f'<span class="autor"><img src="/assets/img/autores/{s}.jpg" alt="{n}" width="34" height="34" loading="lazy">{n}</span>' for s, n in FOTOS) + '</span>'
rep('''<a href="#c1">La elección</a><a href="#c2">El mapa</a><a href="#c3">Intendentes</a><a href="#c4">LLA</a>
      <a href="#c5">La boleta</a><a href="#c6">Participación</a><a href="#c7">49 días</a><a href="#c8">2027</a>''',
    '<a href="#c1">La elección</a><a href="#c2">El mapa</a><a href="#proximamente">Próximamente</a>')
rep('<span><b>Equipo Alsina</b></span><span>Octubre de 2026</span><span>8 capítulos · lectura de 20 minutos</span>',
    f'{FIRMA}<span>Equipo Alsina · Octubre de 2026</span><span>Capítulos 1 y 2 · lectura de 7 minutos</span>')
rep('Equipo Alsina · Octubre de 2026 · <a href="https://alsinaar.com"',
    f'{AUT} · Equipo Alsina · Octubre de 2026 · <a href="https://alsinaar.com"')
rep('</style>', '''.byline .autores{display:flex;flex-wrap:wrap;gap:10px 18px;width:100%}
.byline .autor{display:inline-flex;align-items:center;gap:9px;color:var(--crema);font-weight:700}
.byline .autor img{width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid rgba(0,213,216,.4);flex-shrink:0}
.prox{list-style:none;margin:34px 0 0;padding:0;max-width:820px;border-top:1px solid rgba(243,239,231,.18)}
.prox li{display:grid;grid-template-columns:52px 1fr auto;gap:14px;align-items:baseline;padding:16px 0;border-bottom:1px solid rgba(243,239,231,.18);
  font-family:var(--disp);font-weight:800;text-transform:uppercase;font-size:clamp(1.05rem,2.4vw,1.45rem);line-height:1.1;color:var(--crema)}
.prox li span{color:var(--tq);font-weight:900}
.prox li em{font-style:normal;font-size:.68rem;letter-spacing:.2em;color:rgba(243,239,231,.55)}
@media (max-width:520px){.prox li{grid-template-columns:40px 1fr}.prox li em{grid-column:2}}
</style>''')
COVER = 'https://alsinaar.com/assets/img/informes/lo-que-dejo-septiembre.jpg'
rep('<meta property="og:type" content="article">', f'''<meta property="og:type" content="article">
<meta property="og:image" content="{COVER}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="900">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{COVER}">''')
# reloj: llega al día 49 al entrar en Próximamente
rep("const c7=$('#c7').offsetTop,c8=$('#c8').offsetTop;", "const c7=$('#proximamente').offsetTop,c8=c7;")
rep("links.forEach((a,i)=>a.classList.toggle('on',i===cur));\n  hzScroll();}", "links.forEach((a,i)=>a.classList.toggle('on',i===cur));}")
rep('''rzT2=setTimeout(()=>{layoutHz();drawMesas(mesasDone?1:0);
  CH.forEach(c=>{c.go=c.draw();if(c.done&&c.go)c.go();});
  goSlope=drawSlope();goArrows=drawArrows();goJ21=drawJ21();drawCasc();
  goFrag=mags($('#frag'),FRAG,1e6);goMags=mags($('#mags'),MAGS,1e6);goMags2=mags($('#mags2'),MAGS2,1e6);
  PANEL_GO.forEach((f,i)=>{if(f&&panelDone.has(i))f();});if(seen.has($('#v-cierre')))goMags2();},220);});''',
    '''rzT2=setTimeout(()=>{onScroll();drawMesas(mesasDone?1:0);
  CH.forEach(c=>{c.go=c.draw();if(c.done&&c.go)c.go();});},220);});''')
rep('layoutHz();sweep();', 'onScroll();sweep();')
rep("const watch=$$('.rv,.fig,.foto,.hz-p');", "const watch=$$('.rv,.fig,.foto');")
rep('<!-- ALSINA · datos de los 135 municipios. NO EDITAR ESTE HTML: los datos se generan en estos dos archivos, al lado de este. Si no existen, el informe funciona igual con la vista previa. -->',
    '<!-- ALSINA · versión web (capítulos 1 y 2). Derivada del informe aprobado (sha256 18d425e0…780ff); los capítulos 3 a 8 quedan para próximas entregas. Datos de los 135 municipios en los dos archivos de al lado. -->')
# no debe quedar contenido de los capítulos 3 a 8
for k in ['id="c3"', 'id="c8"', '#tab27', '#minipods', '#libro', '#strip', "$('#gg')", 'hzTrack', "['Coronel Suárez',39.20]"]:
    assert k not in t, k
open(DST, 'w', encoding='utf-8').write(t)
print('ok', len(raw), '->', len(t.encode()))
