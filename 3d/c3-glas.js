/*
 * c3 als Glasskulptur fuer die Landingpage (Owner, 2026-11-07).
 *
 * Das Zeichen kommt aus einem Abstandsfeld wie die Glut der App, hier mit 16 Bit (web/3d/c3-feld16.png,
 * scripts/ladeanimation/feld16.py): 2D-Abstand, in die Tiefe gezogen und rund wie eine Glasroehre, dann per
 * Raymarching als Glas gerechnet: Spiegelung, Brechung mit Farbsaum, leicht blaues Glas. Das Licht steht fest
 * im Raum, darum wandern die Lichtkanten, wenn sich das Zeichen dreht.
 *
 * Wo es steht, sagt die Seite selbst: Jedes Element mit data-c3 ist eine Station (Drehung "gier,nick,roll,deckkraft"),
 * data-c3-ort nennt den Platzhalter, in dessen Mitte und Hoehe das Zeichen sitzt (sonst das Element selbst).
 * Zwischen zwei Stationen wird mit dem Scroll ueberblendet. Ohne WebGL 2 bleibt die Seite, wie sie ist.
 */
(function () {
  'use strict';


  var VS = '#version 300 es\nin vec2 a;\nvoid main(){gl_Position=vec4(a,0.,1.);}';

  var FS = [
'#version 300 es',
'precision highp float;',
'uniform sampler2D u_feld;',
'uniform vec2 u_aufl;',
'uniform vec3 u_mitte;',
'uniform mat3 u_dreh;',
'uniform float u_s;',
'uniform float u_tan;',
'uniform float u_deck;',
'uniform int u_proben;',
'out vec4 farbe;',
'const float TIEFE = 0.08;',
'const float RUND = 0.056;',
'float feld(vec2 q){',
'  vec2 uv = vec2(q.x*0.5+0.5, 0.5-q.y*0.5);',
'  vec2 hl = texture(u_feld, clamp(uv, 0.0, 1.0)).rg;',
'  float v = (hl.r*65280.0 + hl.g*255.0)/65535.0;',
'  return -0.08 + v*0.48 + length(max(abs(q)-1.0, 0.0));',
'}',
/* Abstand im Objektraum: das Zeichen, in die Tiefe gezogen, Kanten so rund, dass es eine Roehre wird. */
'float sdO(vec3 p){',
'  vec2 w = vec2(feld(p.xy) + RUND, abs(p.z) - TIEFE + RUND);',
'  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - RUND;',
'}',
'float sd(vec3 p){ return sdO(transpose(u_dreh)*(p-u_mitte)/u_s)*u_s; }',
/* Etwas mehr als ein Feldpunkt Abstand: Sonst zeichnet die lineare Abtastung Facetten in die Flaeche. */
/* Fuer die Neigung kubisch gelesen (B-Spline aus vier linearen Abtastungen): Linear hat die Flaeche zwischen den
   Feldpunkten winzige Facetten, die als Streifen in den Spiegelungen stehen. */
'float hl(vec2 uv){ vec2 v = texture(u_feld, uv).rg; return (v.r*65280.0 + v.g*255.0)/65535.0; }',
'float feldGlatt(vec2 q){',
'  vec2 uv = clamp(vec2(q.x*0.5+0.5, 0.5-q.y*0.5), 0.0, 1.0);',
'  vec2 n = vec2(textureSize(u_feld, 0));',
'  vec2 t = uv*n - 0.5; vec2 i = floor(t); vec2 f = t - i;',
'  vec2 w0 = (1.0-f)*(1.0-f)*(1.0-f)/6.0, w1 = (4.0 - 6.0*f*f + 3.0*f*f*f)/6.0;',
'  vec2 w2 = (1.0 + 3.0*f + 3.0*f*f - 3.0*f*f*f)/6.0, w3 = f*f*f/6.0;',
'  vec2 g0 = w0 + w1, g1 = w2 + w3;',
'  vec2 a = (i + 0.5 - 1.0 + w1/g0)/n, b = (i + 0.5 + 1.0 + w3/g1)/n;',
'  float v = g0.y*(g0.x*hl(vec2(a.x,a.y)) + g1.x*hl(vec2(b.x,a.y))) + g1.y*(g0.x*hl(vec2(a.x,b.y)) + g1.x*hl(vec2(b.x,b.y)));',
'  return -0.08 + v*0.48 + length(max(abs(q)-1.0, 0.0));',
'}',
'float sdGlatt(vec3 p){',
'  vec3 o = transpose(u_dreh)*(p-u_mitte)/u_s;',
'  vec2 w = vec2(feldGlatt(o.xy) + RUND, abs(o.z) - TIEFE + RUND);',
'  return (min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - RUND)*u_s;',
'}',
'vec3 normale(vec3 p){',
'  float e = 0.0018*u_s; vec2 k = vec2(1.,-1.);',
'  return normalize(k.xyy*sdGlatt(p+k.xyy*e)+k.yyx*sdGlatt(p+k.yyx*e)+k.yxy*sdGlatt(p+k.yxy*e)+k.xxx*sdGlatt(p+k.xxx*e));',
'}',
'float rechteck(vec3 d, vec3 z, vec3 x, vec2 g, float weich){',
'  float c = dot(d, z); if(c <= 0.0) return 0.0;',
'  vec3 y = normalize(cross(z, x)); x = normalize(cross(y, z));',
'  vec2 q = abs(vec2(dot(d, x), dot(d, y))/c);',
'  return smoothstep(g.x, g.x*weich, q.x)*smoothstep(g.y, g.y*weich, q.y);',
'}',
/* Ein dunkles Studio: vorne zwei Softboxen und eine Lichtleiste, hinten eine schmale Lichtkante und blaues Buehnenlicht. */
'vec3 umgebung(vec3 d){',
'  vec3 c = mix(vec3(0.0015,0.0018,0.004), vec3(0.004,0.006,0.016), smoothstep(-0.3, 1.0, d.y));',
'  c += vec3(1.00,1.00,1.00)*rechteck(d, normalize(vec3(-0.45,0.70,0.55)), vec3(1.,0.,0.), vec2(0.55,0.30), 0.15)*5.0;',
'  c += vec3(1.00,1.00,1.00)*rechteck(d, normalize(vec3(0.85,0.10,0.52)), vec3(0.,1.,0.), vec2(1.00,0.16), 0.15)*2.4;',
'  c += vec3(0.70,0.82,1.00)*rechteck(d, normalize(vec3(-0.90,0.00,0.43)), vec3(0.,1.,0.), vec2(1.00,0.14), 0.15)*1.5;',
'  c += vec3(1.00,1.00,1.00)*rechteck(d, normalize(vec3(0.40,0.05,-0.92)), vec3(0.,1.,0.), vec2(1.10,0.15), 0.15)*2.2;',
'  c += vec3(0.55,0.70,1.00)*rechteck(d, normalize(vec3(-0.45,-0.05,-0.89)), vec3(0.,1.,0.), vec2(1.10,0.13), 0.15)*1.5;',
'  c += vec3(0.90,0.92,1.00)*rechteck(d, normalize(vec3(0.0,0.75,-0.66)), vec3(1.,0.,0.), vec2(1.40,0.14), 0.15)*1.3;',
'  c += vec3(0.10,0.28,1.00)*pow(max(dot(d, normalize(vec3(0.0,-0.75,-0.66))),0.0), 14.0)*0.9;',
'  c += vec3(0.50,0.30,1.00)*pow(max(dot(d, normalize(vec3(0.95,-0.1,-0.3))),0.0), 20.0)*0.8;',
'  return c;',
'}',
'vec3 tonen(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
/* Klares Glas in einem Zug, ohne zweiten Lauf durchs Innere (das Feld ist dafuer innen zu grob):
   Die Rueckseite ist die Vorderseite, an der Mittelebene gespiegelt. Dort tritt das Licht aus, je Farbe anders
   gebrochen, oder es wird innen zurueckgeworfen: Das gibt die hellen Kanten im Glas. */
'vec3 glas(vec3 p, vec3 rd, vec3 n){',
'  float cosi = clamp(dot(-rd, n), 0.0, 1.0);',
'  float fres = 0.03 + 0.97*pow(1.0-cosi, 5.0);',
'  vec3 refl = umgebung(reflect(rd, n));',
'  vec3 no = transpose(u_dreh)*n;',
'  vec3 nb = u_dreh*vec3(no.xy, -no.z);',
'  vec3 durch;',
'  for(int k=0;k<3;k++){',
'    float ior = 1.38 + float(k)*0.07;',
'    vec3 rr = refract(rd, n, 1.0/ior);',
'    vec3 o = refract(rr, -nb, ior);',
'    vec3 e = dot(o,o) < 0.01 ? umgebung(reflect(rr, -nb))*1.25 : umgebung(o);',
'    durch[k] = k==0 ? e.r : (k==1 ? e.g : e.b);',
'  }',
'  durch *= vec3(0.86, 0.93, 1.0);',
'  vec3 saum = vec3(0.20,0.40,1.0)*pow(1.0-cosi, 3.0)*0.18;',
'  return mix(durch, refl, fres) + saum;',
'}',
/* Ein Strahl ab t: bis zum Glas. rest ist der kleinste Abstand in Bildpunkten (negativ: getroffen), tTreffer wo. */
'float laufen(vec3 rd, float t, float tEnde, float px, int schritte, out float tTreffer){',
'  float best = 1e9; tTreffer = t;',
'  for(int i=0;i<110;i++){',
'    if(i >= schritte) break;',
'    vec3 p = rd*t; float d = sd(p);',
'    float rel = d/(t*px);',
'    if(rel < best){ best = rel; tTreffer = t; }',
'    if(d < 0.0003*u_s) return -1.0;',
'    t += d*0.85; if(t > tEnde) break;',
'  }',
'  return best;',
'}',
'vec4 schattieren(vec3 rd, float rest, float t){',
'  if(rest >= 0.7) return vec4(0.0);',
'  vec3 p = rd*t; vec3 n = normale(p);',
'  vec3 col = tonen(glas(p, rd, n));',
'  float a = rest < 0.0 ? 1.0 : clamp(1.0 - rest/0.7, 0.0, 1.0);',
/* Glas ist nicht deckend: Dunkle Stellen lassen die Seite durch. */
'  float deck = clamp(0.10 + dot(col, vec3(0.75)), 0.0, 1.0)*a;',
'  return vec4(pow(col, vec3(1.0/2.2))*a, deck);',
'}',
'void main(){',
'  vec2 mitte = gl_FragCoord.xy - 0.5*u_aufl;',
'  vec3 rd = normalize(vec3(mitte/u_aufl.y*2.0*u_tan, -1.0));',
'  float px = 2.0*u_tan/u_aufl.y;',
/* Gerechnet wird nur, was die Huellkugel trifft. */
'  float R = 0.7*u_s, H = 1.7*u_s;',
'  float b = dot(u_mitte, rd); float c2 = dot(u_mitte,u_mitte) - b*b;',
'  if(c2 > H*H){ farbe = vec4(0.0); return; }',
'  float glimm = 0.0;',
'  if(c2 < R*R){',
'    float h = sqrt(R*R - c2); float t0 = max(b - h, 0.0), tEnde = b + h;',
'    float tm; float rest = laufen(rd, t0, tEnde, px, 110, tm);',
'    if(rest < 1.5){',
/* Am Glas acht Strahlen je Bildpunkt, sonst flimmern die feinen Lichtkanten. Sie starten kurz vor der Stelle,
   die der mittlere Strahl gefunden hat, und brauchen darum nur wenige Schritte. */
'      vec4 summe = vec4(0.0);',
'      float start = max(tm - 0.02*u_s, t0);',
'      for(int k=0;k<8;k++){',
'        if(k >= u_proben) break;',
/* Acht Strahlen auf gedrehtem Raster, ueber den ganzen Bildpunkt verteilt. */
'        float w = float(k)*2.39996; float rr = sqrt((float(k)+0.5)/float(u_proben))*0.5;',
'        vec3 r = normalize(vec3((mitte + vec2(cos(w), sin(w))*rr)/u_aufl.y*2.0*u_tan, -1.0));',
'        float tk; float rk = laufen(r, start, tEnde, px, 14, tk);',
'        summe += schattieren(r, rk, tk);',
'      }',
'      if(summe.a > 0.0){ farbe = summe/float(u_proben)*u_deck; return; }',
'    }',
'    glimm = exp(-max(rest, 0.0)*px*b/u_s*9.0);',
'  }',
'  float ab = sqrt(c2)/u_s;',
'  float schein = 0.07*exp(-ab*ab*2.6) + 0.08*glimm;',
'  farbe = vec4(vec3(0.16,0.34,1.0)*schein, schein*0.85)*u_deck;',
'}'
  ].join('\n');

  function shader(gl, art, text) {
    var s = gl.createShader(art); gl.shaderSource(s, text); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader');
    return s;
  }

  var weich = function (x) { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
  var mix = function (a, b, t) { return a + (b - a) * t; };
  var GRAD = Math.PI / 180;

  function drehung(g, n, r) {
    var cg = Math.cos(g), sg = Math.sin(g), cn = Math.cos(n), sn = Math.sin(n), cr = Math.cos(r), sr = Math.sin(r);
    var ry = [cg, 0, -sg, 0, 1, 0, sg, 0, cg];
    var rx = [1, 0, 0, 0, cn, sn, 0, -sn, cn];
    var rz = [cr, sr, 0, -sr, cr, 0, 0, 0, 1];
    var mal = function (a, b) {
      var o = new Array(9);
      for (var c = 0; c < 3; c++) for (var z = 0; z < 3; z++)
        o[c * 3 + z] = a[z] * b[c * 3] + a[3 + z] * b[c * 3 + 1] + a[6 + z] * b[c * 3 + 2];
      return o;
    };
    return new Float32Array(mal(rz, mal(rx, ry)));
  }

  window.c3Glas = function (leinwand, feldUrl) {
    var gl = leinwand.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'Link');
    } catch (e) { console.warn('c3 Glas:', e.message); return null; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var ort = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(ort); gl.vertexAttribPointer(ort, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['u_feld', 'u_aufl', 'u_mitte', 'u_dreh', 'u_s', 'u_tan', 'u_deck', 'u_proben'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var bereit = false, bewegt = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var bild = new Image();
    bild.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, bild);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(U.u_feld, 0);
      bereit = true;
      leinwand.classList.add('bereit');
      anstossen();
    };
    bild.src = feldUrl;

    var TAN = Math.tan(20 * GRAD), D = 6;
    var stationen = [];
    /* Guete regelt sich selbst: Werden die Bilder zu langsam, weniger Strahlen und etwas geringere Aufloesung. */
    var stufe = window.innerWidth < 760 ? 1 : 0, proben = [8, 4, 4, 2], faktor = [1, 1, 0.8, 0.65];
    var langsam = 0, gemessen = 0;
    function vermessen() {
      var schmal = window.innerWidth < 760;
      var dichte = Math.min(window.devicePixelRatio || 1, schmal ? 1.5 : 1.75) * faktor[stufe];
      leinwand.width = Math.round(window.innerWidth * dichte);
      leinwand.height = Math.round(window.innerHeight * dichte);
      gl.viewport(0, 0, leinwand.width, leinwand.height);
      stationen = Array.prototype.map.call(document.querySelectorAll('[data-c3]'), function (el) {
        var w = el.getAttribute('data-c3').split(',').map(Number);
        var sel = el.getAttribute('data-c3-ort');
        var r = el.getBoundingClientRect();
        return { el: el, ort: sel ? document.querySelector(sel) : el,
                 gross: Number(el.getAttribute('data-c3-gross')) || 0.82,
                 gier: (w[0] || 0) * GRAD, nick: (w[1] || 0) * GRAD, roll: (w[2] || 0) * GRAD, deck: isNaN(w[3]) ? 1 : w[3],
                 // Auf dem Weg hierher: ganze Umdrehungen und die Seite, zu der der Bogen ausholt.
                 dreh: Number(el.getAttribute('data-c3-dreh')) || 0, bogen: Number(el.getAttribute('data-c3-bogen')) || 0,
                 anker: r.top + window.scrollY + r.height / 2 - window.innerHeight / 2,
                 // data-c3-halten: Das Zeichen bleibt in seinem Platz, bis das Ende des Elements auf 40 % der
                 // Fensterhoehe hochgescrollt ist. So liegt es nicht ueber dem Text, der darunter steht.
                 halten: el.hasAttribute('data-c3-halten') ? r.bottom + window.scrollY - window.innerHeight * 0.4 : null };
      });
      if (stationen.length) stationen[0].anker = Math.min(stationen[0].anker, 0);
      stationen.forEach(function (st, i) {
        var naechste = stationen[i + 1];
        st.los = st.halten === null || !naechste ? st.anker
          : Math.min(Math.max(st.anker, st.halten), st.anker + (naechste.anker - st.anker) * 0.7);
      });
      anstossen();
    }

    /* Mitte und Hoehe des Platzhalters auf dem Bildschirm. Ist er versteckt (schmale Fenster), steht das Zeichen
       gross am rechten Rand und schimmert durch die mattierten Karten. */
    function platz(st) {
      var r = st.ort.getBoundingClientRect();
      if (r.height > 0 && r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height * st.gross };
      var h = window.innerHeight * 0.34;
      return { x: window.innerWidth - h * 0.12, y: window.innerHeight * 0.5, h: h };
    }

    /* Die Flugbahn zwischen zwei Stationen: kein gerader Strich, sondern ein Bogen. Unterwegs kommt das Zeichen
       etwas naeher, legt sich wie ein Flieger in die Kurve und dreht sich, an den Scroll gekoppelt, um sich selbst. */
    function ziel() {
      var y = window.scrollY, i = 0, n = stationen.length;
      while (i < n - 1 && y > stationen[i + 1].anker) i++;
      var a = stationen[i], b = stationen[Math.min(i + 1, n - 1)];
      var t = b.anker > a.los ? weich((y - a.los) / (b.anker - a.los)) : 0;
      var pa = platz(a), pb = platz(b);
      var dx = pb.x - pa.x, dy = pb.y - pa.y, weg = Math.hypot(dx, dy) || 1;
      var weit = Math.min(1, weg / window.innerHeight);
      var buckel = Math.sin(Math.PI * t);
      var aus = b.bogen * weg * 0.32 * buckel;
      return {
        x: mix(pa.x, pb.x, t) - dy / weg * aus,
        y: mix(pa.y, pb.y, t) + dx / weg * aus,
        h: mix(pa.h, pb.h, t) * (1 + 0.18 * weit * buckel),
        gier: mix(a.gier, b.gier, t) + b.dreh * 2 * Math.PI * t,
        nick: mix(a.nick, b.nick, t),
        roll: mix(a.roll, b.roll, t) - b.bogen * 0.45 * weit * buckel,
        deck: mix(a.deck, b.deck, t) * (1 - 0.25 * weit * buckel)
      };
    }

    var maus = { x: 0, y: 0 }, mausJetzt = { x: 0, y: 0 };
    if (bewegt && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', function (e) {
        maus.x = e.clientX / window.innerWidth - 0.5; maus.y = e.clientY / window.innerHeight - 0.5; anstossen();
      }, { passive: true });
    }

    var weich3 = function (x) { x = Math.min(1, Math.max(0, x)); return 1 - Math.pow(1 - x, 3); };
    var jetzt = null, tempo = {}, zuletzt = 0, laeuft = false, uhr = 0, auftritt = bewegt ? 0 : 1;
    var scrollAlt = window.scrollY, schub = 0;
    function bildRechnen(ms) {
      laeuft = false;
      if (!bereit || !stationen.length) return;
      var dt = zuletzt ? Math.min(0.05, (ms - zuletzt) / 1000) : 0.016; zuletzt = ms;
      var z = ziel();
      if (!jetzt) { jetzt = Object.assign({}, z); for (var m in z) tempo[m] = 0; }
      // Gefedert, kritisch gedaempft, in kleinen Schritten gerechnet: Die Lage gleitet dem Layout nach, statt am
      // Mausrad stufig mitzuspringen. Die Drehung federt weicher, sie darf nachschwingen.
      var ruhig = true, schritte = 4, h = dt / schritte;
      for (var n in z) {
        var k = (n === 'x' || n === 'y' || n === 'h') ? 150 : 46, c = 2 * Math.sqrt(k) * (n === 'gier' || n === 'roll' ? 0.82 : 1);
        for (var q = 0; q < schritte; q++) {
          tempo[n] += (k * (z[n] - jetzt[n]) - c * tempo[n]) * h;
          jetzt[n] += tempo[n] * h;
        }
        var grenze = (n === 'x' || n === 'y' || n === 'h') ? 0.05 : 1e-3;
        if (Math.abs(z[n] - jetzt[n]) > grenze || Math.abs(tempo[n]) > grenze) ruhig = false;
      }
      // Traegheit: Wer schnell scrollt, kippt das Glas in die Richtung, beim Anhalten schwingt es zurueck.
      var v = (window.scrollY - scrollAlt) / Math.max(dt, 1e-3); scrollAlt = window.scrollY;
      var schubZiel = Math.max(-0.38, Math.min(0.38, -v * 0.00028));
      schub += (schubZiel - schub) * Math.min(1, dt * 6);
      if (Math.abs(schub) > 1e-3) ruhig = false;
      if (bewegt) { uhr += dt; auftritt = Math.min(1, auftritt + dt / 1.8); }
      var e = weich3(auftritt);
      mausJetzt.x += (maus.x - mausJetzt.x) * Math.min(1, dt * 3);
      mausJetzt.y += (maus.y - mausJetzt.y) * Math.min(1, dt * 3);
      var B = window.innerWidth, Hf = window.innerHeight, hoeheWelt = 2 * D * TAN;
      var welt = hoeheWelt / Hf;
      var schweben = bewegt ? Math.sin(uhr * 0.9) * 0.008 * jetzt.h : 0;
      // Auftritt: Das Zeichen kommt aus der Tiefe, dreht sich ein und setzt sich auf die Buehne.
      var groesse = jetzt.h * (0.5 + 0.5 * e);
      gl.uniform2f(U.u_aufl, leinwand.width, leinwand.height);
      gl.uniform3f(U.u_mitte, (jetzt.x - B / 2) * welt, (Hf / 2 - jetzt.y + schweben - (1 - e) * 0.25 * jetzt.h) * welt, -D);
      gl.uniformMatrix3fv(U.u_dreh, false, drehung(
        jetzt.gier + (bewegt ? Math.sin(uhr * 0.32) * 0.3 : 0) + mausJetzt.x * 0.35 - (1 - e) * 2.8,
        jetzt.nick + (bewegt ? Math.sin(uhr * 0.5) * 0.05 : 0) + mausJetzt.y * 0.22 + schub + (1 - e) * 0.5,
        jetzt.roll + schub * 0.35));
      gl.uniform1f(U.u_s, groesse * welt);
      gl.uniform1f(U.u_tan, TAN);
      gl.uniform1f(U.u_deck, Math.min(1, Math.max(0, jetzt.deck)) * weich3(auftritt * 1.6));
      gl.uniform1i(U.u_proben, proben[stufe]);
      if (dt > 0 && dt < 0.25) {
        gemessen++; if (dt > 0.024) langsam++;
        if (gemessen >= 40) {
          if (langsam > 16 && stufe < proben.length - 1) { stufe++; vermessen(); }
          gemessen = 0; langsam = 0;
        }
      }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (bewegt || !ruhig) anstossen();
    }
    function anstossen() { if (!laeuft && !document.hidden) { laeuft = true; requestAnimationFrame(bildRechnen); } }

    var warten;
    window.addEventListener('resize', function () { clearTimeout(warten); warten = setTimeout(vermessen, 120); });
    window.addEventListener('scroll', anstossen, { passive: true });
    document.addEventListener('visibilitychange', function () { zuletzt = 0; anstossen(); });
    window.addEventListener('load', vermessen);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(vermessen);
    vermessen();
    return { neu: vermessen };
  };
})();
