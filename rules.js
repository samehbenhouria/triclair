/*
 * TriClair rules engine — pure JS, no dependencies.
 * Longueuil / Montréal-area curbside rules, simplified and sourced in README.md.
 * Works in the browser (window.TriRules) and in Node (module.exports) for tests.
 */
(function (global) {
  'use strict';

  var CONFIDENCE_THRESHOLD = 0.35;

  var BIN_LABELS = {
    recycling: 'Blue bin — Recycling',
    compost: 'Brown bin — Compost',
    garbage: 'Grey bin — Garbage',
    ecocentre: 'Ecocentre — Drop-off',
    uncertain: 'Uncertain — Do not guess'
  };

  // Each item: per-condition [bin, rule]. Missing condition falls back to "clean".
  var ITEMS = {
    plastic_bottle: {
      name: 'Plastic bottle',
      clean:  ['recycling', 'Rigid plastic containers go in the blue bin in Longueuil. Empty it, rinse lightly, keep the cap on.'],
      soiled: ['recycling', 'Empty and rinse it: a rinsed plastic bottle is accepted in the blue bin. Food residue left inside can get it rejected at sorting.'],
      broken: ['recycling', 'Broken rigid plastic is still recyclable in the blue bin, as long as the pieces are not tiny shreds.']
    },
    glass_bottle: {
      name: 'Glass bottle or jar',
      clean:  ['recycling', 'Glass bottles and jars go in the blue bin in Longueuil. Rinse and remove lids (metal lids go in loose).'],
      soiled: ['recycling', 'Rinse it first: clean glass is accepted in the blue bin.'],
      broken: ['garbage', 'SAFETY: broken glass does NOT go loose in the blue bin — it injures sorting workers. Wrap it in newspaper or a sealed box, label it "broken glass", and put it in the grey bin.']
    },
    metal_can: {
      name: 'Metal can or container',
      clean:  ['recycling', 'Metal cans and aluminum containers go in the blue bin. Rinse lightly.'],
      soiled: ['recycling', 'Empty and rinse it: metal is accepted in the blue bin once food residue is removed.'],
      broken: ['recycling', 'Crushed or dented metal cans are still accepted in the blue bin. Watch sharp edges.']
    },
    cardboard: {
      name: 'Cardboard box',
      clean:  ['recycling', 'Clean, dry cardboard goes in the blue bin. Flatten the box so it fits.'],
      soiled: ['compost', 'Grease- or food-soiled cardboard cannot be recycled — the fibres are ruined. Longueuil accepts it in the brown compost bin, torn into pieces.'],
      broken: ['recycling', 'Torn or flattened cardboard is fine in the blue bin, as long as it is clean and dry.']
    },
    pizza_box: {
      name: 'Pizza box',
      clean:  ['recycling', 'A clean, grease-free pizza box is cardboard: flatten it into the blue bin. (Most real pizza boxes are NOT this clean — check for grease.)'],
      soiled: ['compost', 'TRAP: a grease-soiled pizza box contaminates recycled paper. In Longueuil it goes in the brown compost bin, torn up. Tear off any clean lid part for the blue bin.'],
      broken: ['recycling', 'Torn-up pizza box pieces follow the grease rule: clean pieces to the blue bin. If the pieces are greasy, use compost instead.']
    },
    paper: {
      name: 'Paper (sheets, newspaper, magazine)',
      clean:  ['recycling', 'Clean paper and newspaper go in the blue bin. Keep them dry.'],
      soiled: ['compost', 'Food-soiled paper (napkins, paper towels, greasy sheets) cannot be recycled. Longueuil accepts it in the brown compost bin.'],
      broken: ['recycling', 'Shredded or torn clean paper still goes in the blue bin in Longueuil (bag shreds in a paper bag so they do not scatter).']
    },
    coffee_cup: {
      name: 'Paper coffee cup',
      clean:  ['garbage', 'TRAP: take-out coffee cups are lined with plastic, so they are NOT recyclable paper and NOT compostable in Longueuil. Grey bin. (The plastic lid alone, rinsed, can go in the blue bin.)'],
      soiled: ['garbage', 'Plastic-lined coffee cups go in the grey bin in Longueuil, clean or not.'],
      broken: ['garbage', 'Plastic-lined coffee cups go in the grey bin in Longueuil, in any state.']
    },
    plastic_film: {
      name: 'Plastic film, bag or wrap',
      clean:  ['garbage', 'TRAP: soft plastic film and bags jam sorting machines and are refused in Longueuil curbside recycling, even clean. Grey bin — or use a store film-recycling drop-off where offered.'],
      soiled: ['garbage', 'Plastic film and bags are not accepted in the blue bin in Longueuil. Grey bin.'],
      broken: ['garbage', 'Plastic film and bags are not accepted in the blue bin in Longueuil. Grey bin.']
    },
    food_scraps: {
      name: 'Food scraps / fruit / produce',
      clean:  ['compost', 'Food scraps go in the brown compost bin in Longueuil — never in the garbage if you can avoid it. Remove stickers and packaging first.'],
      soiled: ['compost', 'Food is compost: brown bin. "Soiled" is its normal state.'],
      broken: ['compost', 'Food scraps in any state go in the brown compost bin.']
    },
    styrofoam: {
      name: 'Styrofoam (expanded polystyrene)',
      clean:  ['garbage', 'Styrofoam packaging and trays are not accepted in Longueuil curbside recycling. Grey bin (some ecocentres take clean blocks — check before a special trip).'],
      soiled: ['garbage', 'Styrofoam food trays are not recyclable curbside in Longueuil. Grey bin.'],
      broken: ['garbage', 'Broken styrofoam still goes in the grey bin; bag small beads so they do not blow away.']
    },
    electronics: {
      name: 'Electronics / phone / battery',
      clean:  ['ecocentre', 'Electronics, phones and batteries never go in any curbside bin — they contain hazardous materials and valuable metals. Take them to an ecocentre or an official e-waste drop-off (e.g. Electrobac / retailer take-back).'],
      soiled: ['ecocentre', 'Electronics and batteries go to an ecocentre or official e-waste drop-off, whatever their state.'],
      broken: ['ecocentre', 'Broken electronics and swollen/damaged batteries are hazardous: ecocentre only, ideally in a sealed non-metal container. Never the grey bin.']
    },
    textile: {
      name: 'Clothing / textile',
      clean:  ['ecocentre', 'Wearable clothing should be donated (drop-off bins, charities). Worn-out textiles go to an ecocentre textile drop-off — never the blue bin.'],
      soiled: ['garbage', 'Heavily soiled or mouldy textiles cannot be donated or recycled: grey bin. Lightly used items: wash and donate instead.'],
      broken: ['ecocentre', 'Torn textiles are accepted at ecocentre textile drop-offs for fibre recycling. Not the blue bin.']
    }
  };

  // Manual material picker -> item key.
  var MATERIAL_TO_ITEM = {
    plastic: 'plastic_bottle',
    metal: 'metal_can',
    glass: 'glass_bottle',
    paper: 'paper',
    cardboard: 'cardboard',
    food: 'food_scraps',
    electronics: 'electronics',
    textile: 'textile',
    other: null
  };

  // MobileNet / ImageNet label -> item key.
  //
  // TOKEN-PHRASE matching with boundaries (jury externe pass 1, J4 — this
  // replaced raw substring matching on 2026-10-30). A rule phrase matches
  // only when its full token sequence appears contiguously inside ONE
  // comma-separated segment of the label. Substring matching silently
  // misfiled real labels: 'cup' fired inside unrelated words, 'can opener'
  // was filed as a metal can, 'crate' as a cardboard box, 'vase' as a glass
  // bottle. In doubt there is NO match, and the photo path answers
  // "uncertain" — that refusal is the product's core promise.
  //
  // Deliberate NON-matches (each reviewed case by case, jury J4):
  // - 'can opener' (NO_MATCH_LABELS below): a durable kitchen tool, not a
  //   can. Filing it as metal_can was the jury's exhibit A.
  // - bare 'cup' and 'measuring cup': "cup" alone does not say WHAT cup.
  //   'coffee mug' and 'espresso' ARE kept -> coffee_cup: a take-out coffee
  //   photo classifies as one of those, and both a plastic-lined paper cup
  //   and a discarded ceramic mug land in Longueuil's grey bin (neither is
  //   blue-bin material), so the bin is right either way.
  // - 'beer glass', 'wine glass', 'goblet', 'vase': table glass and vases
  //   are NOT container glass. Longueuil and Montréal accept only glass
  //   bottles and jars in the blue bin; table glass/ceramics have a
  //   different melting point and are refused. No match -> uncertain, and
  //   the manual glass picker lets the user say "bottle/jar" explicitly.
  // - 'crate': a reusable wood/plastic container, not a cardboard box.
  var NO_MATCH_LABELS = ['can opener'];

  var LABEL_RULES = [
    ['beer bottle', 'glass_bottle'], ['wine bottle', 'glass_bottle'],
    ['water bottle', 'plastic_bottle'], ['pop bottle', 'plastic_bottle'],
    ['soda bottle', 'plastic_bottle'], ['pill bottle', 'plastic_bottle'],
    ['plastic bottle', 'plastic_bottle'], ['bottle', 'plastic_bottle'],
    ['pizza', 'pizza_box'],
    ['coffee cup', 'coffee_cup'], ['espresso', 'coffee_cup'],
    ['coffee mug', 'coffee_cup'],
    ['plastic bag', 'plastic_film'], ['shopping bag', 'plastic_film'],
    ['banana', 'food_scraps'], ['orange', 'food_scraps'], ['lemon', 'food_scraps'],
    ['granny smith', 'food_scraps'], ['apple', 'food_scraps'], ['fig', 'food_scraps'],
    ['pineapple', 'food_scraps'], ['ananas', 'food_scraps'], ['strawberry', 'food_scraps'],
    ['cucumber', 'food_scraps'], ['mushroom', 'food_scraps'], ['broccoli', 'food_scraps'],
    ['cauliflower', 'food_scraps'], ['zucchini', 'food_scraps'], ['courgette', 'food_scraps'],
    ['cellular telephone', 'electronics'], ['cellphone', 'electronics'],
    ['mobile phone', 'electronics'], ['laptop', 'electronics'],
    ['notebook computer', 'electronics'], ['ipod', 'electronics'],
    ['remote control', 'electronics'], ['computer mouse', 'electronics'],
    ['computer keyboard', 'electronics'], ['hand-held computer', 'electronics'],
    ['tin can', 'metal_can'], ['pop can', 'metal_can'],
    ['carton', 'cardboard'],
    ['comic book', 'paper'], ['book jacket', 'paper'], ['paper towel', 'paper'],
    ['toilet tissue', 'paper'], ['envelope', 'paper'],
    ['jersey', 'textile'], ['t-shirt', 'textile'], ['tee shirt', 'textile'],
    ['sweatshirt', 'textile'], ['sock', 'textile']
  ];

  function normalizeCondition(condition) {
    return (condition === 'soiled' || condition === 'broken') ? condition : 'clean';
  }

  function decide(itemKey, condition) {
    var item = ITEMS[itemKey];
    if (!item) return uncertainVerdict('Unknown item.', null);
    var cond = normalizeCondition(condition);
    var entry = item[cond] || item.clean;
    return {
      status: 'ok', itemKey: itemKey, itemName: item.name, condition: cond,
      bin: entry[0], binLabel: BIN_LABELS[entry[0]], rule: entry[1]
    };
  }

  function uncertainVerdict(reason, confidence) {
    return {
      status: 'uncertain', itemKey: null, itemName: null, condition: null,
      bin: 'uncertain', binLabel: BIN_LABELS.uncertain,
      rule: 'TriClair will not guess: a wrong bin contaminates a whole truckload. ' + reason +
            ' Use the manual material picker below, or check Longueuil\'s waste guide.',
      confidence: (typeof confidence === 'number') ? confidence : null
    };
  }

  function labelTokens(text) {
    return String(text).toLowerCase().split(/[^a-z0-9]+/)
      .filter(function (t) { return t.length > 0; });
  }

  // True when the phrase's token sequence appears contiguously in tokens.
  function phraseInTokens(phraseTokens, tokens) {
    if (!phraseTokens.length || phraseTokens.length > tokens.length) return false;
    for (var i = 0; i + phraseTokens.length <= tokens.length; i++) {
      var ok = true;
      for (var j = 0; j < phraseTokens.length; j++) {
        if (tokens[i + j] !== phraseTokens[j]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  // Pre-tokenized rules and exclusions (label matching is token-based, J4).
  var LABEL_RULE_TOKENS = LABEL_RULES.map(function (r) {
    return { tokens: labelTokens(r[0]), item: r[1] };
  });
  var NO_MATCH_TOKENS = NO_MATCH_LABELS.map(labelTokens);

  function itemForLabel(label) {
    if (!label) return null;
    var segments = String(label).toLowerCase().split(',')
      .map(labelTokens)
      .filter(function (t) { return t.length > 0; });
    if (!segments.length) return null;
    var s, i;
    // Explicit exclusions win over every rule (e.g. 'can opener').
    for (s = 0; s < segments.length; s++) {
      for (i = 0; i < NO_MATCH_TOKENS.length; i++) {
        if (phraseInTokens(NO_MATCH_TOKENS[i], segments[s])) return null;
      }
    }
    // Rules in declared order (specific phrases before generic ones);
    // a phrase must match inside a single label segment, on token boundaries.
    for (i = 0; i < LABEL_RULE_TOKENS.length; i++) {
      for (s = 0; s < segments.length; s++) {
        if (phraseInTokens(LABEL_RULE_TOKENS[i].tokens, segments[s])) {
          return LABEL_RULE_TOKENS[i].item;
        }
      }
    }
    return null;
  }

  // Photo path: MobileNet top label + probability in [0,1].
  function fromLabel(label, confidence, condition) {
    if (typeof confidence !== 'number' || confidence < CONFIDENCE_THRESHOLD) {
      return uncertainVerdict('The photo model is not confident enough (' +
        (typeof confidence === 'number' ? Math.round(confidence * 100) + '%' : 'no score') +
        ' < ' + Math.round(CONFIDENCE_THRESHOLD * 100) + '%).', confidence);
    }
    var itemKey = itemForLabel(label);
    if (!itemKey) {
      return uncertainVerdict('"' + label + '" is not an item TriClair knows how to sort.', confidence);
    }
    var verdict = decide(itemKey, condition);
    verdict.confidence = confidence;
    verdict.label = label;
    return verdict;
  }

  // Manual path: user picks the material directly.
  function fromMaterial(material, condition) {
    var itemKey = MATERIAL_TO_ITEM[material];
    if (!itemKey) {
      return uncertainVerdict('Material "' + material + '" has no single safe answer — it depends on the object.', null);
    }
    var verdict = decide(itemKey, condition);
    verdict.label = 'manual: ' + material;
    return verdict;
  }

  var api = {
    CONFIDENCE_THRESHOLD: CONFIDENCE_THRESHOLD,
    BIN_LABELS: BIN_LABELS,
    ITEMS: ITEMS,
    MATERIALS: Object.keys(MATERIAL_TO_ITEM),
    decide: decide,
    fromLabel: fromLabel,
    fromMaterial: fromMaterial,
    itemForLabel: itemForLabel
  };

  global.TriRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
