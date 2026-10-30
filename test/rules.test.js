'use strict';
/* Plain Node tests for the TriClair rules engine. Run: node test/rules.test.js */
const assert = require('assert');
const R = require('../rules.js');

let n = 0;
// m-1 (comité interne): each assertion is counted ONCE, by eq()/ok() only.
// The old bin() helper also incremented n, double-counting the 25 verdict
// calls below (the suite self-reported 146 for 121 real assertions).
function bin(item, cond) { return R.decide(item, cond).bin; }
function eq(actual, expected, msg) { n++; assert.strictEqual(actual, expected, msg); }
function ok(value, msg) { n++; assert.ok(value, msg); }

// --- >=12 item mappings (clean condition) ---
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

// --- Every verdict carries a rule and a bin label ---
for (const key of Object.keys(R.ITEMS)) {
  for (const cond of ['clean', 'soiled', 'broken']) {
    const v = R.decide(key, cond);
    ok(v.rule && v.rule.length > 20, key + '/' + cond + ' has a rule');
    eq(v.binLabel, R.BIN_LABELS[v.bin], key + '/' + cond + ' bin label matches bin');
  }
}

// --- M-5 (comité interne): the BIN of all 36 item x condition combinations ---
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
  for (const cond of ['clean', 'soiled', 'broken']) {
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

console.log('rules.test.js: all ' + n + ' assertions passed.');
