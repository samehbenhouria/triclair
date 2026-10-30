'use strict';
/* TriClair UI: photo classification (MobileNet, in-browser) + manual picker
 * + impact journal in localStorage. Rules live in rules.js (window.TriRules).
 * Phase B (2026-10-30): full FR/EN interface, French by default, and a
 * per-city rules selector (Longueuil / Montréal). Language and city are
 * persisted in localStorage; changing either re-renders the current UI and
 * the last verdict WITHOUT logging it again. */
(function () {
  var R = window.TriRules;
  var JOURNAL_KEY = 'triclair.journal.v1';
  var LANG_KEY = 'triclair.lang';
  var CITY_KEY = 'triclair.city';

  var I18N = {
    fr: {
      docTitle: 'TriClair — Triez vos déchets comme il faut, au Québec',
      tagline: 'Prenez une photo d\'un objet. Obtenez le bon bac pour votre ville, au Québec — avec la règle locale qui explique pourquoi. Quand TriClair n\'est pas sûr, il le dit.',
      cityLabel: 'Ville :',
      impactTitle: '📊 Journal d\'impact',
      statTotal: 'objets triés',
      statRecycling: '🔵 recyclage',
      statCompost: '🟤 compost',
      statGarbage: '⚫ ordures',
      statEcocentre: '🟠 écocentre',
      statUncertain: 'taux d\'incertain',
      exportBtn: 'Exporter le journal (JSON)',
      resetBtn: 'Réinitialiser',
      impactNote: 'Stocké seulement dans votre navigateur (localStorage). Le taux d\'incertain est une fonction, pas un échec : il compte les réponses que TriClair a refusé de deviner.',
      photoTitle: '📷 1. Photo',
      modelLoading: 'Chargement du modèle photo sur l\'appareil…',
      modelReady: 'Modèle photo prêt — tout roule sur votre appareil.',
      modelFailed: 'Le modèle photo n\'a pas pu charger. Le sélecteur manuel fonctionne toujours.',
      modelUnavailable: 'Modèle photo indisponible. Le sélecteur manuel fonctionne toujours.',
      photoBtn: 'Choisir ou prendre une photo',
      tryPrefix: 'Essayez : ',
      samples: ['Bouteille de plastique', 'Bouteilles de bière', 'Banane', 'Téléphone cellulaire', 'Objet inconnu'],
      previewAlt: 'Aperçu de l\'objet choisi',
      conditionTitle: '🧺 2. Dans quel état est-il ?',
      condClean: 'Propre / vide',
      condSoiled: 'Souillé (nourriture / graisse)',
      condBroken: 'Brisé / déchiré',
      conditionNote: 'L\'état change la réponse : une boîte de pizza propre est recyclée, une graisseuse est compostée — et le verre brisé ne va jamais au bac de récupération.',
      manualTitle: '✋ Pas de photo ? Choisissez la matière',
      materialBtn: 'Où ça va ?',
      materials: { plastic: 'Plastique', metal: 'Métal', glass: 'Verre', paper: 'Papier', cardboard: 'Carton', food: 'Nourriture', electronics: 'Électronique', textile: 'Textile', other: 'Autre' },
      verdictOk: '➡️ Verdict',
      verdictUncertain: '🤔 Incertain',
      confidenceLabel: 'Confiance du modèle : ',
      recognizedAs: ' — reconnu comme « ',
      recognizedEnd: ' »',
      itemLabel: 'Objet : ',
      classifying: 'Classification en cours…',
      modelDownNote: 'le modèle photo est indisponible (hors-ligne ?). Le sélecteur manuel ci-dessous fonctionne sans lui. Cet échec n\'est pas compté dans le journal d\'impact.',
      noteLabel: 'Note : ',
      footer: 'Règles simplifiées à partir des guides officiels des villes de Longueuil et de Montréal — vérifiez toujours le guide officiel de votre ville pour les cas limites. La classification roule à 100 % dans votre navigateur (TensorFlow.js + MobileNet) ; aucune photo ne quitte votre appareil.'
    },
    en: {
      docTitle: 'TriClair — Sort your waste right, in Québec',
      tagline: 'Take a photo of an item. Get the right bin for your city in Québec — with the local rule that explains why. When TriClair is not sure, it says so.',
      cityLabel: 'City:',
      impactTitle: '📊 Impact journal',
      statTotal: 'items sorted',
      statRecycling: '🔵 recycling',
      statCompost: '🟤 compost',
      statGarbage: '⚫ garbage',
      statEcocentre: '🟠 ecocentre',
      statUncertain: 'uncertain rate',
      exportBtn: 'Export journal (JSON)',
      resetBtn: 'Reset',
      impactNote: 'Stored only in your browser (localStorage). The uncertain rate is a feature, not a failure: it counts the guesses TriClair refused to make.',
      photoTitle: '📷 1. Photo',
      modelLoading: 'Loading the on-device photo model…',
      modelReady: 'Photo model ready — everything runs on your device.',
      modelFailed: 'Photo model failed to load. Manual picker still works.',
      modelUnavailable: 'Photo model unavailable. Manual picker still works.',
      photoBtn: 'Choose or take a photo',
      tryPrefix: 'Try: ',
      samples: ['Plastic bottle', 'Beer bottles', 'Banana', 'Cell phone', 'Unknown object'],
      previewAlt: 'Selected item preview',
      conditionTitle: '🧺 2. What state is it in?',
      condClean: 'Clean / empty',
      condSoiled: 'Soiled (food / grease)',
      condBroken: 'Broken / torn',
      conditionNote: 'Condition changes the answer: a clean pizza box is recycled, a greasy one is composted — and broken glass never goes in the recycling bin.',
      manualTitle: '✋ No photo? Pick the material',
      materialBtn: 'Where does it go?',
      materials: { plastic: 'Plastic', metal: 'Metal', glass: 'Glass', paper: 'Paper', cardboard: 'Cardboard', food: 'Food', electronics: 'Electronics', textile: 'Textile', other: 'Other' },
      verdictOk: '➡️ Verdict',
      verdictUncertain: '🤔 Not sure',
      confidenceLabel: 'Model confidence: ',
      recognizedAs: ' — recognized as “',
      recognizedEnd: '”',
      itemLabel: 'Item: ',
      classifying: 'Classifying…',
      modelDownNote: 'the photo model is unavailable (offline?). The manual picker below works without it. This failure is not counted in the impact journal.',
      noteLabel: 'Note: ',
      footer: 'Rules simplified from the official guidance of the cities of Longueuil and Montréal — always check your city\'s official waste guide for edge cases. Classification runs 100% in your browser (TensorFlow.js + MobileNet); no photo ever leaves your device.'
    }
  };

  var SAMPLE_FILES = [
    'samples/plastic-bottle.jpg',
    'samples/beer-bottles.jpg',
    'samples/banana.jpg',
    'samples/cell-phone.jpg',
    'samples/unknown.jpg'
  ];

  var $ = function (id) { return document.getElementById(id); };
  var model = null;
  var modelState = 'loading'; // loading | ready | failed | unavailable
  var currentImg = null;
  // Last shown verdict input, so a language/city change can re-render the
  // same decision in the new language/city without logging it twice.
  var lastShown = null; // {kind:'photo',label,confidence,box} | {kind:'manual',material,box} | {kind:'modeldown',box}

  function stored(key, allowed, fallback) {
    try {
      var v = localStorage.getItem(key);
      return allowed.indexOf(v) >= 0 ? v : fallback;
    } catch (e) { return fallback; }
  }
  var lang = stored(LANG_KEY, ['fr', 'en'], R.DEFAULT_LANG);
  var city = stored(CITY_KEY, R.CITY_KEYS, R.DEFAULT_CITY);

  function t() { return I18N[lang]; }
  function opts() { return { city: city, lang: lang }; }
  function persist() {
    try {
      localStorage.setItem(LANG_KEY, lang);
      localStorage.setItem(CITY_KEY, city);
    } catch (e) { /* private mode: prefs simply will not persist */ }
  }

  function condition() {
    var el = document.querySelector('input[name="condition"]:checked');
    return el ? el.value : 'clean';
  }

  // --- Impact journal ------------------------------------------------------
  function loadJournal() {
    try { return JSON.parse(localStorage.getItem(JOURNAL_KEY)) || []; }
    catch (e) { return []; }
  }
  function logVerdict(v, source) {
    var journal = loadJournal();
    journal.push({
      ts: new Date().toISOString(), source: source, city: city,
      item: v.itemName || v.label || 'unknown', bin: v.bin,
      confidence: (typeof v.confidence === 'number') ? +v.confidence.toFixed(3) : null
    });
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    renderStats(journal);
  }
  function renderStats(journal) {
    journal = journal || loadJournal();
    var counts = { recycling: 0, compost: 0, garbage: 0, ecocentre: 0, uncertain: 0 };
    journal.forEach(function (e) { if (counts[e.bin] !== undefined) counts[e.bin]++; });
    $('stat-total').textContent = journal.length;
    $('stat-recycling').textContent = counts.recycling;
    $('stat-compost').textContent = counts.compost;
    $('stat-garbage').textContent = counts.garbage;
    $('stat-ecocentre').textContent = counts.ecocentre;
    $('stat-uncertain-rate').textContent = journal.length
      ? Math.round(100 * counts.uncertain / journal.length) + '%' : '—';
  }

  // --- Verdict rendering ----------------------------------------------------
  function showVerdict(box, v) {
    var s = t();
    var heading = v.status === 'uncertain' ? s.verdictUncertain : s.verdictOk;
    box.hidden = false;
    box.className = 'verdict ' + v.bin;
    var conf = (typeof v.confidence === 'number')
      ? '<p>' + s.confidenceLabel + '<strong>' + Math.round(v.confidence * 100) + '%</strong>' +
        (v.label ? s.recognizedAs + v.label + s.recognizedEnd : '') + '</p>' : '';
    box.innerHTML = '<h3>' + heading + ': ' + v.binLabel + '</h3>' + conf +
      (v.itemName ? '<p><strong>' + s.itemLabel + '</strong>' + v.itemName + '</p>' : '') +
      '<p>' + v.rule + '</p>';
  }

  function handleVerdict(v, source, box, shown) {
    lastShown = shown;
    showVerdict(box, v);
    logVerdict(v, source);
  }

  // Re-render the last verdict after a language/city change. The decision is
  // recomputed from its stored INPUT (label+confidence / material) under the
  // new preferences — and NOT logged again.
  function rerenderLast() {
    if (!lastShown) return;
    var box = $(lastShown.box);
    if (lastShown.kind === 'photo') {
      showVerdict(box, R.fromLabel(lastShown.label, lastShown.confidence, condition(), opts()));
    } else if (lastShown.kind === 'manual') {
      showVerdict(box, R.fromMaterial(lastShown.material, condition(), opts()));
    } else if (lastShown.kind === 'modeldown') {
      renderModelDown(box);
    }
  }

  // --- Photo classification ---------------------------------------------------
  // Model-outage path (comité interne m-4): the verdict is SHOWN but NOT
  // journaled. A model that failed to load is not a sorting decision; logging
  // an "uncertain" for every attempted photo polluted the impact journal and
  // its uncertain rate with infrastructure failures.
  function renderModelDown(box) {
    var v = R.fromLabel('', null, condition(), opts());
    showVerdict(box, v);
    box.insertAdjacentHTML('beforeend',
      '<p><strong>' + t().noteLabel + '</strong>' + t().modelDownNote + '</p>');
  }
  function showModelDownVerdict() {
    lastShown = { kind: 'modeldown', box: 'verdict' };
    renderModelDown($('verdict'));
  }

  function classifyImage(img) {
    if (!model) { showModelDownVerdict(); return; }
    $('verdict').hidden = false;
    $('verdict').className = 'verdict uncertain';
    $('verdict').innerHTML = '<p>' + t().classifying + '</p>';
    model.classify(img).then(function (preds) {
      var top = preds && preds[0];
      if (!top) { showModelDownVerdict(); return; }
      handleVerdict(
        R.fromLabel(top.className, top.probability, condition(), opts()),
        'photo', $('verdict'),
        { kind: 'photo', label: top.className, confidence: top.probability, box: 'verdict' });
    }).catch(function () {
      showModelDownVerdict();
    });
  }

  function setPreview(src, onReady) {
    var img = $('preview');
    var retried = false;
    img.onload = function () { currentImg = img; if (onReady) onReady(img); };
    img.onerror = function () {
      // One retry with a cache-buster: a single transient network failure
      // must not silently kill the classification (seen on slow networks).
      if (retried) return;
      retried = true;
      setTimeout(function () { img.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'retry=1'; }, 1500);
    };
    img.src = src;
    img.hidden = false;
  }

  // --- Internationalization / preferences ------------------------------------
  function applyI18n() {
    var s = t();
    document.documentElement.lang = lang;
    document.title = s.docTitle;
    $('tagline').textContent = s.tagline;
    $('city-label').textContent = s.cityLabel;
    $('city-select').value = city;
    $('lang-fr').classList.toggle('active', lang === 'fr');
    $('lang-en').classList.toggle('active', lang === 'en');
    $('impact-title').textContent = s.impactTitle;
    $('stat-total-label').textContent = s.statTotal;
    $('stat-recycling-label').textContent = s.statRecycling;
    $('stat-compost-label').textContent = s.statCompost;
    $('stat-garbage-label').textContent = s.statGarbage;
    $('stat-ecocentre-label').textContent = s.statEcocentre;
    $('stat-uncertain-label').textContent = s.statUncertain;
    $('export-btn').textContent = s.exportBtn;
    $('reset-btn').textContent = s.resetBtn;
    $('impact-note').textContent = s.impactNote;
    $('photo-title').textContent = s.photoTitle;
    $('photo-btn-label').textContent = s.photoBtn;
    $('preview').alt = s.previewAlt;
    $('condition-title').textContent = s.conditionTitle;
    $('cond-clean-label').textContent = s.condClean;
    $('cond-soiled-label').textContent = s.condSoiled;
    $('cond-broken-label').textContent = s.condBroken;
    $('condition-note').textContent = s.conditionNote;
    $('manual-title').textContent = s.manualTitle;
    $('material-btn').textContent = s.materialBtn;
    $('footer-text').textContent = s.footer;
    if (modelState === 'loading') $('model-status').textContent = s.modelLoading;
    else if (modelState === 'ready') $('model-status').textContent = s.modelReady;
    else if (modelState === 'failed') $('model-status').textContent = s.modelFailed;
    else $('model-status').textContent = s.modelUnavailable;
    // Material picker options come from the same engine the tests cover.
    var sel = $('material-select');
    var current = sel.value;
    sel.innerHTML = '';
    R.MATERIALS.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m; opt.textContent = s.materials[m] || m;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
    // Sample captions.
    document.querySelectorAll('#samples figcaption').forEach(function (cap, i) {
      cap.textContent = s.tryPrefix + (s.samples[i] || '');
    });
    document.querySelectorAll('#samples img').forEach(function (img, i) {
      img.alt = s.samples[i] || img.alt;
    });
    renderStats();
  }

  function setLang(newLang) {
    if (newLang === lang) return;
    lang = newLang; persist(); applyI18n(); rerenderLast();
  }
  function setCity(newCity) {
    if (R.CITY_KEYS.indexOf(newCity) < 0 || newCity === city) return;
    city = newCity; persist(); applyI18n(); rerenderLast();
  }

  // --- Wiring ---------------------------------------------------------------
  function init() {
    $('lang-fr').addEventListener('click', function () { setLang('fr'); });
    $('lang-en').addEventListener('click', function () { setLang('en'); });
    $('city-select').addEventListener('change', function () { setCity(this.value); });

    $('material-btn').addEventListener('click', function () {
      var material = $('material-select').value;
      var v = R.fromMaterial(material, condition(), opts());
      handleVerdict(v, 'manual', $('manual-verdict'),
        { kind: 'manual', material: material, box: 'manual-verdict' });
    });

    $('photo-input').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      setPreview(URL.createObjectURL(file), classifyImage);
    });

    // Changing the condition re-runs the last photo: condition changes answers.
    document.querySelectorAll('input[name="condition"]').forEach(function (radio) {
      radio.addEventListener('change', function () { if (currentImg) classifyImage(currentImg); });
    });

    // Sample photos (AI-generated by the team, see samples/CREDITS.md).
    var box = $('samples');
    SAMPLE_FILES.forEach(function (file, i) {
      var fig = document.createElement('figure');
      var img = document.createElement('img');
      img.src = file; img.alt = t().samples[i]; img.crossOrigin = 'anonymous';
      img.onerror = function () { fig.remove(); };
      img.addEventListener('click', function () { setPreview(file, classifyImage); });
      var cap = document.createElement('figcaption'); cap.textContent = t().tryPrefix + t().samples[i];
      fig.appendChild(img); fig.appendChild(cap); box.appendChild(fig);
    });

    $('export-btn').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(loadJournal(), null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'triclair-journal.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $('reset-btn').addEventListener('click', function () {
      localStorage.removeItem(JOURNAL_KEY);
      renderStats([]);
    });

    applyI18n();

    // Demo mode: #demo-<sample-index>-<condition> auto-runs one sample once
    // the model is ready (used for the demo video and reproducible judging).
    var demo = /^#demo-(\d)-(clean|soiled|broken)$/.exec(location.hash || '');
    if (demo) {
      var radio = document.querySelector('input[name="condition"][value="' + demo[2] + '"]');
      if (radio) radio.checked = true;
      var checkReady = setInterval(function () {
        if (model) {
          clearInterval(checkReady);
          var fig = document.querySelectorAll('#samples figure')[+demo[1]];
          if (fig) setPreview(SAMPLE_FILES[+demo[1]], classifyImage);
        }
      }, 500);
    }

    // Load MobileNet from the vendored copy + local weights (see vendor/ and
    // model/ in the repo): fully self-contained, no CDN, works offline.
    // version + alpha are REQUIRED alongside modelUrl: @tensorflow-models/
    // mobilenet 2.1.1 calls config.version.toFixed() before it ever looks at
    // modelUrl (verified in the vendored source + live run, 2026-10-28).
    if (window.mobilenet) {
      window.mobilenet.load({ version: 2, alpha: 1.0, modelUrl: 'model/model.json' }).then(function (m) {
        model = m;
        modelState = 'ready';
        $('model-status').textContent = t().modelReady;
      }).catch(function (err) {
        if (window.console) console.error('TriClair model load failed:', err);
        modelState = 'failed';
        $('model-status').textContent = t().modelFailed;
      });
    } else {
      modelState = 'unavailable';
      $('model-status').textContent = t().modelUnavailable;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
