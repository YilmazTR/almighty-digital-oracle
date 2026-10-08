/* ============================================================
   Almighty Digital Oracle — logic
   ============================================================ */
(function(){
  "use strict";

  const STORAGE_KEY = "ado.history.v1";
  const CONSENT_KEY = "ado.consent.v1";
  const SW_PATH = "sw.js";

  // ---------- State ----------
  let lang = "en";
  let currentIndex = 0;
  let zodiacScores = {};
  let zodiacLastAt = {};
  let mbtiScores = { E:0, I:0, S:0, N:0, T:0, F:0, J:0, P:0 };

  let I18N = {}, SIGNS = {}, INTAKE = [], ZODIAC_QUIZ = [], MBTI_QUIZ = [], MBTI_TYPES = {};
  let SEQUENCE = [];

  let lastFocusBeforeModal = null;

  // DOM
  const el = {
    brandText: document.getElementById("brand-text"),
    appTitle: document.getElementById("app-title"),
    appSubtitle: document.getElementById("app-subtitle"),
    progressRow: document.getElementById("progress-row"),
    progressLabel: document.getElementById("progress-label"),
    progressPct: document.getElementById("progress-pct"),
    barWrap: document.getElementById("bar-wrap"),
    barFill: document.getElementById("bar-fill"),
    content: document.getElementById("content"),
    thinking: document.getElementById("thinking"),
    thinkingText: document.getElementById("thinking-text"),
    pulse: document.getElementById("pulse"),
    langEn: document.getElementById("lang-en"),
    langTr: document.getElementById("lang-tr"),
    historyBtn: document.getElementById("history-btn"),
    historyLabel: document.getElementById("history-label"),
    historyModal: document.getElementById("history-modal"),
    historyClose: document.getElementById("history-close"),
    historyBody: document.getElementById("history-body"),
    exportBtn: document.getElementById("export-btn"),
    wipeBtn: document.getElementById("wipe-btn"),
    consentModal: document.getElementById("consent-modal"),
    consentYes: document.getElementById("consent-yes"),
    consentNo: document.getElementById("consent-no"),
    consentCopy: document.getElementById("consent-copy"),
    consentTitle: document.getElementById("consent-title"),
    footerStorage: document.getElementById("footer-storage"),
    toast: document.getElementById("toast")
  };

  const t = (key) => I18N[lang][key];

  // ---------- Data loading ----------
  async function loadJSON(path){
    const res = await fetch(path, { cache: "force-cache" });
    if (!res.ok) throw new Error("Failed to load " + path);
    return res.json();
  }
  async function loadAllData(){
    const [i18n, signs, intake, zodiac, mbti, types] = await Promise.all([
      loadJSON("data/i18n.json"),
      loadJSON("data/signs.json"),
      loadJSON("data/intake.json"),
      loadJSON("data/zodiac.json"),
      loadJSON("data/mbti.json"),
      loadJSON("data/types.json")
    ]);
    I18N = i18n;
    SIGNS = signs;
    INTAKE = intake;
    ZODIAC_QUIZ = zodiac;
    MBTI_QUIZ = mbti;
    MBTI_TYPES = types;
    SEQUENCE = [
      ...INTAKE.map(d => ({ kind:"intake", data:d })),
      ...ZODIAC_QUIZ.map(d => ({ kind:"zodiac", data:d })),
      ...MBTI_QUIZ.map(d => ({ kind:"mbti", data:d }))
    ];
  }

  // ---------- Storage ----------
  function getHistory(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function setHistory(arr){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
  }
  function appendHistory(entry){
    const arr = getHistory();
    arr.unshift(entry);
    if (arr.length > 100) arr.length = 100;
    setHistory(arr);
  }
  function clearHistory(){
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
  function getConsent(){
    try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
  }
  function setConsent(v){
    try { localStorage.setItem(CONSENT_KEY, v); } catch {}
  }

  // ---------- Reset ----------
  function resetState(){
    currentIndex = 0;
    zodiacScores = {};
    zodiacLastAt = {};
    for (const k in SIGNS){ zodiacScores[k] = 0; zodiacLastAt[k] = -1; }
    mbtiScores = { E:0, I:0, S:0, N:0, T:0, F:0, J:0, P:0 };
  }

  // ---------- Language ----------
  function setLang(next){
    if (!I18N[next]) return;
    lang = next;
    el.langEn.setAttribute("aria-pressed", String(lang === "en"));
    el.langTr.setAttribute("aria-pressed", String(lang === "tr"));
    document.documentElement.lang = lang;

    el.brandText.textContent = t("brand");
    el.appTitle.textContent = t("title");
    el.appSubtitle.textContent = t("subtitle");
    el.historyLabel.textContent = t("history");
    el.footerStorage.textContent = getConsent() === "yes" ? t("footerStored") : t("footerNotStored");
    el.consentTitle.textContent = t("consentTitle");
    el.consentCopy.textContent = t("consentCopy");
    el.consentYes.textContent = t("consentYes");
    el.consentNo.textContent = t("consentNo");
    document.getElementById("history-title").textContent = t("historyTitle");
    el.exportBtn.textContent = t("exportJson");
    el.wipeBtn.textContent = t("wipeData");

    if (currentIndex < SEQUENCE.length) renderQuestion();
    else showResult();
  }

  // ---------- Helpers ----------
  function getLeadingSign(){
    let max = -Infinity, leader = null;
    for (const k in zodiacScores){
      if (zodiacScores[k] > max){ max = zodiacScores[k]; leader = k; }
    }
    return max === 0 ? null : leader;
  }
  function currentMbtiType(){
    return (mbtiScores.E >= mbtiScores.I ? "E" : "I")
         + (mbtiScores.S >= mbtiScores.N ? "S" : "N")
         + (mbtiScores.T >= mbtiScores.F ? "T" : "F")
         + (mbtiScores.J >= mbtiScores.P ? "J" : "P");
  }
  function updateThinking(){
    const item = SEQUENCE[currentIndex];
    if (!item) return;
    if (item.kind === "mbti"){
      el.thinkingText.innerHTML = `${t("thinkingPrefix")} <b>${currentMbtiType()}</b>`;
      el.pulse.classList.remove("done");
      return;
    }
    const leader = getLeadingSign();
    if (!leader){
      el.thinkingText.textContent = t("thinkingEmpty");
      el.pulse.classList.remove("done");
      return;
    }
    const z = SIGNS[leader];
    el.thinkingText.innerHTML = `${t("thinkingPrefix")} <b>${z.glyph} ${z.name[lang]}</b>`;
    el.pulse.classList.remove("done");
  }
  function updateProgress(){
    const total = SEQUENCE.length;
    const pct = Math.round((currentIndex / total) * 100);
    el.progressLabel.textContent = `${t("question")} ${currentIndex + 1} ${t("of")} ${total}`;
    el.progressPct.textContent = `${pct}%`;
    el.barFill.style.width = `${pct}%`;
    el.barWrap.setAttribute("aria-valuenow", String(pct));
  }
  function showToast(msg, ms){
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(showToast._tid);
    showToast._tid = setTimeout(() => { el.toast.hidden = true; }, ms || 2400);
  }

  // ---------- Render question ----------
  function renderQuestion(){
    const item = SEQUENCE[currentIndex];
    if (!item) return;
    const q = item.data;

    el.progressRow.hidden = false;
    el.barWrap.hidden = false;
    el.thinking.hidden = false;
    el.historyBtn.hidden = getHistory().length === 0;

    updateProgress();
    updateThinking();

    const sectionLabel =
      item.kind === "intake" ? t("sectionIntake") :
      item.kind === "zodiac" ? t("sectionZodiac") :
      t("sectionMbti");

    const optsHtml = q.o.map((opt, i) =>
      `<button class="opt" type="button" data-idx="${i}">${opt.t[lang]}</button>`
    ).join("");

    el.content.innerHTML = `
      <span class="section-tag">${sectionLabel}</span>
      <h2 class="q" id="q-heading" tabindex="-1">${q.q[lang]}</h2>
      <div class="opts" role="group" aria-labelledby="q-heading">${optsHtml}</div>
    `;
    el.content.querySelectorAll(".opt").forEach(b => b.addEventListener("click", handleAnswer));

    const heading = document.getElementById("q-heading");
    if (heading) heading.focus({ preventScroll: true });
  }

  function handleAnswer(e){
    const btn = e.currentTarget;
    const idx = parseInt(btn.dataset.idx, 10);
    const item = SEQUENCE[currentIndex];
    const chosen = item.data.o[idx];

    el.content.querySelectorAll(".opt").forEach(b => b.disabled = true);

    if (item.kind === "intake"){
      zodiacScores[chosen.p] += 2;
      zodiacScores[chosen.s] += 1;
      zodiacLastAt[chosen.p] = currentIndex;
    } else if (item.kind === "zodiac"){
      zodiacScores[chosen.s] += 1;
      zodiacLastAt[chosen.s] = currentIndex;
    } else {
      mbtiScores[chosen.a] += 1;
    }

    currentIndex++;
    if (currentIndex < SEQUENCE.length){
      setTimeout(() => {
        renderQuestion();
        el.content.classList.remove("fade");
        void el.content.offsetWidth;
        el.content.classList.add("fade");
      }, 180);
    } else {
      setTimeout(showResult, 220);
    }
  }

  // ---------- Result computation ----------
  function getTopSign(){
    let max = -Infinity, candidates = [];
    for (const k in zodiacScores){
      const v = zodiacScores[k];
      if (v > max){ max = v; candidates = [k]; }
      else if (v === max) candidates.push(k);
    }
    if (candidates.length === 1) return candidates[0];
    candidates.sort((a,b) => {
      if (zodiacLastAt[b] !== zodiacLastAt[a]) return zodiacLastAt[b] - zodiacLastAt[a];
      return a.localeCompare(b);
    });
    return candidates[0];
  }
  function axisPair(a, b, labelA, labelB){
    const va = mbtiScores[a], vb = mbtiScores[b];
    const total = va + vb || 1;
    const pctA = Math.round((va / total) * 100);
    return { labelA, labelB, pctA, pctB: 100 - pctA };
  }
  function bridgeText(zodiacKey, mbtiType){
    const s = SIGNS[zodiacKey];
    const sun = s.name[lang];
    const m = mbtiType;
    const pack = {
      en:{
        intro:`Your ${sun} energy describes how you show up. Your ${m} type describes how you think and decide. Put together, the picture gets specific.`,
        lines:[
          `You lead with the emotional weather of ${sun} and process the world through the framework of ${m}.`,
          `When ${sun}'s impulse and ${m}'s instinct agree, you're unstoppable. When they don't, you feel the tug.`,
          `The person your friends recognize is the ${sun}. The person you are at 3am is the ${m}.`,
          `Most people see the ${sun}. The ones who know you see the ${m}.`
        ]
      },
      tr:{
        intro:`${sun} enerjiniz nasıl göründüğünüzü anlatıyor. ${m} tipiniz nasıl düşündüğünüzü ve karar verdiğinizi anlatıyor. Bir araya geldiklerinde tablo netleşiyor.`,
        lines:[
          `${sun}'ın duygusal havasıyla öne çıkıyor ve dünyayı ${m} çerçevesiyle işliyorsunuz.`,
          `${sun}'ın dürtüsü ile ${m}'in içgüdüsü aynı fikirde olduğunda durdurulamazsınız. Olmadığında aradaki çekişi hissedersiniz.`,
          `Arkadaşlarınızın tanıdığı kişi ${sun}. Gece 03:00'te olduğunuz kişi ${m}.`,
          `Çoğu insan ${sun}'ı görür. Sizi tanıyanlar ${m}'i görür.`
        ]
      }
    }[lang];
    const seed = (zodiacKey + mbtiType).split("").reduce((a,c)=>a + c.charCodeAt(0), 0);
    const line = pack.lines[seed % pack.lines.length];
    return `<b>${t("bridgePrefix")}</b> ${pack.intro} ${line}`;
  }
  function saveResultIfConsented(zKey, mKey){
    if (getConsent() !== "yes") return;
    const entry = {
      ts: Date.now(),
      zodiac: zKey,
      mbti: mKey,
      zodiacScores: { ...zodiacScores },
      mbtiScores: { ...mbtiScores }
    };
    appendHistory(entry);
    el.historyBtn.hidden = false;
  }

  // ---------- Share as image (Canvas) ----------
  function generateShareImage(zKey, mKey){
    const W = 1080, H = 1350;
    const dpr = 2;
    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0714");
    bg.addColorStop(1, "#1a1033");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // star dots
    for (let i = 0; i < 220; i++){
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = Math.random() * 1.4 + 0.3;
      ctx.globalAlpha = Math.random() * 0.7 + 0.15;
      ctx.fillStyle = Math.random() > 0.8 ? "#c9a6ff" : "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // top header
    ctx.fillStyle = "#c9a6ff";
    ctx.font = "600 28px -apple-system, 'SF Pro Display', Helvetica, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ALMIGHTY DIGITAL ORACLE", 80, 130);

    ctx.fillStyle = "#7d7a90";
    ctx.font = "500 22px -apple-system, sans-serif";
    ctx.fillText("Your reading", 80, 172);

    // zodiac glyph
    const z = SIGNS[zKey];
    ctx.fillStyle = "#ffffff";
    ctx.font = "300 180px -apple-system, 'SF Pro Display', Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(z.glyph, W / 2, 420);

    // zodiac name
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 88px -apple-system, 'SF Pro Display', Helvetica, Arial, sans-serif";
    ctx.fillText(z.name[lang], W / 2, 540);

    // dates
    ctx.fillStyle = "#c9a6ff";
    ctx.font = "500 24px -apple-system, sans-serif";
    ctx.fillText(z.dates[lang].toUpperCase(), W / 2, 588);

    // divider
    ctx.strokeStyle = "rgba(201,166,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(180, 640);
    ctx.lineTo(W - 180, 640);
    ctx.stroke();

    // zodiac verdict (wrap)
    ctx.fillStyle = "#e8e3f5";
    ctx.font = "400 30px -apple-system, 'SF Pro Text', Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    wrapText(ctx, z.verdict[lang], W / 2, 710, W - 200, 42);

    // MBTI block
    const m = MBTI_TYPES[mKey];
    ctx.fillStyle = "#c9a6ff";
    ctx.font = "600 24px -apple-system, sans-serif";
    ctx.fillText("PERSONALITY TYPE", W / 2, 1010);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 96px -apple-system, 'SF Pro Display', Helvetica, Arial, sans-serif";
    ctx.fillText(mKey, W / 2, 1110);

    ctx.fillStyle = "#e8e3f5";
    ctx.font = "500 32px -apple-system, sans-serif";
    ctx.fillText(m.name[lang], W / 2, 1160);

    // footer
    ctx.fillStyle = "#7d7a90";
    ctx.font = "400 22px -apple-system, sans-serif";
    ctx.fillText("© Yilmaz  ·  almighty-digital-oracle", W / 2, H - 60);

    return canvas.toBlob((blob) => {
      if (!blob) { showToast("Could not generate image."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `oracle-${zKey}-${mKey}-${new Date().toISOString().slice(0,10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Image saved.");
    }, "image/png");
  }
  function wrapText(ctx, text, cx, y, maxWidth, lineHeight){
    const words = text.split(" ");
    let line = "";
    const lines = [];
    for (let n = 0; n < words.length; n++){
      const test = line + words[n] + " ";
      const w = ctx.measureText(test).width;
      if (w > maxWidth && n > 0){
        lines.push(line.trim());
        line = words[n] + " ";
      } else {
        line = test;
      }
    }
    lines.push(line.trim());
    // cap at 5 lines to fit
    const shown = lines.slice(0, 5);
    shown.forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
  }

  // ---------- Result screen ----------
  function showResult(){
    const zKey = getTopSign();
    const z = SIGNS[zKey];
    const mKey = currentMbtiType();
    const m = MBTI_TYPES[mKey];
    const total = SEQUENCE.length;

    el.progressRow.hidden = false;
    el.barWrap.hidden = false;
    el.barFill.style.width = "100%";
    el.progressLabel.textContent = `${t("question")} ${total} ${t("of")} ${total}`;
    el.progressPct.textContent = "100%";
    el.barWrap.setAttribute("aria-valuenow", "100");

    el.thinking.hidden = false;
    el.thinkingText.innerHTML = `${t("thinkingDone")} <b>${z.glyph} ${z.name[lang]} · ${mKey}</b>`;
    el.pulse.classList.add("done");

    const rows = [
      axisPair("E","I", t("axesE"), t("axesI")),
      axisPair("S","N", t("axesS"), t("axesN")),
      axisPair("T","F", t("axesT"), t("axesF")),
      axisPair("J","P", t("axesJ"), t("axesP"))
    ].map(p => {
      const leading = p.pctA >= 50 ? p.labelA : p.labelB;
      const pct = p.pctA >= 50 ? p.pctA : p.pctB;
      return `<div class="row"><span>${p.labelA} / ${p.labelB}</span><span>${leading} · ${pct}%</span></div>`;
    }).join("");

    el.content.innerHTML = `
      <div class="result">
        <div class="zodiac-block">
          <div class="section-tag">${t("zodiacLabel")}</div>
          <div class="glyph" aria-hidden="true">${z.glyph}</div>
          <h1 class="sign-name">${z.name[lang]}</h1>
          <div class="dates">${z.dates[lang]}</div>
          <p class="verdict">${z.verdict[lang]}</p>
          <div class="traits">${z.traits[lang].map(x => `<span class="chip">${x}</span>`).join("")}</div>
          <p class="meta-line"><b>${t("bestMatch")}:</b> ${z.match[lang]}</p>
          <p class="meta-line"><b>${t("shadowSide")}:</b> ${z.shadow[lang]}</p>
        </div>

        <div class="mbti-block">
          <div class="mbti-label">${t("mbtiLabel")}</div>
          <div class="mbti-type">${mKey}</div>
          <p class="mbti-name">${m.name[lang]}</p>
          <div class="mbti-axes">${rows}</div>
          <p class="mbti-desc">${m.desc[lang]}</p>
        </div>

        <div class="bridge">${bridgeText(zKey, mKey)}</div>
        <p class="disclaimer">${t("disclaimer")}</p>

        <div class="result-actions">
          <button class="cta" type="button" id="share-btn">Save result image</button>
          <button class="cta secondary" type="button" id="restart">${t("startOver")}</button>
        </div>
      </div>
    `;

    document.getElementById("restart").addEventListener("click", () => {
      resetState();
      el.thinking.hidden = false;
      el.pulse.classList.remove("done");
      renderQuestion();
    });
    document.getElementById("share-btn").addEventListener("click", () => {
      generateShareImage(zKey, mKey);
    });

    saveResultIfConsented(zKey, mKey);
  }

  // ---------- History modal ----------
  function openHistory(){
    lastFocusBeforeModal = document.activeElement;
    const arr = getHistory();
    if (!arr.length){
      el.historyBody.innerHTML = `<p class="history-empty">${t("historyEmpty")}</p>`;
    } else {
      el.historyBody.innerHTML = arr.map(entry => {
        const d = new Date(entry.ts);
        const when = d.toLocaleString(lang === "tr" ? "tr-TR" : "en-US", {
          year:"numeric", month:"short", day:"numeric",
          hour:"2-digit", minute:"2-digit"
        });
        const z = SIGNS[entry.zodiac];
        const m = MBTI_TYPES[entry.mbti];
        const zName = z ? `${z.glyph} ${z.name[lang]}` : entry.zodiac;
        const mName = m ? `${entry.mbti} · ${m.name[lang]}` : entry.mbti;
        return `<div class="history-entry">
          <div class="history-what"><b>${zName}</b><br>${mName}</div>
          <div class="history-when">${when}</div>
        </div>`;
      }).join("");
    }
    el.historyModal.hidden = false;
    el.historyClose.focus();
  }
  function closeHistory(){
    el.historyModal.hidden = true;
    if (lastFocusBeforeModal && lastFocusBeforeModal.focus){
      lastFocusBeforeModal.focus();
    } else {
      el.historyBtn.focus();
    }
  }
  function exportHistory(){
    const arr = getHistory();
    const blob = new Blob([JSON.stringify(arr, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oracle-readings-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Exported.");
  }
  function wipeHistory(){
    if (confirm(t("wipeConfirm"))){
      clearHistory();
      el.historyBtn.hidden = true;
      closeHistory();
      showToast("All data deleted.");
    }
  }

  // ---------- Consent modal ----------
  function onConsentYes(){
    setConsent("yes");
    el.consentModal.hidden = true;
    el.footerStorage.textContent = t("footerStored");
    el.consentYes.removeEventListener("click", onConsentYes);
    el.consentNo.removeEventListener("click", onConsentNo);
    renderQuestion();
  }
  function onConsentNo(){
    setConsent("no");
    el.consentModal.hidden = true;
    el.footerStorage.textContent = t("footerNotStored");
    el.consentYes.removeEventListener("click", onConsentYes);
    el.consentNo.removeEventListener("click", onConsentNo);
    renderQuestion();
  }
  function showConsentIfNeeded(){
    const c = getConsent();
    if (c === "yes" || c === "no"){
      el.footerStorage.textContent = c === "yes" ? t("footerStored") : t("footerNotStored");
      renderQuestion();
      return;
    }
    lastFocusBeforeModal = document.activeElement;
    el.consentModal.hidden = false;
    el.consentYes.focus();
    el.consentYes.addEventListener("click", onConsentYes);
    el.consentNo.addEventListener("click", onConsentNo);
  }

  // ---------- Wire events ----------
  el.langEn.addEventListener("click", () => setLang("en"));
  el.langTr.addEventListener("click", () => setLang("tr"));
  el.historyBtn.addEventListener("click", openHistory);
  el.historyClose.addEventListener("click", closeHistory);
  el.historyModal.addEventListener("click", (e) => { if (e.target === el.historyModal) closeHistory(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.historyModal.hidden) closeHistory();
  });
  el.exportBtn.addEventListener("click", exportHistory);
  el.wipeBtn.addEventListener("click", wipeHistory);

  // ---------- Service worker ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:"){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(SW_PATH).catch(() => { /* silent */ });
    });
  }

  // ---------- Init ----------
  (async function init(){
    try {
      await loadAllData();
      resetState();
      el.historyLabel.textContent = t("history");
      el.historyBtn.hidden = getHistory().length === 0;
      setLang(lang);
      showConsentIfNeeded();
    } catch (err){
      console.error(err);
      el.appSubtitle.textContent =
        "Could not load. If you opened this file directly, please serve it over a local web server (the data folder uses fetch, which needs http://).";
    }
  })();
})();