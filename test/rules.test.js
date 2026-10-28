'use strict';
/* Plain Node tests for the TriClair rules engine. Run: node test/rules.test.js */
const assert = require('assert');
const R = require('../rules.js');

let n = 0;
function bin(item, cond) { n++; return R.decide(item, cond).bin; }
function eq(actual, expected, msg) { n++; assert.strictEqual(actual, expected, msg); }

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
    n++; assert.ok(v.rule && v.rule.length > 20, key + '/' + cond + ' has a rule');
    n++; assert.strictEqual(v.binLabel, R.BIN_LABELS[v.bin]);
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

console.log('rules.test.js: all ' + n + ' assertions passed.');
