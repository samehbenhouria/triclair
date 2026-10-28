'use strict';
/* TriClair UI: photo classification (MobileNet, in-browser) + manual picker
 * + impact journal in localStorage. Rules live in rules.js (window.TriRules). */
(function () {
  var R = window.TriRules;
  var JOURNAL_KEY = 'triclair.journal.v1';
  var SAMPLES = [
    { file: 'samples/plastic-bottle.jpg', caption: 'Plastic bottle' },
    { file: 'samples/pizza.jpg', caption: 'Pizza (box)' },
    { file: 'samples/banana.jpg', caption: 'Banana' },
    { file: 'samples/cell-phone.jpg', caption: 'Cell phone' },
    { file: 'samples/unknown.jpg', caption: 'Unknown object' }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var model = null;
  var currentImg = null;

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
      ts: new Date().toISOString(), source: source,
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
  function showVerdict(box, v, heading) {
    box.hidden = false;
    box.className = 'verdict ' + v.bin;
    var conf = (typeof v.confidence === 'number')
      ? '<p>Model confidence: <strong>' + Math.round(v.confidence * 100) + '%</strong>' +
        (v.label ? ' — recognized as “' + v.label + '”' : '') + '</p>' : '';
    box.innerHTML = '<h3>' + heading + ': ' + v.binLabel + '</h3>' + conf +
      (v.itemName ? '<p><strong>Item:</strong> ' + v.itemName + '</p>' : '') +
      '<p>' + v.rule + '</p>';
  }

  function handleVerdict(v, source) {
    showVerdict($('verdict'), v, v.status === 'uncertain' ? '🤔 Not sure' : '➡️ Verdict');
    logVerdict(v, source);
  }

  // --- Photo classification ---------------------------------------------------
  function classifyImage(img) {
    if (!model) {
      handleVerdict(R.fromLabel('', null, condition()), 'photo');
      $('verdict').insertAdjacentHTML('beforeend',
        '<p><strong>Note:</strong> the photo model is unavailable (offline?). ' +
        'The manual picker below works without it.</p>');
      return;
    }
    $('verdict').hidden = false;
    $('verdict').className = 'verdict uncertain';
    $('verdict').innerHTML = '<p>Classifying…</p>';
    model.classify(img).then(function (preds) {
      var top = preds && preds[0];
      var v = top
        ? R.fromLabel(top.className, top.probability, condition())
        : R.fromLabel('', null, condition());
      handleVerdict(v, 'photo');
    }).catch(function () {
      handleVerdict(R.fromLabel('', null, condition()), 'photo');
    });
  }

  function setPreview(src, onReady) {
    var img = $('preview');
    img.onload = function () { currentImg = img; if (onReady) onReady(img); };
    img.src = src;
    img.hidden = false;
  }

  // --- Wiring ---------------------------------------------------------------
  function init() {
    // Manual material picker options come from the same engine the tests cover.
    var sel = $('material-select');
    R.MATERIALS.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m; opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
      sel.appendChild(opt);
    });
    $('material-btn').addEventListener('click', function () {
      var v = R.fromMaterial(sel.value, condition());
      showVerdict($('manual-verdict'), v, v.status === 'uncertain' ? '🤔 Not sure' : '➡️ Verdict');
      logVerdict(v, 'manual');
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

    // Sample photos ( Wikimedia Commons, see samples/CREDITS.md ).
    var box = $('samples');
    SAMPLES.forEach(function (s) {
      var fig = document.createElement('figure');
      var img = document.createElement('img');
      img.src = s.file; img.alt = s.caption; img.crossOrigin = 'anonymous';
      img.onerror = function () { fig.remove(); };
      img.addEventListener('click', function () { setPreview(s.file, classifyImage); });
      var cap = document.createElement('figcaption'); cap.textContent = 'Try: ' + s.caption;
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

    renderStats();

    // Load MobileNet (global `mobilenet` from the pinned CDN script tags).
    if (window.mobilenet) {
      window.mobilenet.load().then(function (m) {
        model = m;
        $('model-status').textContent = 'Photo model ready — everything runs on your device.';
      }).catch(function () {
        $('model-status').textContent = 'Photo model failed to load (offline?). Manual picker still works.';
      });
    } else {
      $('model-status').textContent = 'Photo model unavailable (CDN offline?). Manual picker still works.';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
