'use strict';
/* Plain Node tests for the TriClair rules engine. Run: node test/rules.test.js */
const assert = require('assert');
const R = require('../rules.js');

let n = 0;
// m-1 (comité interne): each assertion is counted ONCE, by eq()/ok() only.
// The old bin() helper also incremented n, double-counting the 25 verdict
// calls below (the suite self-reported 146 for 121 real assertions).
function bin(item, cond) { return R.decide(item, cond).bin; }
function binC(item, cond, city) { return R.decide(item, cond, { city: city }).bin; }
function eq(actual, expected, msg) { n++; assert.strictEqual(actual, expected, msg); }
function ok(value, msg) { n++; assert.ok(value, msg); }

const CONDS = ['clean', 'soiled', 'broken'];
const VALID_BINS = ['recycling', 'compost', 'garbage', 'ecocentre'];

// --- >=12 item mappings (clean condition, default city = Longueuil) ---
eq(bin('plastic_bottle', 'clean'), 'recycling');
eq(bin('glass_bottle', 'clean'), 'recycling');
eq(bin('metal_can', 'clean'), 'recycling');
eq(bin('cardboard', 'clean'), 'recycling');
eq(bin('paper', 'clean'), 'recycling');
eq(bin('pizza_box', 'clean'), 'recycling');
eq(bin('coffee_cup', 'clean'), 'garbage');
eq(bin('plastic_film', 'clean'), 'garbage');
eq(bin('food_scraps', 'clean'), 'compost');
eq(bin('styrofoam', 'clean'), 'garbage');
eq(bin('electronics', 'clean'), 'ecocentre');
eq(bin('textile', 'clean'), 'ecocentre');

// --- Trap cases, both/all conditions ---
eq(bin('pizza_box', 'soiled'), 'compost', 'greasy pizza box -> compost');
eq(bin('pizza_box', 'clean'), 'recycling', 'clean pizza box -> recycling');
eq(bin('coffee_cup', 'soiled'), 'garbage', 'plastic-lined cup always garbage');
eq(bin('coffee_cup', 'broken'), 'garbage');
eq(bin('plastic_film', 'soiled'), 'garbage', 'film never curbside recycling');
eq(bin('plastic_film', 'broken'), 'garbage');
eq(bin('glass_bottle', 'broken'), 'garbage', 'broken glass -> wrapped garbage (safety)');
eq(bin('glass_bottle', 'soiled'), 'recycling', 'rinsed glass -> recycling');
eq(bin('cardboard', 'soiled'), 'compost', 'soiled cardboard -> compost');
eq(bin('paper', 'soiled'), 'compost', 'soiled paper -> compost');
eq(bin('food_scraps', 'soiled'), 'compost');
eq(bin('electronics', 'broken'), 'ecocentre', 'broken electronics still ecocentre');
eq(bin('styrofoam', 'soiled'), 'garbage');

// --- Every verdict carries a rule and a bin label (default lang = fr) ---
for (const key of Object.keys(R.CITIES.longueuil.items)) {
  for (const cond of CONDS) {
    const v = R.decide(key, cond);
    ok(v.rule && v.rule.length > 20, key + '/' + cond + ' has a rule');
    eq(v.binLabel, R.BIN_LABELS.fr[v.bin], key + '/' + cond + ' bin label matches bin');
  }
}

// --- M-5 (comité interne): the BIN of all 36 item x condition combinations (Longueuil) ---
const EXPECTED_BINS = {
  plastic_bottle: { clean: 'recycling', soiled: 'recycling', broken: 'recycling' },
  glass_bottle:   { clean: 'recycling', soiled: 'recycling', broken: 'garbage' },
  metal_can:      { clean: 'recycling', soiled: 'recycling', broken: 'recycling' },
  cardboard:      { clean: 'recycling', soiled: 'compost',   broken: 'recycling' },
  pizza_box:      { clean: 'recycling', soiled: 'compost',   broken: 'recycling' },
  paper:          { clean: 'recycling', soiled: 'compost',   broken: 'recycling' },
  coffee_cup:     { clean: 'garbage',   soiled: 'garbage',   broken: 'garbage' },
  plastic_film:   { clean: 'garbage',   soiled: 'garbage',   broken: 'garbage' },
  food_scraps:    { clean: 'compost',   soiled: 'compost',   broken: 'compost' },
  styrofoam:      { clean: 'garbage',   soiled: 'garbage',   broken: 'garbage' },
  electronics:    { clean: 'ecocentre', soiled: 'ecocentre', broken: 'ecocentre' },
  textile:        { clean: 'ecocentre', soiled: 'garbage',   broken: 'ecocentre' }
};
for (const key of Object.keys(EXPECTED_BINS)) {
  for (const cond of CONDS) {
    eq(bin(key, cond), EXPECTED_BINS[key][cond], 'M-5 bin ' + key + '/' + cond);
  }
}

// --- Uncertain logic ---
eq(R.fromLabel('toaster', 0.92, 'clean').status, 'uncertain', 'unmapped label -> uncertain');
eq(R.fromLabel('golden retriever', 0.99, 'clean').status, 'uncertain');
eq(R.fromLabel('water bottle', 0.20, 'clean').status, 'uncertain', 'low confidence -> uncertain');
eq(R.fromLabel('water bottle', R.CONFIDENCE_THRESHOLD - 0.01, 'clean').status, 'uncertain');
eq(R.fromLabel('water bottle', R.CONFIDENCE_THRESHOLD, 'clean').status, 'ok', 'at threshold -> ok');
eq(R.fromLabel('water bottle', undefined, 'clean').status, 'uncertain', 'no score -> uncertain');

// --- Photo label mapping ---
eq(R.fromLabel('water bottle', 0.9, 'clean').bin, 'recycling');
eq(R.fromLabel('beer bottle', 0.9, 'clean').bin, 'recycling');
eq(R.fromLabel('beer bottle', 0.9, 'broken').bin, 'garbage');
eq(R.fromLabel('pizza, pizza pie', 0.88, 'soiled').bin, 'compost');
eq(R.fromLabel('banana', 0.95, 'clean').bin, 'compost');
eq(R.fromLabel('cellular telephone, cellular phone, cellphone, cell, mobile phone', 0.9, 'clean').bin, 'ecocentre');
eq(R.fromLabel('plastic bag', 0.9, 'clean').bin, 'garbage');
eq(R.fromLabel('laptop, laptop computer', 0.9, 'broken').bin, 'ecocentre');

// --- Manual material path (same engine) ---
eq(R.fromMaterial('plastic', 'clean').bin, 'recycling');
eq(R.fromMaterial('metal', 'soiled').bin, 'recycling');
eq(R.fromMaterial('glass', 'broken').bin, 'garbage');
eq(R.fromMaterial('cardboard', 'soiled').bin, 'compost');
eq(R.fromMaterial('paper', 'clean').bin, 'recycling');
eq(R.fromMaterial('food', 'clean').bin, 'compost');
eq(R.fromMaterial('electronics', 'clean').bin, 'ecocentre');
eq(R.fromMaterial('textile', 'clean').bin, 'ecocentre');
eq(R.fromMaterial('other', 'clean').status, 'uncertain', '"other" material -> uncertain');
eq(R.fromMaterial('nonsense', 'clean').status, 'uncertain');

// --- J4 (jury externe): token-phrase label matching, named edge cases ---
// The jury's exhibits: labels the old substring matcher silently misfiled.
eq(R.itemForLabel('can opener'), null, 'J4: "can opener" is a tool, NOT a metal can');
eq(R.fromLabel('can opener', 0.95, 'clean').status, 'uncertain', 'J4: can opener -> uncertain, never metal_can');
eq(R.itemForLabel('cup'), null, 'J4: bare "cup" says nothing about what cup -> no match');
eq(R.fromLabel('cup', 0.95, 'clean').status, 'uncertain', 'J4: bare cup -> uncertain');
eq(R.itemForLabel('measuring cup'), null, 'J4: "measuring cup" is not a coffee cup');
eq(R.itemForLabel('crate'), null, 'J4: a crate is a reusable container, NOT cardboard');
eq(R.itemForLabel('vase'), null, 'J4: a vase is not a glass bottle (ceramics/table glass refused in blue bin)');
eq(R.itemForLabel('wine glass'), null, 'J4: table glass is not container glass -> no match');
eq(R.itemForLabel('beer glass'), null, 'J4: table glass is not container glass -> no match');
eq(R.itemForLabel('goblet'), null, 'J4: a goblet is table glass, not a bottle');
// Kept on purpose, with the justification written in rules.js:
// a take-out coffee photo classifies as one of these, and both paper cup
// and discarded ceramic mug land in Longueuil's grey bin.
eq(R.itemForLabel('coffee mug'), 'coffee_cup', 'J4 kept: coffee mug -> coffee_cup (grey bin either way in Longueuil)');
eq(R.itemForLabel('espresso'), 'coffee_cup', 'J4 kept: espresso -> coffee_cup');
// Token boundaries: no firing on substrings inside a longer token.
eq(R.itemForLabel('pineapple, ananas'), 'food_scraps', 'J4: "pineapple" matches as a token, not via "apple"');
eq(R.itemForLabel('candle'), null, 'J4: "candle" contains no rule token ("can" is not a rule)');
// Positive controls: the mappings that must keep working.
eq(R.itemForLabel('beer bottle'), 'glass_bottle', 'J4 control: beer bottle -> glass');
eq(R.itemForLabel('wine bottle'), 'glass_bottle', 'J4 control: wine bottle -> glass');
eq(R.itemForLabel('water bottle'), 'plastic_bottle', 'J4 control: water bottle -> plastic');
eq(R.itemForLabel('tin can'), 'metal_can', 'J4 control: tin can -> metal');
eq(R.itemForLabel('pop can'), 'metal_can', 'J4 control: pop can -> metal');
eq(R.itemForLabel('carton'), 'cardboard', 'J4 control: carton -> cardboard');
eq(R.itemForLabel('plastic bag'), 'plastic_film', 'J4 control: plastic bag -> film');
eq(R.itemForLabel('cellular telephone, cellular phone, cellphone, cell, mobile phone'), 'electronics',
   'J4 control: multi-segment phone label -> electronics');

// ===========================================================================
// Phase B (jury externe J2 + J3): bilingual engine + per-city datasets.
// ===========================================================================

// --- B0: exactly two cities, 12 items each ---
eq(R.CITY_KEYS.length, 2, 'B0: two cities');
eq(Object.keys(R.CITIES.longueuil.items).length, 12, 'B0: Longueuil has 12 items');
eq(Object.keys(R.CITIES.montreal.items).length, 12, 'B0: Montréal has 12 items');
eq(R.DEFAULT_CITY, 'longueuil', 'B0: default city is Longueuil');
eq(R.DEFAULT_LANG, 'fr', 'B0: default language is French');

// --- B1: every rule exists in fr AND en, for both cities; bins are valid ---
for (const cityKey of R.CITY_KEYS) {
  const items = R.CITIES[cityKey].items;
  for (const key of Object.keys(items)) {
    const item = items[key];
    ok(item.name.fr && item.name.fr.length > 2, cityKey + '/' + key + ' has a French name');
    ok(item.name.en && item.name.en.length > 2, cityKey + '/' + key + ' has an English name');
    for (const cond of CONDS) {
      const entry = item[cond];
      ok(entry.fr && entry.fr.length > 20, cityKey + '/' + key + '/' + cond + ' has a French rule');
      ok(entry.en && entry.en.length > 20, cityKey + '/' + key + '/' + cond + ' has an English rule');
      ok(VALID_BINS.indexOf(entry.bin) >= 0, cityKey + '/' + key + '/' + cond + ' bin is valid');
      // decide() must serve exactly the stored texts, per language.
      eq(R.decide(key, cond, { city: cityKey, lang: 'fr' }).rule, entry.fr,
         cityKey + '/' + key + '/' + cond + ' decide(fr) serves the French rule');
      eq(R.decide(key, cond, { city: cityKey, lang: 'en' }).rule, entry.en,
         cityKey + '/' + key + '/' + cond + ' decide(en) serves the English rule');
    }
  }
}

// --- B2: defaults are French + Longueuil, proven against the data ---
{
  const v = R.decide('plastic_bottle', 'clean');
  eq(v.rule, R.CITIES.longueuil.items.plastic_bottle.clean.fr, 'B2: no opts -> French rule');
  eq(v.binLabel, R.BIN_LABELS.fr.recycling, 'B2: no opts -> French bin label');
  eq(v.itemName, 'Bouteille de plastique', 'B2: no opts -> French item name');
  eq(v.city, 'longueuil', 'B2: no opts -> Longueuil');
  eq(v.lang, 'fr', 'B2: no opts -> fr');
}
// English Longueuil texts are the shipped 2026-10-28 wording, verbatim.
eq(R.decide('plastic_bottle', 'clean', { lang: 'en' }).rule,
   'Rigid plastic containers go in the blue bin in Longueuil. Empty it, rinse lightly, keep the cap on.',
   'B2: shipped EN text preserved verbatim');
eq(R.decide('coffee_cup', 'clean', { lang: 'en' }).rule,
   'TRAP: take-out coffee cups are lined with plastic, so they are NOT recyclable paper and NOT compostable in Longueuil. Grey bin. (The plastic lid alone, rinsed, can go in the blue bin.)',
   'B2: shipped EN trap text preserved verbatim');
ok(R.fromLabel('water bottle', 0.20, 'clean', { lang: 'en' }).rule
     .indexOf('The photo model is not confident enough (20% < 35%).') >= 0,
   'B2: shipped EN low-confidence wording preserved');
ok(R.fromLabel('water bottle', 0.20, 'clean', { lang: 'fr' }).rule
     .indexOf('Le modèle photo n\'est pas assez confiant (20 % < 35 %).') >= 0,
   'B2: FR low-confidence wording present');

// --- B3: the BIN of all 36 item x condition combinations (Montréal) ---
const EXPECTED_BINS_MTL = {
  plastic_bottle: { clean: 'recycling', soiled: 'recycling', broken: 'recycling' },
  glass_bottle:   { clean: 'recycling', soiled: 'recycling', broken: 'garbage' },
  metal_can:      { clean: 'recycling', soiled: 'recycling', broken: 'recycling' },
  cardboard:      { clean: 'recycling', soiled: 'compost',   broken: 'recycling' },
  pizza_box:      { clean: 'recycling', soiled: 'compost',   broken: 'recycling' },
  paper:          { clean: 'recycling', soiled: 'compost',   broken: 'recycling' },
  coffee_cup:     { clean: 'recycling', soiled: 'recycling', broken: 'recycling' },
  plastic_film:   { clean: 'recycling', soiled: 'garbage',   broken: 'recycling' },
  food_scraps:    { clean: 'compost',   soiled: 'compost',   broken: 'compost' },
  styrofoam:      { clean: 'recycling', soiled: 'garbage',   broken: 'garbage' },
  electronics:    { clean: 'ecocentre', soiled: 'ecocentre', broken: 'ecocentre' },
  textile:        { clean: 'ecocentre', soiled: 'garbage',   broken: 'ecocentre' }
};
for (const key of Object.keys(EXPECTED_BINS_MTL)) {
  for (const cond of CONDS) {
    eq(binC(key, cond, 'montreal'), EXPECTED_BINS_MTL[key][cond], 'B3 MTL bin ' + key + '/' + cond);
  }
}

// --- B4: the documented city differences, named one by one (jury J3) ---
// Coffee cup: recycling in Montréal, garbage in Longueuil (all states).
eq(binC('coffee_cup', 'clean', 'montreal'), 'recycling', 'B4: MTL coffee cup clean -> recycling');
eq(binC('coffee_cup', 'soiled', 'montreal'), 'recycling', 'B4: MTL coffee cup soiled -> recycling');
eq(binC('coffee_cup', 'broken', 'montreal'), 'recycling', 'B4: MTL coffee cup broken -> recycling');
eq(binC('coffee_cup', 'clean', 'longueuil'), 'garbage', 'B4: LG coffee cup clean -> garbage');
// Plastic film/bags: accepted in Montréal (montreal.ca accepted list).
eq(binC('plastic_film', 'clean', 'montreal'), 'recycling', 'B4: MTL film clean -> recycling');
eq(binC('plastic_film', 'broken', 'montreal'), 'recycling', 'B4: MTL film broken -> recycling');
eq(binC('plastic_film', 'soiled', 'montreal'), 'garbage', 'B4: MTL film soiled -> garbage (cannot be sorted)');
eq(binC('plastic_film', 'clean', 'longueuil'), 'garbage', 'B4: LG film clean -> garbage');
// Styrofoam: food trays accepted in Montréal; soiled/crumbling refused.
eq(binC('styrofoam', 'clean', 'montreal'), 'recycling', 'B4: MTL styrofoam food tray clean -> recycling');
eq(binC('styrofoam', 'soiled', 'montreal'), 'garbage', 'B4: MTL styrofoam soiled -> garbage');
eq(binC('styrofoam', 'broken', 'montreal'), 'garbage', 'B4: MTL styrofoam broken (beads) -> garbage');
eq(binC('styrofoam', 'clean', 'longueuil'), 'garbage', 'B4: LG styrofoam clean -> garbage');

// --- B5: no cross-city contamination in rule texts ---
// A Montréal user must never be told a rule "in Longueuil", and vice versa.
for (const cityKey of R.CITY_KEYS) {
  const otherName = cityKey === 'montreal' ? 'Longueuil' : 'Montréal';
  const items = R.CITIES[cityKey].items;
  for (const key of Object.keys(items)) {
    for (const cond of CONDS) {
      ok(items[key][cond].fr.indexOf(otherName) < 0,
         'B5: ' + cityKey + '/' + key + '/' + cond + ' FR text names no other city');
      ok(items[key][cond].en.indexOf(otherName) < 0,
         'B5: ' + cityKey + '/' + key + '/' + cond + ' EN text names no other city');
    }
  }
}

// --- B6: opts flow through the photo and manual paths ---
eq(R.fromLabel('plastic bag', 0.9, 'clean', { city: 'montreal', lang: 'en' }).bin, 'recycling',
   'B6: photo path, Montréal: plastic bag -> recycling');
eq(R.fromLabel('plastic bag', 0.9, 'clean', { city: 'longueuil', lang: 'en' }).bin, 'garbage',
   'B6: photo path, Longueuil: plastic bag -> garbage');
eq(R.fromLabel('coffee mug', 0.9, 'clean', { city: 'montreal' }).bin, 'recycling',
   'B6: photo path, Montréal: coffee mug -> recycling');
eq(R.fromLabel('coffee mug', 0.9, 'clean', { city: 'longueuil' }).bin, 'garbage',
   'B6: photo path, Longueuil: coffee mug -> garbage');
eq(R.fromMaterial('plastic', 'clean', { city: 'montreal', lang: 'en' }).bin, 'recycling',
   'B6: manual path honours the city option');
ok(R.fromLabel('toaster', 0.9, 'clean', { city: 'montreal', lang: 'fr' }).rule.indexOf('Montréal') >= 0,
   'B6: FR uncertain text names the selected city (Montréal)');
ok(R.fromLabel('toaster', 0.9, 'clean', { city: 'longueuil', lang: 'en' }).rule.indexOf('Longueuil') >= 0,
   'B6: EN uncertain text names the selected city (Longueuil)');
eq(R.fromMaterial('other', 'clean', { city: 'montreal' }).status, 'uncertain',
   'B6: "other" material stays uncertain in Montréal too');
eq(R.decide('plastic_bottle', 'clean', { lang: 'en' }).itemName, 'Plastic bottle',
   'B6: EN item name served');
eq(R.decide('plastic_bottle', 'clean', { lang: 'fr' }).itemName, 'Bouteille de plastique',
   'B6: FR item name served');
// Unknown city/lang fall back to the defaults instead of crashing.
eq(R.decide('plastic_bottle', 'clean', { city: 'nowhere', lang: 'xx' }).city, 'longueuil',
   'B6: unknown city falls back to Longueuil');
eq(R.decide('plastic_bottle', 'clean', { city: 'nowhere', lang: 'xx' }).lang, 'fr',
   'B6: unknown lang falls back to French');

console.log('rules.test.js: all ' + n + ' assertions passed.');
