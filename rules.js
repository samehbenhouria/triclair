/*
 * TriClair rules engine — pure JS, no dependencies.
 * Per-city curbside rules (Longueuil + Montréal), every rule text in French
 * and English. Works in the browser (window.TriRules) and in Node
 * (module.exports) for tests.
 *
 * Sources (read in full on 2026-10-30, phase B of the improvement pass):
 * - Longueuil: https://longueuil.quebec/fr/collectes and the city's published
 *   collection guides (the dataset shipped on 2026-10-28, kept verbatim in
 *   English; French texts are faithful translations).
 * - Montréal: https://montreal.ca/articles/quoi-mettre-dans-le-bac-des-matieres-recyclables-83068
 *   (accepted: containers, packaging, printed paper — explicitly including
 *   "Sac et pellicule d'emballage" and "Barquette de viande ou de poisson en
 *   polystyrène (styromousse)"; refused in the bin: protective styrofoam
 *   that crumbles into beads, electronics/batteries, textiles, flat glass;
 *   soiled paper/cardboard containers go to the brown bin)
 *   and https://montreal.ca/articles/recuperer-ou-jeter-saint-laurent-peut-vous-aider-58749
 *   (organics: food scraps + soiled paper/cardboard incl. pizza boxes ->
 *   brown bin). Coffee cups in Montréal follow Québec's modernized system
 *   (Éco Entreprises Québec, designated organization since 2025-01-01;
 *   citizen guide https://bacimpact.ca): containers, packaging and printed
 *   paper all go in the recycling bin, with only three exceptions
 *   (aerosols, protective styrofoam, biodegradable plastics). Montréal's
 *   open-data portal (donnees.montreal.ca, "Secteurs Info-collectes"
 *   dataset) publishes collection sectors/schedules only — no materials
 *   list — so montreal.ca above is the materials source.
 *
 * Documented Montréal ≠ Longueuil differences (each traced to the sources):
 * - coffee_cup: recycling in Montréal (garbage in Longueuil).
 * - plastic_film: recycling in Montréal when clean/torn (garbage in
 *   Longueuil, all states).
 * - styrofoam: clean food trays -> recycling in Montréal; soiled or
 *   crumbling -> garbage (garbage in Longueuil, all states).
 */
(function (global) {
  'use strict';

  var CONFIDENCE_THRESHOLD = 0.35;
  var DEFAULT_CITY = 'longueuil';
  var DEFAULT_LANG = 'fr';

  var BIN_LABELS = {
    fr: {
      recycling: 'Bac bleu — Recyclage',
      compost: 'Bac brun — Compost',
      garbage: 'Bac gris — Ordures',
      ecocentre: 'Écocentre — Point de dépôt',
      uncertain: 'Incertain — On ne devine pas'
    },
    en: {
      recycling: 'Blue bin — Recycling',
      compost: 'Brown bin — Compost',
      garbage: 'Grey bin — Garbage',
      ecocentre: 'Ecocentre — Drop-off',
      uncertain: 'Uncertain — Do not guess'
    }
  };

  var CITY_NAMES = {
    longueuil: { fr: 'Longueuil', en: 'Longueuil' },
    montreal: { fr: 'Montréal', en: 'Montréal' }
  };

  // Each item: name {fr,en} + per-condition {bin, fr, en}.
  // Missing condition falls back to "clean".
  var LONGUEUIL_ITEMS = {
    plastic_bottle: {
      name: { fr: 'Bouteille de plastique', en: 'Plastic bottle' },
      clean:  { bin: 'recycling', en: 'Rigid plastic containers go in the blue bin in Longueuil. Empty it, rinse lightly, keep the cap on.', fr: 'Les contenants de plastique rigide vont au bac bleu à Longueuil. Videz-le, rincez légèrement, gardez le capuchon.' },
      soiled: { bin: 'recycling', en: 'Empty and rinse it: a rinsed plastic bottle is accepted in the blue bin. Food residue left inside can get it rejected at sorting.', fr: 'Videz-le et rincez-le : une bouteille de plastique rincée est acceptée au bac bleu. Les résidus alimentaires laissés dedans peuvent la faire rejeter au tri.' },
      broken: { bin: 'recycling', en: 'Broken rigid plastic is still recyclable in the blue bin, as long as the pieces are not tiny shreds.', fr: 'Le plastique rigide brisé reste recyclable au bac bleu, tant que les morceaux ne sont pas de minuscules éclats.' }
    },
    glass_bottle: {
      name: { fr: 'Bouteille ou pot en verre', en: 'Glass bottle or jar' },
      clean:  { bin: 'recycling', en: 'Glass bottles and jars go in the blue bin in Longueuil. Rinse and remove lids (metal lids go in loose).', fr: 'Les bouteilles et pots en verre vont au bac bleu à Longueuil. Rincez et retirez les couvercles (les couvercles en métal vont au bac séparément).' },
      soiled: { bin: 'recycling', en: 'Rinse it first: clean glass is accepted in the blue bin.', fr: 'Rincez-le d\'abord : le verre propre est accepté au bac bleu.' },
      broken: { bin: 'garbage', en: 'SAFETY: broken glass does NOT go loose in the blue bin — it injures sorting workers. Wrap it in newspaper or a sealed box, label it "broken glass", and put it in the grey bin.', fr: 'SÉCURITÉ : le verre brisé ne va JAMAIS en vrac au bac bleu — il blesse les travailleurs du tri. Enveloppez-le dans du papier journal ou une boîte scellée, étiquetez « verre brisé », et mettez-le au bac gris.' }
    },
    metal_can: {
      name: { fr: 'Canette ou contenant en métal', en: 'Metal can or container' },
      clean:  { bin: 'recycling', en: 'Metal cans and aluminum containers go in the blue bin. Rinse lightly.', fr: 'Les canettes et contenants en métal vont au bac bleu. Rincez légèrement.' },
      soiled: { bin: 'recycling', en: 'Empty and rinse it: metal is accepted in the blue bin once food residue is removed.', fr: 'Videz-le et rincez-le : le métal est accepté au bac bleu une fois les résidus alimentaires retirés.' },
      broken: { bin: 'recycling', en: 'Crushed or dented metal cans are still accepted in the blue bin. Watch sharp edges.', fr: 'Les canettes écrasées ou bosselées restent acceptées au bac bleu. Attention aux bords coupants.' }
    },
    cardboard: {
      name: { fr: 'Boîte de carton', en: 'Cardboard box' },
      clean:  { bin: 'recycling', en: 'Clean, dry cardboard goes in the blue bin. Flatten the box so it fits.', fr: 'Le carton propre et sec va au bac bleu. Aplatissez la boîte pour qu\'elle entre.' },
      soiled: { bin: 'compost', en: 'Grease- or food-soiled cardboard cannot be recycled — the fibres are ruined. Longueuil accepts it in the brown compost bin, torn into pieces.', fr: 'Le carton souillé de graisse ou de nourriture ne peut pas être recyclé — les fibres sont ruinées. Longueuil l\'accepte au bac brun (compost), déchiré en morceaux.' },
      broken: { bin: 'recycling', en: 'Torn or flattened cardboard is fine in the blue bin, as long as it is clean and dry.', fr: 'Le carton déchiré ou aplati est accepté au bac bleu, tant qu\'il est propre et sec.' }
    },
    pizza_box: {
      name: { fr: 'Boîte de pizza', en: 'Pizza box' },
      clean:  { bin: 'recycling', en: 'A clean, grease-free pizza box is cardboard: flatten it into the blue bin. (Most real pizza boxes are NOT this clean — check for grease.)', fr: 'Une boîte de pizza propre, sans graisse, c\'est du carton : aplatissez-la au bac bleu. (La plupart des vraies boîtes de pizza ne sont PAS aussi propres — vérifiez la graisse.)' },
      soiled: { bin: 'compost', en: 'TRAP: a grease-soiled pizza box contaminates recycled paper. In Longueuil it goes in the brown compost bin, torn up. Tear off any clean lid part for the blue bin.', fr: 'PIÈGE : une boîte de pizza graisseuse contamine le papier recyclé. À Longueuil, elle va au bac brun (compost), déchirée. Déchirez le couvercle propre, s\'il y en a un, pour le bac bleu.' },
      broken: { bin: 'recycling', en: 'Torn-up pizza box pieces follow the grease rule: clean pieces to the blue bin. If the pieces are greasy, use compost instead.', fr: 'Les morceaux de boîte de pizza suivent la règle de la graisse : morceaux propres au bac bleu. Si les morceaux sont graisseux, compostez-les plutôt.' }
    },
    paper: {
      name: { fr: 'Papier (feuilles, journal, magazine)', en: 'Paper (sheets, newspaper, magazine)' },
      clean:  { bin: 'recycling', en: 'Clean paper and newspaper go in the blue bin. Keep them dry.', fr: 'Le papier et les journaux propres vont au bac bleu. Gardez-les au sec.' },
      soiled: { bin: 'compost', en: 'Food-soiled paper (napkins, paper towels, greasy sheets) cannot be recycled. Longueuil accepts it in the brown compost bin.', fr: 'Le papier souillé de nourriture (serviettes, essuie-tout, feuilles graisseuses) ne peut pas être recyclé. Longueuil l\'accepte au bac brun (compost).' },
      broken: { bin: 'recycling', en: 'Shredded or torn clean paper still goes in the blue bin in Longueuil (bag shreds in a paper bag so they do not scatter).', fr: 'Le papier déchiqueté ou déchiré propre va toujours au bac bleu à Longueuil (mettez les déchiquetages dans un sac de papier pour éviter qu\'ils s\'éparpillent).' }
    },
    coffee_cup: {
      name: { fr: 'Tasse de café en carton', en: 'Paper coffee cup' },
      clean:  { bin: 'garbage', en: 'TRAP: take-out coffee cups are lined with plastic, so they are NOT recyclable paper and NOT compostable in Longueuil. Grey bin. (The plastic lid alone, rinsed, can go in the blue bin.)', fr: 'PIÈGE : les tasses de café à emporter sont doublées de plastique, donc ce n\'est NI du papier recyclable NI du compostable à Longueuil. Bac gris. (Le couvercle de plastique seul, rincé, peut aller au bac bleu.)' },
      soiled: { bin: 'garbage', en: 'Plastic-lined coffee cups go in the grey bin in Longueuil, clean or not.', fr: 'Les tasses de café doublées de plastique vont au bac gris à Longueuil, propres ou non.' },
      broken: { bin: 'garbage', en: 'Plastic-lined coffee cups go in the grey bin in Longueuil, in any state.', fr: 'Les tasses de café doublées de plastique vont au bac gris à Longueuil, dans n\'importe quel état.' }
    },
    plastic_film: {
      name: { fr: 'Pellicule, sac ou emballage plastique', en: 'Plastic film, bag or wrap' },
      clean:  { bin: 'garbage', en: 'TRAP: soft plastic film and bags jam sorting machines and are refused in Longueuil curbside recycling, even clean. Grey bin — or use a store film-recycling drop-off where offered.', fr: 'PIÈGE : la pellicule et les sacs de plastique souple bloquent les machines de tri et sont refusés au recyclage résidentiel de Longueuil, même propres. Bac gris — ou un point de dépôt de pellicule en magasin, quand il y en a un.' },
      soiled: { bin: 'garbage', en: 'Plastic film and bags are not accepted in the blue bin in Longueuil. Grey bin.', fr: 'La pellicule et les sacs de plastique ne sont pas acceptés au bac bleu à Longueuil. Bac gris.' },
      broken: { bin: 'garbage', en: 'Plastic film and bags are not accepted in the blue bin in Longueuil. Grey bin.', fr: 'La pellicule et les sacs de plastique ne sont pas acceptés au bac bleu à Longueuil. Bac gris.' }
    },
    food_scraps: {
      name: { fr: 'Restes de nourriture / fruits / légumes', en: 'Food scraps / fruit / produce' },
      clean:  { bin: 'compost', en: 'Food scraps go in the brown compost bin in Longueuil — never in the garbage if you can avoid it. Remove stickers and packaging first.', fr: 'Les restes de nourriture vont au bac brun (compost) à Longueuil — jamais aux ordures si vous pouvez l\'éviter. Retirez d\'abord les autocollants et emballages.' },
      soiled: { bin: 'compost', en: 'Food is compost: brown bin. "Soiled" is its normal state.', fr: 'La nourriture, c\'est du compost : bac brun. « Souillé » est son état normal.' },
      broken: { bin: 'compost', en: 'Food scraps in any state go in the brown compost bin.', fr: 'Les restes de nourriture, dans n\'importe quel état, vont au bac brun (compost).' }
    },
    styrofoam: {
      name: { fr: 'Styromousse (polystyrène expansé)', en: 'Styrofoam (expanded polystyrene)' },
      clean:  { bin: 'garbage', en: 'Styrofoam packaging and trays are not accepted in Longueuil curbside recycling. Grey bin (some ecocentres take clean blocks — check before a special trip).', fr: 'Les emballages et barquettes en styromousse ne sont pas acceptés au recyclage résidentiel de Longueuil. Bac gris (certains écocentres acceptent les blocs propres — vérifiez avant un déplacement exprès).' },
      soiled: { bin: 'garbage', en: 'Styrofoam food trays are not recyclable curbside in Longueuil. Grey bin.', fr: 'Les barquettes alimentaires en styromousse ne sont pas recyclables en bordure de rue à Longueuil. Bac gris.' },
      broken: { bin: 'garbage', en: 'Broken styrofoam still goes in the grey bin; bag small beads so they do not blow away.', fr: 'La styromousse brisée va toujours au bac gris ; ensachez les petites billes pour éviter qu\'elles s\'envolent.' }
    },
    electronics: {
      name: { fr: 'Électronique / téléphone / pile', en: 'Electronics / phone / battery' },
      clean:  { bin: 'ecocentre', en: 'Electronics, phones and batteries never go in any curbside bin — they contain hazardous materials and valuable metals. Take them to an ecocentre or an official e-waste drop-off (e.g. Electrobac / retailer take-back).', fr: 'L\'électronique, les téléphones et les piles ne vont JAMAIS dans un bac résidentiel — ils contiennent des matières dangereuses et des métaux précieux. Apportez-les à un écocentre ou à un point de dépôt officiel de déchets électroniques (p. ex. Électrobac / reprise en magasin).' },
      soiled: { bin: 'ecocentre', en: 'Electronics and batteries go to an ecocentre or official e-waste drop-off, whatever their state.', fr: 'L\'électronique et les piles vont à un écocentre ou à un point de dépôt officiel, quel que soit leur état.' },
      broken: { bin: 'ecocentre', en: 'Broken electronics and swollen/damaged batteries are hazardous: ecocentre only, ideally in a sealed non-metal container. Never the grey bin.', fr: 'L\'électronique brisée et les piles gonflées ou endommagées sont dangereuses : écocentre seulement, idéalement dans un contenant scellé non métallique. Jamais au bac gris.' }
    },
    textile: {
      name: { fr: 'Vêtements / textiles', en: 'Clothing / textile' },
      clean:  { bin: 'ecocentre', en: 'Wearable clothing should be donated (drop-off bins, charities). Worn-out textiles go to an ecocentre textile drop-off — never the blue bin.', fr: 'Les vêtements portables devraient être donnés (bacs de dons, organismes). Les textiles usés vont au point de dépôt textile d\'un écocentre — jamais au bac bleu.' },
      soiled: { bin: 'garbage', en: 'Heavily soiled or mouldy textiles cannot be donated or recycled: grey bin. Lightly used items: wash and donate instead.', fr: 'Les textiles très souillés ou moisis ne peuvent être ni donnés ni recyclés : bac gris. Les articles légèrement usés : lavez-les et donnez-les plutôt.' },
      broken: { bin: 'ecocentre', en: 'Torn textiles are accepted at ecocentre textile drop-offs for fibre recycling. Not the blue bin.', fr: 'Les textiles déchirés sont acceptés aux points de dépôt textile des écocentres pour le recyclage des fibres. Pas au bac bleu.' }
    }
  };

  // Montréal: full explicit dataset. Bins identical to Longueuil EXCEPT
  // coffee_cup, plastic_film and styrofoam (sources in the header comment).
  // Montréal's collection bin is the "bac de récupération" (green,
  // transitioning to blue under the modernized system) — rule texts say so.
  var MONTREAL_ITEMS = {
    plastic_bottle: {
      name: { fr: 'Bouteille de plastique', en: 'Plastic bottle' },
      clean:  { bin: 'recycling', en: 'Rigid plastic containers go in the recycling bin in Montréal. Empty it, rinse lightly, keep the cap on. Ready-to-drink plastic bottles (100 mL–2 L) carry a deposit — returning them to a retailer earns it back.', fr: 'Les contenants de plastique rigide vont au bac de récupération à Montréal. Videz-le, rincez légèrement, gardez le capuchon. Les bouteilles de boisson prête-à-boire en plastique (100 mL à 2 L) sont consignées — les rapporter à un détaillant permet de récupérer la consigne.' },
      soiled: { bin: 'recycling', en: 'Empty and rinse it: a rinsed plastic bottle is accepted in the recycling bin. Food residue left inside can get it rejected at sorting.', fr: 'Videz-le et rincez-le : une bouteille de plastique rincée est acceptée au bac de récupération. Les résidus alimentaires laissés dedans peuvent la faire rejeter au tri.' },
      broken: { bin: 'recycling', en: 'Broken rigid plastic is still recyclable in the recycling bin, as long as the pieces are not tiny shreds.', fr: 'Le plastique rigide brisé reste recyclable au bac de récupération, tant que les morceaux ne sont pas de minuscules éclats.' }
    },
    glass_bottle: {
      name: { fr: 'Bouteille ou pot en verre', en: 'Glass bottle or jar' },
      clean:  { bin: 'recycling', en: 'Glass bottles and jars go in the recycling bin in Montréal. Rinse and remove lids (metal lids go in loose).', fr: 'Les bouteilles et pots en verre vont au bac de récupération à Montréal. Rincez et retirez les couvercles (les couvercles en métal vont au bac séparément).' },
      soiled: { bin: 'recycling', en: 'Rinse it first: clean glass is accepted in the recycling bin.', fr: 'Rincez-le d\'abord : le verre propre est accepté au bac de récupération.' },
      broken: { bin: 'garbage', en: 'SAFETY: broken glass does NOT go loose in the recycling bin — it injures sorting workers. Wrap it in newspaper or a sealed box, label it "broken glass", and put it in the grey bin.', fr: 'SÉCURITÉ : le verre brisé ne va JAMAIS en vrac au bac de récupération — il blesse les travailleurs du tri. Enveloppez-le dans du papier journal ou une boîte scellée, étiquetez « verre brisé », et mettez-le au bac gris.' }
    },
    metal_can: {
      name: { fr: 'Canette ou contenant en métal', en: 'Metal can or container' },
      clean:  { bin: 'recycling', en: 'Metal cans and aluminum containers go in the recycling bin in Montréal. Rinse lightly. Aluminum drink cans carry a deposit — returning them to a retailer earns it back.', fr: 'Les canettes et contenants en métal vont au bac de récupération à Montréal. Rincez légèrement. Les canettes de boisson en aluminium sont consignées — les rapporter à un détaillant permet de récupérer la consigne.' },
      soiled: { bin: 'recycling', en: 'Empty and rinse it: metal is accepted in the recycling bin once food residue is removed.', fr: 'Videz-le et rincez-le : le métal est accepté au bac de récupération une fois les résidus alimentaires retirés.' },
      broken: { bin: 'recycling', en: 'Crushed or dented metal cans are still accepted in the recycling bin. Watch sharp edges.', fr: 'Les canettes écrasées ou bosselées restent acceptées au bac de récupération. Attention aux bords coupants.' }
    },
    cardboard: {
      name: { fr: 'Boîte de carton', en: 'Cardboard box' },
      clean:  { bin: 'recycling', en: 'Clean, dry cardboard goes in the recycling bin. Flatten the box so it fits.', fr: 'Le carton propre et sec va au bac de récupération. Aplatissez la boîte pour qu\'elle entre.' },
      soiled: { bin: 'compost', en: 'Grease- or food-soiled cardboard cannot be recycled — the fibres are ruined. Montréal accepts it in the brown compost bin, torn into pieces.', fr: 'Le carton souillé de graisse ou de nourriture ne peut pas être recyclé — les fibres sont ruinées. Montréal l\'accepte au bac brun (compost), déchiré en morceaux.' },
      broken: { bin: 'recycling', en: 'Torn or flattened cardboard is fine in the recycling bin, as long as it is clean and dry.', fr: 'Le carton déchiré ou aplati est accepté au bac de récupération, tant qu\'il est propre et sec.' }
    },
    pizza_box: {
      name: { fr: 'Boîte de pizza', en: 'Pizza box' },
      clean:  { bin: 'recycling', en: 'A clean, grease-free pizza box is cardboard: flatten it into the recycling bin. (Most real pizza boxes are NOT this clean — check for grease.)', fr: 'Une boîte de pizza propre, sans graisse, c\'est du carton : aplatissez-la au bac de récupération. (La plupart des vraies boîtes de pizza ne sont PAS aussi propres — vérifiez la graisse.)' },
      soiled: { bin: 'compost', en: 'TRAP: a grease-soiled pizza box contaminates recycled paper. In Montréal it goes in the brown compost bin, torn up. Tear off any clean lid part for the recycling bin.', fr: 'PIÈGE : une boîte de pizza graisseuse contamine le papier recyclé. À Montréal, elle va au bac brun (compost), déchirée. Déchirez le couvercle propre, s\'il y en a un, pour le bac de récupération.' },
      broken: { bin: 'recycling', en: 'Torn-up pizza box pieces follow the grease rule: clean pieces to the recycling bin. If the pieces are greasy, use compost instead.', fr: 'Les morceaux de boîte de pizza suivent la règle de la graisse : morceaux propres au bac de récupération. Si les morceaux sont graisseux, compostez-les plutôt.' }
    },
    paper: {
      name: { fr: 'Papier (feuilles, journal, magazine)', en: 'Paper (sheets, newspaper, magazine)' },
      clean:  { bin: 'recycling', en: 'Clean paper and newspaper go in the recycling bin. Keep them dry.', fr: 'Le papier et les journaux propres vont au bac de récupération. Gardez-les au sec.' },
      soiled: { bin: 'compost', en: 'Food-soiled paper (napkins, paper towels, greasy sheets) cannot be recycled. Montréal accepts it in the brown compost bin.', fr: 'Le papier souillé de nourriture (serviettes, essuie-tout, feuilles graisseuses) ne peut pas être recyclé. Montréal l\'accepte au bac brun (compost).' },
      broken: { bin: 'recycling', en: 'Shredded or torn clean paper still goes in the recycling bin in Montréal (bag shreds in a paper bag so they do not scatter).', fr: 'Le papier déchiqueté ou déchiré propre va toujours au bac de récupération à Montréal (mettez les déchiquetages dans un sac de papier pour éviter qu\'ils s\'éparpillent).' }
    },
    coffee_cup: {
      name: { fr: 'Tasse de café en carton', en: 'Paper coffee cup' },
      clean:  { bin: 'recycling', en: 'In Montréal, take-out coffee cups ARE accepted in the recycling bin: under Québec\'s modernized system (Éco Entreprises Québec), containers, packaging and printed paper all go in, with only three exceptions (aerosols, protective styrofoam, biodegradable plastics). Empty the cup first; the plastic lid can stay on.', fr: 'À Montréal, les tasses de café à emporter SONT acceptées au bac de récupération : avec le système modernisé du Québec (Éco Entreprises Québec), les contenants, emballages et imprimés y vont tous, avec seulement trois exceptions (aérosols, styromousse de protection, plastiques biodégradables). Videz la tasse d\'abord ; le couvercle de plastique peut rester.' },
      soiled: { bin: 'recycling', en: 'Empty it completely: a drained coffee cup is accepted in Montréal\'s recycling bin. Coffee grounds and leftover liquid go in the brown bin — a cup still full of coffee does not belong in recycling.', fr: 'Videz-la complètement : une tasse de café vidée est acceptée au bac de récupération de Montréal. Le marc et le liquide restant vont au bac brun — une tasse encore pleine de café n\'a pas sa place au recyclage.' },
      broken: { bin: 'recycling', en: 'A torn or crushed coffee cup is still paper packaging: recycling bin in Montréal.', fr: 'Une tasse de café déchirée ou écrasée reste un emballage de papier : bac de récupération à Montréal.' }
    },
    plastic_film: {
      name: { fr: 'Pellicule, sac ou emballage plastique', en: 'Plastic film, bag or wrap' },
      clean:  { bin: 'recycling', en: 'In Montréal, plastic bags and packaging film ARE accepted in the recycling bin — "Sac et pellicule d\'emballage" is on the city\'s official accepted list. Empty them, and group loose film inside one bag so it does not scatter.', fr: 'À Montréal, les sacs et la pellicule d\'emballage en plastique SONT acceptés au bac de récupération — « Sac et pellicule d\'emballage » figure sur la liste officielle des matières acceptées de la Ville. Videz-les, et regroupez les pellicules dans un seul sac pour éviter qu\'elles s\'éparpillent.' },
      soiled: { bin: 'garbage', en: 'Food-soiled film cannot be sorted — as-is it goes in the grey bin. If you can rinse it clean, it becomes accepted packaging film (recycling bin).', fr: 'Une pellicule souillée de nourriture ne peut pas être triée — telle quelle, elle va au bac gris. Si vous pouvez la rincer propre, elle redevient une pellicule d\'emballage acceptée (bac de récupération).' },
      broken: { bin: 'recycling', en: 'Torn plastic bags and film are still packaging: group them in one bag and put them in the recycling bin in Montréal.', fr: 'Les sacs et pellicules déchirés restent des emballages : regroupez-les dans un seul sac et mettez-les au bac de récupération à Montréal.' }
    },
    food_scraps: {
      name: { fr: 'Restes de nourriture / fruits / légumes', en: 'Food scraps / fruit / produce' },
      clean:  { bin: 'compost', en: 'Food scraps go in the brown compost bin in Montréal — never in the garbage if you can avoid it. Remove stickers and packaging first.', fr: 'Les restes de nourriture vont au bac brun (compost) à Montréal — jamais aux ordures si vous pouvez l\'éviter. Retirez d\'abord les autocollants et emballages.' },
      soiled: { bin: 'compost', en: 'Food is compost: brown bin. "Soiled" is its normal state.', fr: 'La nourriture, c\'est du compost : bac brun. « Souillé » est son état normal.' },
      broken: { bin: 'compost', en: 'Food scraps in any state go in the brown compost bin.', fr: 'Les restes de nourriture, dans n\'importe quel état, vont au bac brun (compost).' }
    },
    styrofoam: {
      name: { fr: 'Styromousse (polystyrène expansé)', en: 'Styrofoam (expanded polystyrene)' },
      clean:  { bin: 'recycling', en: 'In Montréal, polystyrene FOOD trays and containers (meat/fish trays) are accepted packaging in the recycling bin — they are on the city\'s official accepted list. The exception is protective foam that crumbles into beads: refused in the bin, it goes to a drop-off point.', fr: 'À Montréal, les barquettes et contenants alimentaires en polystyrène (barquettes de viande ou de poisson) sont des emballages acceptés au bac de récupération — ils figurent sur la liste officielle des matières acceptées de la Ville. L\'exception : la styromousse de protection qui se défait en billes — refusée au bac, elle va à un point de dépôt.' },
      soiled: { bin: 'garbage', en: 'A food tray must be emptied and rinsed to be accepted in Montréal\'s recycling bin; grease-soaked as-is, it goes in the grey bin.', fr: 'Une barquette alimentaire doit être vidée et rincée pour être acceptée au bac de récupération de Montréal ; graisseuse telle quelle, elle va au bac gris.' },
      broken: { bin: 'garbage', en: 'Broken polystyrene that crumbles into beads is exactly the foam Montréal refuses in the bin (it injures workers and jams sorting). Bag it: grey bin or a drop-off point.', fr: 'Le polystyrène brisé qui se défait en billes est exactement la styromousse que Montréal refuse au bac (elle blesse les travailleurs et bloque le tri). Ensachez-le : bac gris ou point de dépôt.' }
    },
    electronics: {
      name: { fr: 'Électronique / téléphone / pile', en: 'Electronics / phone / battery' },
      clean:  { bin: 'ecocentre', en: 'Electronics, phones and batteries never go in any curbside bin — they contain hazardous materials and valuable metals. Take them to an ecocentre or an official e-waste drop-off (e.g. Electrobac / retailer take-back).', fr: 'L\'électronique, les téléphones et les piles ne vont JAMAIS dans un bac résidentiel — ils contiennent des matières dangereuses et des métaux précieux. Apportez-les à un écocentre ou à un point de dépôt officiel de déchets électroniques (p. ex. Électrobac / reprise en magasin).' },
      soiled: { bin: 'ecocentre', en: 'Electronics and batteries go to an ecocentre or official e-waste drop-off, whatever their state.', fr: 'L\'électronique et les piles vont à un écocentre ou à un point de dépôt officiel, quel que soit leur état.' },
      broken: { bin: 'ecocentre', en: 'Broken electronics and swollen/damaged batteries are hazardous: ecocentre only, ideally in a sealed non-metal container. Never the grey bin.', fr: 'L\'électronique brisée et les piles gonflées ou endommagées sont dangereuses : écocentre seulement, idéalement dans un contenant scellé non métallique. Jamais au bac gris.' }
    },
    textile: {
      name: { fr: 'Vêtements / textiles', en: 'Clothing / textile' },
      clean:  { bin: 'ecocentre', en: 'Wearable clothing should be donated (drop-off bins, charities). Worn-out textiles go to an ecocentre textile drop-off — never the recycling bin.', fr: 'Les vêtements portables devraient être donnés (bacs de dons, organismes). Les textiles usés vont au point de dépôt textile d\'un écocentre — jamais au bac de récupération.' },
      soiled: { bin: 'garbage', en: 'Heavily soiled or mouldy textiles cannot be donated or recycled: grey bin. Lightly used items: wash and donate instead.', fr: 'Les textiles très souillés ou moisis ne peuvent être ni donnés ni recyclés : bac gris. Les articles légèrement usés : lavez-les et donnez-les plutôt.' },
      broken: { bin: 'ecocentre', en: 'Torn textiles are accepted at ecocentre textile drop-offs for fibre recycling. Not the recycling bin.', fr: 'Les textiles déchirés sont acceptés aux points de dépôt textile des écocentres pour le recyclage des fibres. Pas au bac de récupération.' }
    }
  };

  var CITIES = {
    longueuil: { name: CITY_NAMES.longueuil, items: LONGUEUIL_ITEMS },
    montreal: { name: CITY_NAMES.montreal, items: MONTREAL_ITEMS }
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

  // Localized "uncertain" texts (phase B). The English strings reproduce
  // the shipped 2026-10-28 wording, with the city name parameterized.
  var UNCERTAIN_TEXT = {
    fr: {
      prefix: 'TriClair ne devine pas : un mauvais bac contamine un chargement entier. ',
      guide: ' Utilisez le sélecteur manuel de matière ci-dessous, ou consultez le guide des déchets de ',
      guideEnd: '.',
      lowConf: function (pct, thr) { return 'Le modèle photo n\'est pas assez confiant (' + pct + ' % < ' + thr + ' %).'; },
      noScore: 'Le modèle photo n\'a fourni aucun score.',
      unknownLabel: function (label) { return '« ' + label + ' » n\'est pas un objet que TriClair sait trier.'; },
      unknownItem: 'Objet inconnu.',
      unknownMaterial: function (m) { return 'Le matériau « ' + m + ' » n\'a pas de réponse unique et sûre — ça dépend de l\'objet.'; }
    },
    en: {
      prefix: 'TriClair will not guess: a wrong bin contaminates a whole truckload. ',
      guide: ' Use the manual material picker below, or check ',
      guideEnd: '\'s waste guide.',
      lowConf: function (pct, thr) { return 'The photo model is not confident enough (' + pct + '% < ' + thr + '%).'; },
      noScore: 'no score',
      unknownLabel: function (label) { return '"' + label + '" is not an item TriClair knows how to sort.'; },
      unknownItem: 'Unknown item.',
      unknownMaterial: function (m) { return 'Material "' + m + '" has no single safe answer — it depends on the object.'; }
    }
  };

  function normalizeOpts(opts) {
    opts = opts || {};
    var city = CITIES[opts.city] ? opts.city : DEFAULT_CITY;
    var lang = (opts.lang === 'en' || opts.lang === 'fr') ? opts.lang : DEFAULT_LANG;
    return { city: city, lang: lang };
  }

  function normalizeCondition(condition) {
    return (condition === 'soiled' || condition === 'broken') ? condition : 'clean';
  }

  function decide(itemKey, condition, opts) {
    var o = normalizeOpts(opts);
    var item = CITIES[o.city].items[itemKey];
    if (!item) return uncertainVerdict('unknownItem', null, o);
    var cond = normalizeCondition(condition);
    var entry = item[cond] || item.clean;
    return {
      status: 'ok', itemKey: itemKey,
      itemName: item.name[o.lang] || item.name.fr, condition: cond,
      city: o.city, lang: o.lang,
      bin: entry.bin, binLabel: BIN_LABELS[o.lang][entry.bin],
      rule: entry[o.lang] || entry.fr
    };
  }

  // reason: {kind:'lowConf'|'unknownLabel'|'unknownItem'|'unknownMaterial', ...}
  function uncertainVerdict(reason, confidence, opts) {
    var o = normalizeOpts(opts);
    var t = UNCERTAIN_TEXT[o.lang];
    var text;
    if (reason && reason.kind === 'lowConf') {
      if (typeof reason.pct === 'number') {
        text = t.lowConf(reason.pct, Math.round(CONFIDENCE_THRESHOLD * 100));
      } else if (o.lang === 'en') {
        // Shipped English wording: a parenthetical inside the sentence.
        text = 'The photo model is not confident enough (no score < ' +
          Math.round(CONFIDENCE_THRESHOLD * 100) + '%).';
      } else {
        text = t.noScore;
      }
    } else if (reason && reason.kind === 'unknownLabel') {
      text = t.unknownLabel(reason.label);
    } else if (reason && reason.kind === 'unknownMaterial') {
      text = t.unknownMaterial(reason.material);
    } else {
      text = t.unknownItem;
    }
    return {
      status: 'uncertain', itemKey: null, itemName: null, condition: null,
      city: o.city, lang: o.lang,
      bin: 'uncertain', binLabel: BIN_LABELS[o.lang].uncertain,
      rule: t.prefix + text + t.guide + CITY_NAMES[o.city][o.lang] + t.guideEnd,
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
  function fromLabel(label, confidence, condition, opts) {
    var o = normalizeOpts(opts);
    if (typeof confidence !== 'number' || confidence < CONFIDENCE_THRESHOLD) {
      return uncertainVerdict({
        kind: 'lowConf',
        pct: (typeof confidence === 'number') ? Math.round(confidence * 100) : null
      }, confidence, o);
    }
    var itemKey = itemForLabel(label);
    if (!itemKey) {
      return uncertainVerdict({ kind: 'unknownLabel', label: label }, confidence, o);
    }
    var verdict = decide(itemKey, condition, o);
    verdict.confidence = confidence;
    verdict.label = label;
    return verdict;
  }

  // Manual path: user picks the material directly.
  function fromMaterial(material, condition, opts) {
    var o = normalizeOpts(opts);
    var itemKey = MATERIAL_TO_ITEM[material];
    if (!itemKey) {
      return uncertainVerdict({ kind: 'unknownMaterial', material: material }, null, o);
    }
    var verdict = decide(itemKey, condition, o);
    verdict.label = 'manual: ' + material;
    return verdict;
  }

  var api = {
    CONFIDENCE_THRESHOLD: CONFIDENCE_THRESHOLD,
    DEFAULT_CITY: DEFAULT_CITY,
    DEFAULT_LANG: DEFAULT_LANG,
    BIN_LABELS: BIN_LABELS,
    CITY_NAMES: CITY_NAMES,
    CITIES: CITIES,
    CITY_KEYS: Object.keys(CITIES),
    MATERIALS: Object.keys(MATERIAL_TO_ITEM),
    decide: decide,
    fromLabel: fromLabel,
    fromMaterial: fromMaterial,
    itemForLabel: itemForLabel
  };

  global.TriRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
