
(function(){
  "use strict";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id){ return document.getElementById(id); }

  /* If Three.js or WebGL is unavailable, swap each stage for a plain-language fallback. */
  function showFallback(){
    var mounts = document.querySelectorAll(".d3-mount");
    for (var i = 0; i < mounts.length; i++){
      var wrap = mounts[i].closest("[data-stage-wrap]");
      if (wrap){
        wrap.innerHTML = '<p class="d3-fallback" style="margin:12px">The 3D models could not start in this browser (they need WebGL). The same story is in the chapters linked under each model — Chapters 39–43 for the artery and plaque, Chapter 11 for the liver, and Chapters 20, 21 and 25 for the cholesterol pathway.</p>';
        wrap.style.background = "transparent";
        wrap.style.border = "none";
      }
    }
    var ctrls = document.querySelectorAll(".d3-controls, .d3-slider-row, .d3-steps");
    for (var j = 0; j < ctrls.length; j++) ctrls[j].style.display = "none";
  }
  if (typeof THREE === "undefined" || typeof THREE.OrbitControls === "undefined"){ showFallback(); return; }

  /* ---------- shared helpers ---------- */
  var scenes = []; /* {renderer, scene, camera, controls, tick, active, mount} */

  function makeRenderer(mount){
    var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x10201f, 1);
    renderer.domElement.className = "d3-canvas";
    renderer.domElement.setAttribute("aria-label", "Interactive 3D model. Drag to rotate, scroll or pinch to zoom.");
    mount.appendChild(renderer.domElement);
    return renderer;
  }
  function makeScene(mount, camPos){
    var renderer = makeRenderer(mount);
    var w = mount.clientWidth || 480, h = 320;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(camPos[0], camPos[1], camPos[2]);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 14;
    if (!reduceMotion) controls.autoRotate = false;
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(4, 6, 6); scene.add(key);
    var fill = new THREE.DirectionalLight(0xbfe3e1, 0.35); fill.position.set(-5, -2, -4); scene.add(fill);
    var entry = { renderer:renderer, scene:scene, camera:camera, controls:controls, mount:mount, tick:null, active:false, started:false };
    scenes.push(entry);
    return entry;
  }
  function fit(entry){
    var w = entry.mount.clientWidth || 480;
    var h = entry.mount.clientHeight || 320;
    entry.renderer.setSize(w, h, false);
    entry.camera.aspect = w / h;
    entry.camera.updateProjectionMatrix();
  }
  function textSprite(text, opts){
    opts = opts || {};
    var fs = 44, pad = 22;
    var cv = document.createElement("canvas");
    var cx = cv.getContext("2d");
    cx.font = "700 " + fs + "px 'IBM Plex Sans', sans-serif";
    var tw = cx.measureText(text).width;
    cv.width = Math.ceil(tw + pad * 2); cv.height = fs + pad * 2;
    cx = cv.getContext("2d");
    cx.fillStyle = opts.bg || "rgba(6,24,24,0.78)";
    var r = 26;
    cx.beginPath();
    cx.moveTo(r, 0); cx.lineTo(cv.width - r, 0); cx.quadraticCurveTo(cv.width, 0, cv.width, r);
    cx.lineTo(cv.width, cv.height - r); cx.quadraticCurveTo(cv.width, cv.height, cv.width - r, cv.height);
    cx.lineTo(r, cv.height); cx.quadraticCurveTo(0, cv.height, 0, cv.height - r);
    cx.lineTo(0, r); cx.quadraticCurveTo(0, 0, r, 0); cx.closePath(); cx.fill();
    cx.font = "700 " + fs + "px 'IBM Plex Sans', sans-serif";
    cx.fillStyle = opts.fg || "#ffffff";
    cx.textBaseline = "middle";
    cx.fillText(text, pad, cv.height / 2 + 2);
    var tex = new THREE.CanvasTexture(cv);
    var mat = new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false });
    var sp = new THREE.Sprite(mat);
    var scale = opts.scale || 0.0052;
    sp.scale.set(cv.width * scale, cv.height * scale, 1);
    sp.renderOrder = 20;
    return sp;
  }
  function lerp(a, b, t){ return a + (b - a) * t; }

  /* ================================================================
     MODEL 1 — Artery explorer
     ================================================================ */
  var ARTERY_STAGES = [
    { name:"1 · Healthy", cap:"<strong>Healthy artery.</strong> The wall is smooth and springy, the channel (lumen) is wide open, and blood slips through without touching anything it shouldn't." },
    { name:"2 · Fatty streak", cap:"<strong>Fatty streak.</strong> LDL particles slip under the inner lining (intima) and get stuck. Immune cells swallow them and turn into fat-filled foam cells — the first yellow streak of plaque, flat and silent." },
    { name:"3 · Plaque growing", cap:"<strong>Plaque growing.</strong> The fatty pool (lipid core) builds up inside the wall and a fibrous cap grows over it. The wall bulges inward and the channel narrows — blood has less room, especially when the heart asks for more." },
    { name:"4 · Vulnerable plaque", cap:"<strong>Vulnerable plaque.</strong> A big soft core under a thin cap. It may barely narrow the channel, so tests can look reassuring — but the thin cap is the danger. This is the plaque that causes sudden heart attacks." },
    { name:"5 · Rupture", cap:"<strong>Rupture.</strong> The cap tears, the fatty core spills into the blood, and a clot forms on the spot within minutes. Flow chokes off — downstream heart muscle starts to die. This is a heart attack." }
  ];
  var artery = { stage:0, shown:0, section:false };

  function buildArtery(){
    var entry = makeScene($("mount-artery"), [0.4, 1.6, 6.4]);
    var scene = entry.scene;

    /* --- tube view: three wall layers as open cylinders along X --- */
    var tube = new THREE.Group(); scene.add(tube);
    function wallLayer(radius, color, opacity){
      var geo = new THREE.CylinderGeometry(radius, radius, 6.4, 56, 48, true);
      geo.rotateZ(Math.PI / 2);
      var mat = new THREE.MeshStandardMaterial({ color:color, roughness:0.65, metalness:0.05, side:THREE.DoubleSide, transparent:opacity < 1, opacity:opacity });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseRadius = radius;
      tube.add(mesh);
      return mesh;
    }
    var adventitia = wallLayer(1.30, 0xe8b4a0, 0.55);
    var media      = wallLayer(1.16, 0xc0392b, 0.9);
    var intima     = wallLayer(1.03, 0xf3e2c7, 1.0);
    var layers = [adventitia, media, intima];

    /* plaque: a yellow bulge on the inner wall (top side) */
    var plaqueGeo = new THREE.SphereGeometry(1, 40, 28);
    var plaque = new THREE.Mesh(plaqueGeo, new THREE.MeshStandardMaterial({ color:0xf2b705, roughness:0.5 }));
    plaque.position.set(0.3, 0.62, 0);
    tube.add(plaque);
    /* fibrous cap: pale shell over the plaque */
    var cap = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshStandardMaterial({ color:0xf7ecd4, roughness:0.6 }));
    cap.position.copy(plaque.position);
    tube.add(cap);
    /* clot: dark red cluster, appears at rupture */
    var clot = new THREE.Group();
    var clotMat = new THREE.MeshStandardMaterial({ color:0x8e1f1f, roughness:0.45 });
    [[0,0,0,0.34],[0.3,0.08,0.1,0.26],[-0.28,0.05,-0.08,0.24],[0.08,-0.05,0.22,0.2],[-0.1,0.12,-0.2,0.19]].forEach(function(s){
      var m = new THREE.Mesh(new THREE.SphereGeometry(s[3], 20, 16), clotMat);
      m.position.set(s[0], s[1], s[2]); clot.add(m);
    });
    clot.position.set(0.3, 0.05, 0);
    tube.add(clot);

    /* blood flow: red cells streaming through the lumen */
    var cells = [];
    var cellMat = new THREE.MeshStandardMaterial({ color:0xd43a2e, roughness:0.35 });
    var cellGeo = new THREE.SphereGeometry(0.09, 10, 8);
    for (var i = 0; i < 46; i++){
      var c = new THREE.Mesh(cellGeo, cellMat);
      var ang = Math.random() * Math.PI * 2, rr = Math.random() * 0.72;
      c.position.set(-3.2 + Math.random() * 6.4, Math.cos(ang) * rr, Math.sin(ang) * rr);
      c.userData = { y:c.position.y, z:c.position.z, speed:0.9 + Math.random() * 0.7 };
      tube.add(c); cells.push(c);
    }

    /* --- cross-section view: concentric rings facing the camera --- */
    var section = new THREE.Group(); section.visible = false; scene.add(section);
    function ring(rIn, rOut, color, z){
      var m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 64), new THREE.MeshStandardMaterial({ color:color, roughness:0.7, side:THREE.DoubleSide }));
      m.position.z = z || 0;
      section.add(m); return m;
    }
    ring(1.52, 1.78, 0xe8b4a0);        /* adventitia */
    ring(1.24, 1.52, 0xc0392b);        /* media */
    ring(1.06, 1.24, 0xf3e2c7);        /* intima */
    var lumenDisc = new THREE.Mesh(new THREE.CircleGeometry(1.06, 48), new THREE.MeshStandardMaterial({ color:0x5d1414, roughness:0.9 }));
    lumenDisc.position.z = -0.02; section.add(lumenDisc);
    var coreSec = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshStandardMaterial({ color:0xf2b705, roughness:0.55 }));
    coreSec.position.set(0, 1.13, 0.02); section.add(coreSec);
    var clotSec = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), new THREE.MeshStandardMaterial({ color:0x8e1f1f, roughness:0.5 }));
    clotSec.position.set(0, 0.72, 0.03); section.add(clotSec);
    var lbl;
    lbl = textSprite("Adventitia"); lbl.position.set(2.6, 1.5, 0); section.add(lbl);
    lbl = textSprite("Media"); lbl.position.set(2.6, 0.55, 0); section.add(lbl);
    lbl = textSprite("Intima"); lbl.position.set(2.6, -0.35, 0); section.add(lbl);
    lbl = textSprite("Lipid core"); lbl.position.set(-2.5, 1.45, 0); section.add(lbl);
    var capLbl = textSprite("Fibrous cap"); capLbl.position.set(-2.5, 0.5, 0); section.add(capLbl);
    lbl = textSprite("Lumen (blood flows here)"); lbl.position.set(0, -2.35, 0); section.add(lbl);

    function displaceWalls(t){
      /* t = 0..1 plaque growth: push intima (and a little media) inward at the plaque site */
      layers.forEach(function(mesh, li){
        var pos = mesh.geometry.attributes.position;
        var base = mesh.userData.baseRadius;
        var strength = li === 2 ? 0.52 : (li === 1 ? 0.16 : 0.0);
        for (var vi = 0; vi < pos.count; vi++){
          var x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          var r = Math.sqrt(y * y + z * z);
          if (r < 0.001) continue;
          var along = Math.exp(-Math.pow((x - 0.3) / 1.15, 2));
          var up = Math.max(0, y / r);
          var dent = strength * t * along * Math.pow(up, 1.6);
          var nr = base - dent;
          pos.setY(vi, y / r * nr);
          pos.setZ(vi, z / r * nr);
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
      });
    }
    displaceWalls(0);

    var lastT = -1;
    entry.tick = function(time){
      artery.shown += (artery.stage - artery.shown) * 0.06;
      if (Math.abs(artery.shown - lastT) > 0.001){
        var t = artery.shown / 4; /* 0..1 */
        displaceWalls(Math.min(1, t * 1.15));
        var ps = 0.12 + t * 1.05;
        plaque.scale.set(0.55 + t * 0.9, 0.16 + t * 0.62, 0.5 + t * 0.75);
        plaque.position.y = 1.0 - (0.16 + t * 0.62) * 0.72;
        var capT = artery.shown >= 3 ? Math.max(0.02, 0.16 - (artery.shown - 3) * 0.12) : 0.16;
        cap.scale.set(plaque.scale.x * 1.04, plaque.scale.y + capT, plaque.scale.z * 1.04);
        cap.position.y = plaque.position.y + 0.03;
        cap.visible = artery.shown < 3.85;
        var clotS = Math.max(0.001, (artery.shown - 3.4) / 0.6);
        clot.scale.setScalar(Math.min(1, clotS));
        clot.visible = artery.shown > 3.4;
        coreSec.scale.setScalar(0.25 + t * 1.15);
        clotSec.visible = artery.shown > 3.4;
        clotSec.scale.setScalar(Math.min(1, Math.max(0.001, (artery.shown - 3.4) / 0.6)));
        lastT = artery.shown;
      }
      var slow = 1 - (artery.shown / 4) * 0.45 - (artery.shown > 3.6 ? 0.4 : 0);
      cells.forEach(function(c){
        c.position.x += 0.016 * c.userData.speed * Math.max(0.12, slow) * (reduceMotion ? 0.25 : 1);
        if (c.position.x > 3.25) c.position.x = -3.25;
        /* squeeze cells around the plaque bulge */
        var near = Math.exp(-Math.pow((c.position.x - 0.3) / 1.1, 2));
        var ceil = 1.0 - (artery.shown / 4) * 0.62 * near;
        if (c.position.y > ceil - 0.1) c.position.y = ceil - 0.1 - Math.random() * 0.05;
        else c.position.y += (c.userData.y - c.position.y) * 0.02;
      });
      tube.rotation.y = Math.sin(time * 0.00012) * 0.16;
      section.rotation.y = Math.sin(time * 0.00012) * 0.1;
    };
    entry.setSection = function(on){
      tube.visible = !on;
      section.visible = on;
      if (on){ entry.camera.position.set(0, 0.4, 7.2); }
      else { entry.camera.position.set(0.4, 1.6, 6.4); }
      entry.controls.target.set(0, 0, 0);
    };
    return entry;
  }

  /* ================================================================
     MODEL 2 — Plaque rupture animation
     ================================================================ */
  var RUPTURE_STEPS = [
    { label:"1 · Quiet plaque", cap:"<strong>Step 1 — A quiet plaque.</strong> Under a smooth cap, a soft pool of fat (the lipid core) sits inside the artery wall. The channel still looks almost normal — which is why this kind of plaque gives no warning." },
    { label:"2 · Cap thins", cap:"<strong>Step 2 — The cap thins.</strong> Inflammation inside the plaque slowly digests the fibrous cap from underneath. The core keeps growing while its lid gets weaker — a lid too thin for the pressure of every heartbeat." },
    { label:"3 · Cap tears", cap:"<strong>Step 3 — The cap tears.</strong> The thin cap rips open. The fatty core — full of clot-triggering material — is suddenly exposed to flowing blood. This is the moment everything changes." },
    { label:"4 · Clot forms", cap:"<strong>Step 4 — A clot forms in minutes.</strong> Platelets rush to the tear and pile up, fibrin nets them together, and a clot grows fast — the body's leak repair, happening in exactly the wrong place." },
    { label:"5 · Flow chokes off", cap:"<strong>Step 5 — Flow chokes off.</strong> The clot can block the artery completely. Blood — and oxygen — stop reaching the heart muscle beyond it. That is a heart attack: minutes matter, which is why chest pain is an emergency, not a wait-and-see." }
  ];
  var rupture = { step:0, shown:0, playing:false, lastAdvance:0 };

  function buildRupture(){
    var entry = makeScene($("mount-rupture"), [0, 0.5, 6.8]);
    var scene = entry.scene;
    var grp = new THREE.Group(); scene.add(grp);

    function ring(rIn, rOut, color, z){
      var m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 64), new THREE.MeshStandardMaterial({ color:color, roughness:0.7, side:THREE.DoubleSide }));
      m.position.z = z || 0; grp.add(m); return m;
    }
    ring(1.55, 1.82, 0xe8b4a0);
    ring(1.26, 1.55, 0xc0392b);
    ring(1.08, 1.26, 0xf3e2c7);
    var lumen = new THREE.Mesh(new THREE.CircleGeometry(1.08, 48), new THREE.MeshStandardMaterial({ color:0x5d1414, roughness:0.95 }));
    lumen.position.z = -0.03; grp.add(lumen);

    var core = new THREE.Mesh(new THREE.CircleGeometry(0.55, 36), new THREE.MeshStandardMaterial({ color:0xf2b705, roughness:0.55 }));
    core.position.set(0, 1.16, 0.01); grp.add(core);

    /* cap: an arc band over the core; thetaLength shrinks as it thins/tears */
    var capMat = new THREE.MeshStandardMaterial({ color:0xf7ecd4, roughness:0.6, side:THREE.DoubleSide });
    var capMesh = null;
    function makeCap(gap){
      if (capMesh){ grp.remove(capMesh); capMesh.geometry.dispose(); }
      var start = Math.PI / 2 - 0.85 + gap / 2;
      var len = Math.max(0.02, 1.7 - gap);
      capMesh = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.3, 32, 1, start, len), capMat);
      capMesh.position.z = 0.03; grp.add(capMesh);
    }
    makeCap(0);

    var clot = new THREE.Group();
    var clotMat = new THREE.MeshStandardMaterial({ color:0x8e1f1f, roughness:0.45 });
    [[0,0.55,0.42],[0.35,0.3,0.34],[-0.35,0.32,0.33],[0.1,0.05,0.36],[-0.15,-0.2,0.3],[0.3,-0.35,0.27],[-0.3,-0.5,0.24]].forEach(function(s){
      var m = new THREE.Mesh(new THREE.SphereGeometry(s[2], 20, 16), clotMat);
      m.position.set(s[0], s[1], 0.12); clot.add(m);
    });
    clot.scale.setScalar(0.001); grp.add(clot);

    /* flow particles streaming toward viewer through the lumen */
    var parts = [];
    var pMat = new THREE.MeshStandardMaterial({ color:0xe05244, roughness:0.35 });
    var pGeo = new THREE.SphereGeometry(0.085, 10, 8);
    for (var i = 0; i < 34; i++){
      var p = new THREE.Mesh(pGeo, pMat);
      var ang = Math.random() * Math.PI * 2, rr = Math.random() * 0.8;
      p.position.set(Math.cos(ang) * rr, Math.sin(ang) * rr, -2.4 + Math.random() * 4.4);
      p.userData = { x:p.position.x, y:p.position.y, speed:0.8 + Math.random() * 0.6 };
      grp.add(p); parts.push(p);
    }
    var lblCore = textSprite("Lipid core"); lblCore.position.set(-2.45, 1.5, 0); grp.add(lblCore);
    var lblCap = textSprite("Fibrous cap"); lblCap.position.set(2.5, 1.35, 0); grp.add(lblCap);
    var lblClot = textSprite("Clot"); lblClot.position.set(2.35, -0.9, 0); lblClot.visible = false; grp.add(lblClot);

    var lastShown = -1;
    entry.tick = function(time){
      rupture.shown += (rupture.step - rupture.shown) * 0.05;
      var s = rupture.shown;
      if (Math.abs(s - lastShown) > 0.002){
        /* cap gap: 0 until step 2, opens through step 3 */
        var gap = s <= 1 ? 0 : (s <= 2 ? (s - 1) * 0.55 : 0.55 + (s - 2) * 1.0);
        makeCap(Math.min(1.6, gap));
        core.scale.setScalar(1 + Math.min(1, s) * 0.12);
        var clotT = Math.max(0, Math.min(1, (s - 2.6) / 1.2));
        clot.scale.setScalar(Math.max(0.001, clotT * (0.75 + 0.45 * Math.min(1, Math.max(0, s - 3.4)))));
        lblClot.visible = s > 2.8;
        lastShown = s;
      }
      var flow = s < 2.6 ? 1 : (s < 3.6 ? 0.55 : Math.max(0.04, 0.3 - (s - 3.6) * 0.22));
      parts.forEach(function(p){
        p.position.z += 0.02 * p.userData.speed * flow * (reduceMotion ? 0.3 : 1);
        if (p.position.z > 2.1) p.position.z = -2.4;
      });
      grp.rotation.y = Math.sin(time * 0.0001) * 0.12;
    };
    return entry;
  }


  /* ================================================================
     MODEL 3 — Liver, the cholesterol factory
     ================================================================ */
  var liverState = { statin:false };

  function buildLiver(){
    var entry = makeScene($("mount-liver"), [0.6, 1.4, 6.6]);
    var scene = entry.scene;
    var grp = new THREE.Group(); scene.add(grp);

    /* liver body: a sphere squashed and gently lumpy */
    var geo = new THREE.SphereGeometry(1.55, 48, 32);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++){
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var n = 1 + 0.06 * Math.sin(x * 2.4) * Math.cos(y * 2.1) + 0.04 * Math.sin(z * 3.1 + x);
      pos.setXYZ(i, x * n * 1.25, y * n * 0.82, z * n * 0.95);
    }
    geo.computeVertexNormals();
    var liver = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color:0x7a2e22, roughness:0.55 }));
    grp.add(liver);

    /* gallbladder: small green pouch underneath */
    var gb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), new THREE.MeshStandardMaterial({ color:0x5da85f, roughness:0.5 }));
    gb.scale.set(1, 1.35, 1); gb.position.set(0.55, -1.05, 0.45); grp.add(gb);
    var gbLbl = textSprite("Gallbladder"); gbLbl.position.set(1.9, -1.5, 0.4); grp.add(gbLbl);

    /* the enzyme: HMG-CoA reductase, glowing marker inside the liver */
    var enzyme = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color:0x39c2d7, emissive:0x1a7d8f, emissiveIntensity:0.9, roughness:0.3 }));
    enzyme.position.set(-0.5, 0.25, 0.9); grp.add(enzyme);
    var enzLbl = textSprite("HMG-CoA reductase"); enzLbl.position.set(-1.7, 1.35, 0.9); grp.add(enzLbl);
    var actLbl = textSprite("Cholesterol is made here"); actLbl.position.set(-1.55, 0.8, 0.9); grp.add(actLbl);

    /* exit vessel on the right */
    var curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.55, 0.15, 0),
      new THREE.Vector3(2.3, 0.3, 0),
      new THREE.Vector3(3.1, 0.15, 0)
    ]);
    var vessel = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.3, 12, false),
      new THREE.MeshStandardMaterial({ color:0xa03024, roughness:0.5, transparent:true, opacity:0.75 }));
    grp.add(vessel);
    var vLbl = textSprite("VLDL leaves for the blood"); vLbl.position.set(2.6, 1.15, 0); grp.add(vLbl);

    /* particles: cholesterol dots form at the enzyme, gather into VLDL, leave */
    var dots = [];
    var dotGeo = new THREE.SphereGeometry(0.09, 10, 8);
    var dotMat = new THREE.MeshStandardMaterial({ color:0xffd94d, emissive:0x8a6d00, emissiveIntensity:0.35, roughness:0.4 });
    var vldlGeo = new THREE.SphereGeometry(0.21, 14, 12);
    var vldlMat = new THREE.MeshStandardMaterial({ color:0xe67e22, roughness:0.45 });
    function spawn(){
      var isVldl = Math.random() < 0.4;
      var m = new THREE.Mesh(isVldl ? vldlGeo : dotGeo, isVldl ? vldlMat : dotMat);
      m.position.copy(enzyme.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0));
      m.userData = { t:0, vldl:isVldl, wob:Math.random() * Math.PI * 2 };
      grp.add(m); dots.push(m);
    }
    var spawnTimer = 0;

    entry.tick = function(time, dt){
      enzyme.rotation.y += 0.01;
      var pulse = liverState.statin ? 0.25 : 0.9 + Math.sin(time * 0.004) * 0.25;
      enzyme.material.emissiveIntensity = pulse;
      enzyme.material.color.setHex(liverState.statin ? 0x5a7d84 : 0x39c2d7);
      spawnTimer -= dt;
      var interval = liverState.statin ? 2600 : 650;
      if (spawnTimer <= 0 && dots.length < 42){ spawn(); spawnTimer = interval * (0.6 + Math.random() * 0.7); }
      for (var i = dots.length - 1; i >= 0; i--){
        var d = dots[i];
        d.userData.t += dt * (liverState.statin ? 0.00022 : 0.00038);
        var t = d.userData.t;
        if (t < 0.45){
          /* drift from enzyme toward the exit */
          var k = t / 0.45;
          d.position.x = lerp(enzyme.position.x, 1.5, k) + Math.sin(time * 0.002 + d.userData.wob) * 0.08;
          d.position.y = lerp(enzyme.position.y, 0.15, k) + Math.cos(time * 0.0017 + d.userData.wob) * 0.08;
          d.position.z = lerp(enzyme.position.z, 0, k);
        } else if (t < 1){
          var p = curve.getPoint((t - 0.45) / 0.55);
          d.position.copy(p);
        } else {
          grp.remove(d); dots.splice(i, 1);
        }
      }
      grp.rotation.y = Math.sin(time * 0.0001) * 0.14;
    };
    return entry;
  }

  /* ================================================================
     MODEL 4 — Cholesterol pathway journey
     ================================================================ */
  var pathway = { playing: !reduceMotion };

  function buildPathway(){
    var entry = makeScene($("mount-pathway"), [0, 1.7, 7.6]);
    var scene = entry.scene;
    var grp = new THREE.Group(); scene.add(grp);

    /* liver at the left */
    var liverGeo = new THREE.SphereGeometry(1.05, 36, 24);
    var lp = liverGeo.attributes.position;
    for (var i = 0; i < lp.count; i++){
      lp.setXYZ(i, lp.getX(i) * 1.2, lp.getY(i) * 0.82, lp.getZ(i) * 0.95);
    }
    liverGeo.computeVertexNormals();
    var liver = new THREE.Mesh(liverGeo, new THREE.MeshStandardMaterial({ color:0x7a2e22, roughness:0.55 }));
    liver.position.set(-3.9, 0.35, 0); grp.add(liver);
    var lLbl = textSprite("Liver"); lLbl.position.set(-3.9, 1.85, 0); grp.add(lLbl);

    /* the blood vessel: a long tube from liver to artery */
    var pathCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.9, 0.35, 0),
      new THREE.Vector3(-1.4, 0.05, 0.3),
      new THREE.Vector3(0.2, 0.3, -0.25),
      new THREE.Vector3(1.8, 0.1, 0.2),
      new THREE.Vector3(3.1, 0.35, 0)
    ]);
    var vessel = new THREE.Mesh(new THREE.TubeGeometry(pathCurve, 60, 0.52, 14, false),
      new THREE.MeshStandardMaterial({ color:0xa03024, roughness:0.5, transparent:true, opacity:0.4 }));
    grp.add(vessel);

    /* artery wall block at the right, with plaque */
    var wall = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 2.3, 32, 1, true),
      new THREE.MeshStandardMaterial({ color:0xc0392b, roughness:0.65, side:THREE.DoubleSide }));
    wall.geometry.rotateZ(Math.PI / 2);
    wall.position.set(4.15, 0.35, 0); grp.add(wall);
    var plaque = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), new THREE.MeshStandardMaterial({ color:0xf2b705, roughness:0.5 }));
    plaque.scale.set(0.85, 0.5, 0.7); plaque.position.set(4.15, 0.95, 0); grp.add(plaque);
    var aLbl = textSprite("Artery wall"); aLbl.position.set(4.15, 1.95, 0); grp.add(aLbl);
    var pLbl = textSprite("Plaque"); pLbl.position.set(4.9, 1.35, 0); grp.add(pLbl);

    /* stage labels along the route */
    var s1 = textSprite("VLDL"); s1.position.set(-1.9, 1.25, 0); grp.add(s1);
    var s2 = textSprite("IDL"); s2.position.set(-0.2, 1.35, 0); grp.add(s2);
    var s3 = textSprite("LDL"); s3.position.set(1.6, 1.3, 0); grp.add(s3);
    var s4 = textSprite("HDL returns"); s4.position.set(0.1, -1.35, 0); grp.add(s4);
    var s5 = textSprite("Out as bile"); s5.position.set(-3.6, -1.6, 0); grp.add(s5);

    /* forward particles: VLDL -> IDL -> LDL, some deposit in the wall */
    var fwd = [];
    var mats = {
      vldl: new THREE.MeshStandardMaterial({ color:0xe67e22, roughness:0.45 }),
      idl:  new THREE.MeshStandardMaterial({ color:0xe8a13a, roughness:0.45 }),
      ldl:  new THREE.MeshStandardMaterial({ color:0xd63c2f, roughness:0.45 })
    };
    var geos = {
      vldl: new THREE.SphereGeometry(0.21, 14, 12),
      idl:  new THREE.SphereGeometry(0.17, 14, 12),
      ldl:  new THREE.SphereGeometry(0.14, 14, 12)
    };
    function stageOf(t){ return t < 0.38 ? "vldl" : (t < 0.68 ? "idl" : "ldl"); }
    for (var i = 0; i < 26; i++){
      var m = new THREE.Mesh(geos.vldl, mats.vldl);
      var t0 = Math.random();
      m.userData = { t:t0, deposit: Math.random() < 0.3, stuck:0, off:(Math.random() - 0.5) * 0.3 };
      grp.add(m); fwd.push(m);
    }
    var deposits = [];
    var depGeo = new THREE.SphereGeometry(0.09, 8, 8);
    var depMat = new THREE.MeshStandardMaterial({ color:0xf2b705, roughness:0.6 });

    /* HDL particles on the return path (offset below) */
    var hdlCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.2, -0.55, 0.4),
      new THREE.Vector3(1.4, -0.8, 0.5),
      new THREE.Vector3(-0.4, -0.6, 0.45),
      new THREE.Vector3(-2.2, -0.5, 0.3),
      new THREE.Vector3(-3.2, -0.15, 0.1)
    ]);
    var hdlVessel = new THREE.Mesh(new THREE.TubeGeometry(hdlCurve, 50, 0.3, 10, false),
      new THREE.MeshStandardMaterial({ color:0x2e7d5b, roughness:0.5, transparent:true, opacity:0.35 }));
    grp.add(hdlVessel);
    var hdls = [];
    var hdlMat = new THREE.MeshStandardMaterial({ color:0x2e9e6b, roughness:0.4 });
    var hdlGeo = new THREE.SphereGeometry(0.12, 12, 10);
    for (var j = 0; j < 12; j++){
      var hm = new THREE.Mesh(hdlGeo, hdlMat);
      hm.userData = { t: Math.random() };
      grp.add(hm); hdls.push(hm);
    }

    /* bile droplets leaving the liver downward */
    var biles = [];
    var bileMat = new THREE.MeshStandardMaterial({ color:0xc9a227, roughness:0.4 });
    var bileGeo = new THREE.SphereGeometry(0.09, 10, 8);
    for (var k = 0; k < 8; k++){
      var bm = new THREE.Mesh(bileGeo, bileMat);
      bm.userData = { t: Math.random() };
      grp.add(bm); biles.push(bm);
    }

    entry.tick = function(time, dt){
      var speed = pathway.playing ? dt * 0.000045 : 0;
      fwd.forEach(function(m){
        var u = m.userData;
        if (u.deposit && u.t > 0.94){
          /* slip into the wall and stay as part of the plaque */
          u.stuck += dt * 0.001;
          var target = new THREE.Vector3(4.15 + (Math.random() - 0.5) * 0.01, 0.95, 0);
          m.position.lerp(new THREE.Vector3(4.0, 0.8, 0), 0.02);
          if (u.stuck > 1 && deposits.length < 60){
            var d = new THREE.Mesh(depGeo, depMat);
            d.position.set(3.8 + Math.random() * 0.7, 0.75 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5);
            grp.add(d); deposits.push(d);
            u.t = 0; u.stuck = 0; u.deposit = Math.random() < 0.3;
          }
          return;
        }
        u.t += speed * (0.8 + (u.deposit ? 0.1 : 0.3));
        if (u.t > 1) u.t = 0;
        var st = stageOf(u.t);
        if (m.geometry !== geos[st]){ m.geometry = geos[st]; m.material = mats[st]; }
        var p = pathCurve.getPoint(Math.min(1, u.t));
        m.position.set(p.x, p.y + u.off * 0.5, p.z + u.off);
      });
      hdls.forEach(function(m){
        m.userData.t += speed * 1.15;
        if (m.userData.t > 1) m.userData.t = 0;
        m.position.copy(hdlCurve.getPoint(m.userData.t));
      });
      biles.forEach(function(m){
        m.userData.t += speed * 1.4;
        if (m.userData.t > 1) m.userData.t = 0;
        var t = m.userData.t;
        m.position.set(-3.7 + t * 0.25, -0.55 - t * 1.05, 0.3);
        m.material.opacity = 1;
      });
      grp.rotation.y = Math.sin(time * 0.00008) * 0.1;
    };
    return entry;
  }

  /* ================================================================
     Boot, controls, render loop
     ================================================================ */
  var entries = {};
  var booted = false;
  function boot(){
    if (booted) return; booted = true;
    try {
      entries.artery = buildArtery();
      entries.rupture = buildRupture();
      entries.liver = buildLiver();
      entries.pathway = buildPathway();
      scenes.forEach(fit);
    } catch (err){ showFallback(); return; }

    /* artery controls */
    var slider = $("arteryStage"), stageName = $("arteryStageName"), caption = $("arteryCaption");
    if (slider) slider.addEventListener("input", function(){
      artery.stage = parseInt(slider.value, 10);
      stageName.textContent = ARTERY_STAGES[artery.stage].name;
      caption.innerHTML = ARTERY_STAGES[artery.stage].cap;
    });
    var secBtn = $("arterySectionBtn");
    if (secBtn) secBtn.addEventListener("click", function(){
      artery.section = !artery.section;
      secBtn.setAttribute("aria-pressed", artery.section ? "true" : "false");
      secBtn.textContent = artery.section ? "Back to the tube view" : "Show cross-section";
      if (entries.artery.setSection) entries.artery.setSection(artery.section);
    });

    /* rupture controls */
    var stepBtnsWrap = $("ruptureSteps");
    var rCaption = $("ruptureCaption");
    var stepBtns = [];
    function setStep(n, fromPlay){
      rupture.step = Math.max(0, Math.min(RUPTURE_STEPS.length - 1, n));
      rCaption.innerHTML = "<strong>" + RUPTURE_STEPS[rupture.step].label + ".</strong> " + RUPTURE_STEPS[rupture.step].cap.replace(/^<strong>Step \d+ — [^<]*<\/strong>\s*/, "");
      stepBtns.forEach(function(b, i){ b.classList.toggle("on", i === rupture.step); });
      if (!fromPlay && rupture.playing) togglePlay(false);
    }
    rupture._setStep = setStep;
    RUPTURE_STEPS.forEach(function(s, i){
      var b = document.createElement("button");
      b.type = "button"; b.textContent = s.label;
      b.addEventListener("click", function(){ setStep(i); });
      stepBtnsWrap.appendChild(b); stepBtns.push(b);
    });
    var playBtn = $("rupturePlay");
    function togglePlay(on){
      rupture.playing = on;
      rupture.lastAdvance = performance.now();
      playBtn.setAttribute("aria-pressed", on ? "true" : "false");
      playBtn.textContent = on ? "⏸ Pause" : "▶ Play";
    }
    rupture._togglePlay = togglePlay;
    if (playBtn) playBtn.addEventListener("click", function(){
      if (!rupture.playing && rupture.step >= RUPTURE_STEPS.length - 1) setStep(0, true);
      togglePlay(!rupture.playing);
    });
    var prevB = $("rupturePrev"), nextB = $("ruptureNext");
    if (prevB) prevB.addEventListener("click", function(){ setStep(rupture.step - 1); });
    if (nextB) nextB.addEventListener("click", function(){ setStep(rupture.step + 1); });
    setStep(0, true);

    /* liver controls */
    var statinBtn = $("statinBtn"), liverCaption = $("liverCaption");
    if (statinBtn) statinBtn.addEventListener("click", function(){
      liverState.statin = !liverState.statin;
      statinBtn.setAttribute("aria-pressed", liverState.statin ? "true" : "false");
      statinBtn.textContent = liverState.statin ? "Statin taken — tap to undo" : "Take the statin (atorvastatin)";
      liverCaption.innerHTML = liverState.statin
        ? "<strong>Statin on board.</strong> Atorvastatin blocks HMG-CoA reductase, so the factory slows right down: far less cholesterol is made, far fewer VLDL particles leave. The liver then pulls more LDL out of the blood to restock — which is how LDL falls toward the usual target of under 100."
        : "<strong>No statin.</strong> HMG-CoA reductase (the glowing marker) runs at full speed, the liver makes cholesterol freely, and VLDL particles leave loaded — the start of the chain that ends with LDL 130.";
    });

    /* pathway controls */
    var pwBtn = $("pathwayPlay");
    if (pwBtn){
      pwBtn.setAttribute("aria-pressed", pathway.playing ? "true" : "false");
      pwBtn.textContent = pathway.playing ? "⏸ Pause" : "▶ Play";
      pwBtn.addEventListener("click", function(){
        pathway.playing = !pathway.playing;
        pwBtn.setAttribute("aria-pressed", pathway.playing ? "true" : "false");
        pwBtn.textContent = pathway.playing ? "⏸ Pause" : "▶ Play";
      });
    }

    /* chapter callouts: [data-goto-3d] scrolls here and flashes the model */
    document.addEventListener("click", function(e){
      var el = e.target.closest("[data-goto-3d]");
      if (!el) return;
      var target = $("d3-" + el.getAttribute("data-goto-3d"));
      var sec = $("explore3d");
      if (sec && sec.hidden && window.__show3D) { window.__show3D(el.getAttribute("data-goto-3d")); return; }
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block:"start" });
      else if (sec) sec.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      if (target){
        target.classList.remove("flash");
        setTimeout(function(){ target.classList.add("flash"); }, reduceMotion ? 0 : 350);
        setTimeout(function(){ target.classList.remove("flash"); }, 2600);
      }
    });

    startLoop();
  }

  var lastTime = 0;
  function startLoop(){
    function frame(time){
      requestAnimationFrame(frame);
      var dt = Math.min(50, time - lastTime); lastTime = time;
      if (document.hidden) return;
      if (rupture.playing && rupture._setStep && time - rupture.lastAdvance > 3400){
        rupture.lastAdvance = time;
        if (rupture.step < RUPTURE_STEPS.length - 1) rupture._setStep(rupture.step + 1, true);
        else if (rupture._togglePlay) rupture._togglePlay(false);
      }
      scenes.forEach(function(en){
        if (!en.active) return;
        if (en.tick) en.tick(time, dt);
        en.controls.update();
        en.renderer.render(en.scene, en.camera);
      });
    }
    requestAnimationFrame(frame);
  }
  /* lazy boot + per-scene visibility */
  var section = $("explore3d");
  if ("IntersectionObserver" in window && section){
    var bootObs = new IntersectionObserver(function(es){
      es.forEach(function(en){ if (en.isIntersecting){ boot(); bootObs.disconnect(); } });
    }, { rootMargin:"600px" });
    bootObs.observe(section);
    scenes.forEach(function(){});
    var visObs = new IntersectionObserver(function(es){
      es.forEach(function(en){
        var entry = scenes.filter(function(s){ return s.mount === en.target; })[0];
        if (entry) entry.active = en.isIntersecting;
      });
    }, { rootMargin:"120px" });
    document.querySelectorAll(".d3-mount").forEach(function(m){ visObs.observe(m); });
  } else {
    boot();
    scenes.forEach(function(s){ s.active = true; });
  }
  /* after boot, mounts exist in scenes; observe again once booted */
  var lateObs = setInterval(function(){
    if (booted){
      clearInterval(lateObs);
      if ("IntersectionObserver" in window){
        var vo = new IntersectionObserver(function(es){
          es.forEach(function(en){
            var entry = scenes.filter(function(s){ return s.mount === en.target; })[0];
            if (entry) entry.active = en.isIntersecting;
          });
        }, { rootMargin:"120px" });
        scenes.forEach(function(s){ vo.observe(s.mount); if (!s.active) s.active = true; });
      } else {
        scenes.forEach(function(s){ s.active = true; });
      }
    }
  }, 400);

  window.addEventListener("resize", function(){ scenes.forEach(fit); });
})();
