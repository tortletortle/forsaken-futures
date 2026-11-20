/* V1.3 Skill Transfer & Composition Generalization Lab.
   This is an isolated experiment: it does not change the campaign player or legacy modules. */
const MigrationLab = (() => {
  const isNode = typeof module === 'object' && module.exports;
  const E = isNode ? require('./engine.js') : Engine;
  const V = isNode ? require('./evolution.js') : Evolution;
  const P = isNode ? require('./players.js') : Players;
  const M = isNode ? require('./modular.js') : ModularLab;
  const clone = x => JSON.parse(JSON.stringify(x));
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const sum = a => a.reduce((s, x) => s + x, 0);
  const MODULES = M.MODULE_IDS;
  const LIB = Object.fromEntries(M.SKILL_LIBRARY.map(x => [x.id, x]));
  const PAIRS = [];
  for (let i = 0; i < MODULES.length; i++) for (let j = i + 1; j < MODULES.length; j++) PAIRS.push([MODULES[i], MODULES[j]]);
  const hash = x => JSON.stringify(x);

  function seedList(seed, salt, n) {
    const r = V.rng((seed ^ salt) >>> 0), out = [];
    for (let i = 0; i < n; i++) out.push(Math.floor(r() * 4294967296));
    return out;
  }
  function makeGenerated(seed, title, forbidden) {
    const rng = V.rng(seed >>> 0);
    for (let attempt = 0; attempt < 600; attempt++) {
      const l = V.procedural(rng);
      l.id = `V13_${title.replace(/[^A-Za-z0-9]/g, '')}_${attempt}`;
      l.title = title;
      try {
        E.validate(l);
        const sig = V.signature(l);
        if (forbidden.has(sig)) continue;
        const solved = E.search(l, E.initial(l), null, 'full', 30000);
        if (solved.complete && solved.route) {
          forbidden.add(sig);
          return l;
        }
      } catch (_) {}
    }
    throw new Error(`无法生成可解且不重复的验证关卡：${title}`);
  }
  function makeTaskPack(seed, templates) {
    if (!Array.isArray(templates) || templates.length < 5) throw new Error('V1.3 需要五个正式关卡模板');
    const forbidden = new Set(templates.map(V.signature));
    const generatedA = makeGenerated((seed ^ 0x13a11) >>> 0, '迁移留出 A', forbidden);
    const generatedB = makeGenerated((seed ^ 0x13b22) >>> 0, '迁移留出 B', forbidden);
    const pack = {
      source: [templates[0], templates[1]],
      target: [templates[2], templates[3]],
      holdout: [templates[4], generatedA, generatedB]
    };
    const signatures = Object.fromEntries(Object.entries(pack).map(([k, ls]) => [k, ls.map(V.signature)]));
    if (new Set([...signatures.source, ...signatures.target, ...signatures.holdout]).size !== 7) throw new Error('任务签名发生重叠');
    return { ...pack, signatures };
  }
  function evalBatch(levels, genome, seedsByLevel, budget) {
    const runs = [];
    for (let i = 0; i < levels.length; i++) {
      const seeds = seedsByLevel[i];
      for (const seed of seeds) runs.push(M.playEpisode(levels[i], genome, seed, budget));
    }
    const p = P.profiles[genome.tier], n = Math.max(1, runs.length);
    const wins = runs.filter(x => x.win).length;
    const winRate = wins / n;
    const meanAttempts = avg(runs.map(x => x.attempts / p.steps));
    const meanUndos = avg(runs.map(x => x.undos / Math.max(1, p.undo)));
    return {
      winRate, wins, episodes: runs.length,
      fitness: winRate - .025 * meanAttempts - .015 * meanUndos,
      meanAttempts, meanUndos,
      actualWork: sum(runs.map(x => x.workUnits)),
      allocatedWork: runs.length * budget,
      budgetStops: runs.filter(x => x.reason === 'compute_budget').length,
      runs
    };
  }
  function seededByLevel(seed, salt, levels, n) {
    return levels.map((_, i) => seedList(seed, (salt + i * 0x9e37) >>> 0, n));
  }
  function tournament(scored, rng) {
    const a = scored[Math.floor(rng() * scored.length)];
    const b = scored[Math.floor(rng() * scored.length)];
    return a.fitness >= b.fitness ? a.genome : b.genome;
  }
  function applyFrozen(genome, reference, frozen) {
    const g = clone(genome);
    for (const id of frozen) g.modules[id] = clone(reference.modules[id]);
    return M.repairGenome(g);
  }
  function dependencyClosure(ids) {
    const out = new Set();
    const visit = id => {
      if (out.has(id)) return;
      out.add(id);
      for (const dep of LIB[id].deps) visit(dep);
    };
    ids.forEach(visit);
    return [...out].sort((a, b) => MODULES.indexOf(a) - MODULES.indexOf(b));
  }
  function evolveTarget({ initGenome, frozenIds, frozenReference, levels, seed, generations, population, episodeBudget, trainSeeds }) {
    const rng = V.rng(seed >>> 0), frozen = [...frozenIds];
    const fix = g => frozen.length ? applyFrozen(g, frozenReference, frozen) : M.repairGenome(g);
    let pop = [fix(clone(initGenome))];
    while (pop.length < population) pop.push(fix(M.mutateGenome(initGenome, rng)));
    const history = [], stats = { candidateEvaluations: 0, trainEpisodes: 0, actualWork: 0, allocatedWork: 0, budgetStops: 0 };
    let bestGenome = null;
    for (let gen = 0; gen < generations; gen++) {
      const seeds = trainSeeds[gen];
      const scored = pop.map(genome => {
        const ev = evalBatch(levels, genome, seeds, episodeBudget);
        stats.candidateEvaluations++; stats.trainEpisodes += ev.episodes; stats.actualWork += ev.actualWork;
        stats.allocatedWork += ev.allocatedWork; stats.budgetStops += ev.budgetStops;
        return { genome, ...ev };
      }).sort((a, b) => b.fitness - a.fitness);
      bestGenome = clone(scored[0].genome);
      history.push({ generation: gen + 1, trainRate: scored[0].winRate, fitness: scored[0].fitness, diversity: M.genomeDistance(pop[0], pop[pop.length - 1]), bestGenome: clone(bestGenome) });
      if (gen < generations - 1) {
        const next = [clone(scored[0].genome)];
        if (population > 1) next.push(clone(scored[1].genome));
        while (next.length < population) {
          const a = tournament(scored, rng), b = tournament(scored, rng);
          let child = M.mutateGenome(M.crossoverGenome(a, b, rng), rng);
          child = fix(child);
          next.push(child);
        }
        pop = next;
      }
    }
    const integrity = frozen.length ? frozen.every(id => hash(bestGenome.modules[id]) === hash(frozenReference.modules[id])) : null;
    return { genome: bestGenome, frozen, integrity, history, stats };
  }
  function summarizeRates(rows) {
    const keys = ['sourceRate', 'targetRate', 'holdoutRate', 'sourceDeltaVsDonor', 'targetDeltaVsScratch', 'holdoutDeltaVsScratch'];
    const out = {};
    for (const key of keys) {
      const vals = rows.map(x => x[key]).filter(Number.isFinite);
      out[key] = { mean: avg(vals), min: Math.min(...vals), max: Math.max(...vals), values: vals };
    }
    return out;
  }
  function chooseTopFreeze(singleRows) {
    const ranked = [...singleRows].sort((a, b) => b.targetDelta - a.targetDelta);
    return dependencyClosure(ranked.slice(0, 2).map(x => x.module));
  }
  function chooseRandomFreeze(seed, targetSize) {
    const rng = V.rng(seed >>> 0), candidates = [];
    for (let mask = 1; mask < (1 << MODULES.length); mask++) {
      const picked = MODULES.filter((_, i) => mask & (1 << i));
      const closure = dependencyClosure(picked);
      if (closure.length === targetSize) candidates.push(closure);
    }
    if (!candidates.length) throw new Error(`无法构造与高价值冻结集同规模的随机冻结对照：${targetSize}`);
    return clone(candidates[Math.floor(rng() * candidates.length)]);
  }

  function trainSpecialists(seed, tier, sourceLevels, episodeBudget) {
    const base = M.makeGenome('modular', tier, V.rng((seed ^ (0x150000 + tier * 131)) >>> 0), false);
    const trainSeeds = seededByLevel(seed, 0x151001, sourceLevels, 2);
    const weights = [-1.2, 0, 1.2], thresholds = [-4, 0, 4];
    const genes = {}, rows = [], stats = { candidateEvaluations: 0, episodes: 0, actualWork: 0, allocatedWork: 0, budgetStops: 0 };
    for (const id of MODULES) {
      let best = null;
      for (const allele of LIB[id].alleles) for (const weight of weights) for (const threshold of thresholds) {
        const genome = clone(base);
        genome.modules[id] = { enabled: true, weight, allele: allele.id, threshold };
        const repaired = M.repairGenome(genome);
        const ev = evalBatch(sourceLevels, repaired, trainSeeds, episodeBudget);
        stats.candidateEvaluations++; stats.episodes += ev.episodes; stats.actualWork += ev.actualWork;
        stats.allocatedWork += ev.allocatedWork; stats.budgetStops += ev.budgetStops;
        const candidate = { genome: repaired, gene: clone(repaired.modules[id]), ...ev };
        if (!best || candidate.fitness > best.fitness + 1e-12 || (Math.abs(candidate.fitness - best.fitness) <= 1e-12 && (candidate.meanAttempts + candidate.meanUndos < best.meanAttempts + best.meanUndos))) best = candidate;
      }
      genes[id] = clone(best.gene);
      rows.push({ module: id, allele: best.gene.allele, weight: best.gene.weight, threshold: best.gene.threshold, sourceTrainRate: best.winRate, sourceFitness: best.fitness, candidates: LIB[id].alleles.length * weights.length * thresholds.length });
    }
    const composite = clone(base);
    for (const id of MODULES) composite.modules[id] = clone(genes[id]);
    const genome = M.repairGenome(composite);
    return { base, genome, genes, rows, stats, trainSeeds };
  }

  function runOne(seed, tier, templates, cfg) {
    const tasks = makeTaskPack(seed, templates);
    const sourceAuditSeeds = seededByLevel(seed, 0x131101, tasks.source, 2);
    const targetDirectSeeds = seededByLevel(seed, 0x132001, tasks.target, 2);
    const holdDirectSeeds = seededByLevel(seed, 0x133001, tasks.holdout, 2);
    const targetAuditSeeds = seededByLevel(seed, 0x132101, tasks.target, 2);
    const holdAuditSeeds = seededByLevel(seed, 0x133101, tasks.holdout, 2);
    const baseRng = V.rng((seed ^ (0x140000 + tier * 97)) >>> 0);
    const targetBase = M.makeGenome('modular', tier, baseRng, false);
    // Each skill gene is specialized independently on source-domain tasks; no target or holdout data is visible here.
    const specialist = trainSpecialists(seed, tier, tasks.source, cfg.episodeBudget);
    const donor = specialist.genome;
    const donorSource = evalBatch(tasks.source, donor, sourceAuditSeeds, cfg.episodeBudget);
    const donorTarget = evalBatch(tasks.target, donor, targetDirectSeeds, cfg.episodeBudget);
    const donorHold = evalBatch(tasks.holdout, donor, holdDirectSeeds, cfg.episodeBudget);

    const baselineDirect = evalBatch(tasks.target, targetBase, targetDirectSeeds, cfg.episodeBudget);
    const baselineHold = evalBatch(tasks.holdout, targetBase, holdDirectSeeds, cfg.episodeBudget);
    const singleRows = [];
    for (const id of MODULES) {
      const g = clone(targetBase); g.modules[id] = clone(specialist.genes[id]);
      const transplanted = M.repairGenome(g);
      const t = evalBatch(tasks.target, transplanted, targetDirectSeeds, cfg.episodeBudget);
      const h = evalBatch(tasks.holdout, transplanted, holdDirectSeeds, cfg.episodeBudget);
      singleRows.push({ module: id, targetRate: t.winRate, holdoutRate: h.winRate, targetDelta: t.winRate - baselineDirect.winRate, holdoutDelta: h.winRate - baselineHold.winRate, targetEpisodes: t.episodes, holdoutEpisodes: h.episodes });
    }
    const pairRows = [];
    for (const [a, b] of PAIRS) {
      const g = clone(targetBase); g.modules[a] = clone(specialist.genes[a]); g.modules[b] = clone(specialist.genes[b]);
      const transplanted = M.repairGenome(g);
      const t = evalBatch(tasks.target, transplanted, targetDirectSeeds, cfg.episodeBudget);
      const h = evalBatch(tasks.holdout, transplanted, holdDirectSeeds, cfg.episodeBudget);
      const sa = singleRows.find(x => x.module === a), sb = singleRows.find(x => x.module === b);
      const synergyTarget = t.winRate - sa.targetRate - sb.targetRate + baselineDirect.winRate;
      const synergyHoldout = h.winRate - sa.holdoutRate - sb.holdoutRate + baselineHold.winRate;
      pairRows.push({ modules: [a, b], targetRate: t.winRate, holdoutRate: h.winRate, synergyTarget, synergyHoldout, negativeTransfer: t.winRate + 1e-12 < Math.max(sa.targetRate, sb.targetRate), targetEpisodes: t.episodes, holdoutEpisodes: h.episodes });
    }
    const topFreeze = chooseTopFreeze(singleRows);
    const randomFreeze = chooseRandomFreeze((seed ^ (0x160000 + tier * 43)) >>> 0, topFreeze.length);
    const targetTrainSeeds = Array.from({ length: cfg.generations }, (_, gen) => seededByLevel(seed, 0x170000 + gen * 0x211, tasks.target, 1));
    const baselineSourceAudit = evalBatch(tasks.source, targetBase, sourceAuditSeeds, cfg.episodeBudget);
    const baselineTargetAudit = evalBatch(tasks.target, targetBase, targetAuditSeeds, cfg.episodeBudget);
    const baselineHoldoutAudit = evalBatch(tasks.holdout, targetBase, holdAuditSeeds, cfg.episodeBudget);
    const donorTargetAudit = evalBatch(tasks.target, donor, targetAuditSeeds, cfg.episodeBudget);
    const donorHoldoutAudit = evalBatch(tasks.holdout, donor, holdAuditSeeds, cfg.episodeBudget);
    const arms = [
      { id: 'scratch', name: '目标域从零进化', init: targetBase, frozen: [] },
      { id: 'transfer_all', name: '迁移后全部可塑', init: donor, frozen: [] },
      { id: 'freeze_top', name: '迁移 + 冻结高价值技能', init: donor, frozen: topFreeze },
      { id: 'freeze_random', name: '迁移 + 随机冻结对照', init: donor, frozen: randomFreeze }
    ];
    const armRows = [];
    for (let ai = 0; ai < arms.length; ai++) {
      const arm = arms[ai];
      // Common random numbers across adaptation arms: same initialization/mutation draws and same task seeds.
      const evoSeed = (seed ^ (0x180000 + tier * 1009)) >>> 0;
      const evo = evolveTarget({ initGenome: arm.init, frozenIds: arm.frozen, frozenReference: arm.init, levels: tasks.target, seed: evoSeed, generations: cfg.generations, population: cfg.population, episodeBudget: cfg.episodeBudget, trainSeeds: targetTrainSeeds });
      const source = evalBatch(tasks.source, evo.genome, sourceAuditSeeds, cfg.episodeBudget);
      const target = evalBatch(tasks.target, evo.genome, targetAuditSeeds, cfg.episodeBudget);
      const holdout = evalBatch(tasks.holdout, evo.genome, holdAuditSeeds, cfg.episodeBudget);
      armRows.push({
        id: arm.id, name: arm.name, frozen: arm.frozen, frozenIntegrity: evo.integrity,
        sourceRate: source.winRate, targetRate: target.winRate, holdoutRate: holdout.winRate,
        sourceDeltaVsDonor: source.winRate - donorSource.winRate,
        targetDeltaVsScratch: 0,
        holdoutDeltaVsScratch: 0,
        donorTargetRate: donorTargetAudit.winRate, donorHoldoutRate: donorHoldoutAudit.winRate,
        baselineSourceRate: baselineSourceAudit.winRate,
        history: evo.history, stats: evo.stats,
        audit: { sourceEpisodes: source.episodes, targetEpisodes: target.episodes, holdoutEpisodes: holdout.episodes, sourceActualWork: source.actualWork, targetActualWork: target.actualWork, holdoutActualWork: holdout.actualWork, allocatedWork: source.allocatedWork + target.allocatedWork + holdout.allocatedWork }
      });
    }
    const scratchArm = armRows.find(x => x.id === 'scratch');
    for (const arm of armRows) {
      arm.targetDeltaVsScratch = arm.targetRate - scratchArm.targetRate;
      arm.holdoutDeltaVsScratch = arm.holdoutRate - scratchArm.holdoutRate;
    }
    const baselineAudit = { sourceRate: baselineSourceAudit.winRate, targetRate: baselineTargetAudit.winRate, holdoutRate: baselineHoldoutAudit.winRate };

    const directCandidates = 1 + MODULES.length + PAIRS.length + 1;
    const directEpisodesPerCandidate = sum(targetDirectSeeds.map(x => x.length)) + sum(holdDirectSeeds.map(x => x.length));
    const adaptationCandidateEvaluationsPerArm = cfg.generations * cfg.population;
    const adaptationTrainEpisodesPerArm = adaptationCandidateEvaluationsPerArm * tasks.target.length;
    const adaptationAuditEpisodesPerArm = tasks.source.length * 2 + tasks.target.length * 2 + tasks.holdout.length * 2;
    const armBudgetRows = armRows.map(a => ({ id: a.id, candidateEvaluations: a.stats.candidateEvaluations, trainEpisodes: a.stats.trainEpisodes, auditEpisodes: adaptationAuditEpisodesPerArm, allocatedWork: a.stats.allocatedWork + a.audit.allocatedWork, frozenIntegrity: a.frozenIntegrity }));
    return {
      seed, tier, tierName: P.profiles[tier].name,
      tasks: Object.fromEntries(['source', 'target', 'holdout'].map(k => [k, tasks[k].map(l => ({ id: l.id, title: l.title, signature: V.signature(l), nodes: l.nodes.length, edges: l.edges.length, stations: l.stations.length, relics: l.relics.length }))])),
      donor: { genome: donor, skillSweep: specialist.rows, stats: specialist.stats, sourceRate: donorSource.winRate, targetRate: donorTarget.winRate, holdoutRate: donorHold.winRate },
      baseline: { genome: targetBase, targetRate: baselineDirect.winRate, holdoutRate: baselineHold.winRate, audit: baselineAudit },
      singleRows, pairRows,
      pairSummary: { positiveSynergy: pairRows.filter(x => x.synergyTarget > 1e-12).length, negativeSynergy: pairRows.filter(x => x.synergyTarget < -1e-12).length, negativeTransfer: pairRows.filter(x => x.negativeTransfer).length, meanSynergyTarget: avg(pairRows.map(x => x.synergyTarget)), meanSynergyHoldout: avg(pairRows.map(x => x.synergyHoldout)) },
      freezeSelection: { topModules: topFreeze, randomModules: randomFreeze },
      arms: armRows,
      budget: { directCandidates, directEpisodesPerCandidate, directAllocatedWorkPerRun: directCandidates * directEpisodesPerCandidate * cfg.episodeBudget, adaptationCandidateEvaluationsPerArm, adaptationTrainEpisodesPerArm, adaptationAuditEpisodesPerArm, arms: armBudgetRows, equalCandidateEvaluations: armBudgetRows.every(x => x.candidateEvaluations === adaptationCandidateEvaluationsPerArm), equalTrainEpisodes: armBudgetRows.every(x => x.trainEpisodes === adaptationTrainEpisodesPerArm), equalAllocatedWork: armBudgetRows.every(x => x.allocatedWork === armBudgetRows[0].allocatedWork) }
    };
  }
  function runExperiment(opts, templates, onProgress = () => {}) {
    const seeds = opts.seeds || [1201, 2303, 3407, 4513, 5623];
    const cfg = { generations: Number(opts.generations ?? 3), population: Number(opts.population ?? 4), episodeBudget: Number(opts.episodeBudget ?? 6000) };
    if (!Array.isArray(seeds) || seeds.length < 3 || seeds.length > 8 || seeds.some(s => !Number.isInteger(s) || s < 0 || s > 4294967295)) throw new Error('配对随机种子需为 3–8 个有效整数');
    if (!Number.isInteger(cfg.generations) || cfg.generations < 2 || cfg.generations > 5 || !Number.isInteger(cfg.population) || cfg.population < 4 || cfg.population > 6 || !Number.isInteger(cfg.episodeBudget) || cfg.episodeBudget < 900 || cfg.episodeBudget > 6000) throw new Error('V1.3 实验参数超出范围');
    const runs = [], total = seeds.length * 3;
    for (let si = 0; si < seeds.length; si++) {
      for (let tier = 0; tier < 3; tier++) {
        const run = runOne(seeds[si], tier, templates, cfg);
        runs.push(run);
        onProgress({ completed: runs.length, total, seed: seeds[si], tier, tierName: P.profiles[tier].name });
      }
    }
    const arms = ['scratch', 'transfer_all', 'freeze_top', 'freeze_random'];
    const armSummary = Object.fromEntries(arms.map(id => {
      const rows = runs.flatMap(r => r.arms.filter(a => a.id === id).map(a => ({ ...a, seed: r.seed, tier: r.tier })));
      const integrity = rows.filter(x => x.frozen.length).map(x => Number(x.frozenIntegrity));
      return [id, { name: rows[0].name, ...summarizeRates(rows), meanFrozenCount: avg(rows.map(x => x.frozen.length)), frozenIntegrityRate: integrity.length ? avg(integrity) : null, meanCandidateEvaluations: avg(rows.map(x => x.stats.candidateEvaluations)), meanTrainEpisodes: avg(rows.map(x => x.stats.trainEpisodes)), meanAllocatedWork: avg(rows.map(x => x.stats.allocatedWork + x.audit.allocatedWork)), meanActualWork: avg(rows.map(x => x.stats.actualWork + x.audit.sourceActualWork + x.audit.targetActualWork + x.audit.holdoutActualWork)), budgetStops: sum(rows.map(x => x.stats.budgetStops)) }];
    }));
    const singleSummary = Object.fromEntries(MODULES.map(id => {
      const rows = runs.flatMap(r => r.singleRows.filter(x => x.module === id).map(x => ({ ...x, seed: r.seed, tier: r.tier })));
      return [id, { targetDelta: avg(rows.map(x => x.targetDelta)), holdoutDelta: avg(rows.map(x => x.holdoutDelta)), positiveTargetRuns: rows.filter(x => x.targetDelta > 0).length, negativeTargetRuns: rows.filter(x => x.targetDelta < 0).length, runs: rows.length }];
    }));
    const pairSummary = PAIRS.map(pair => {
      const key = pair.join('+'), rows = runs.flatMap(r => r.pairRows.filter(x => x.modules.join('+') === key).map(x => ({ ...x, seed: r.seed, tier: r.tier })));
      return { modules: pair, meanSynergyTarget: avg(rows.map(x => x.synergyTarget)), meanSynergyHoldout: avg(rows.map(x => x.synergyHoldout)), negativeTransferRate: avg(rows.map(x => Number(x.negativeTransfer))), positiveSynergyRuns: rows.filter(x => x.synergyTarget > 0).length, negativeSynergyRuns: rows.filter(x => x.synergyTarget < 0).length, runs: rows.length };
    });
    const allBudgetRows = runs.flatMap(r => r.budget.arms);
    const budget = { equalCandidateEvaluations: runs.every(r => r.budget.equalCandidateEvaluations), equalTrainEpisodes: runs.every(r => r.budget.equalTrainEpisodes), equalAllocatedWork: runs.every(r => r.budget.equalAllocatedWork), minCandidatesPerArm: Math.min(...allBudgetRows.map(x => x.candidateEvaluations)), maxCandidatesPerArm: Math.max(...allBudgetRows.map(x => x.candidateEvaluations)), minTrainEpisodesPerArm: Math.min(...allBudgetRows.map(x => x.trainEpisodes)), maxTrainEpisodesPerArm: Math.max(...allBudgetRows.map(x => x.trainEpisodes)), minAllocatedWorkPerArm: Math.min(...allBudgetRows.map(x => x.allocatedWork)), maxAllocatedWorkPerArm: Math.max(...allBudgetRows.map(x => x.allocatedWork)), frozenIntegrityRate: avg(allBudgetRows.filter(x => x.frozenIntegrity !== null).map(x => Number(x.frozenIntegrity))) };
    return {
      version: 'V1.3', config: { ...cfg, seeds }, runs,
      summary: { arms: armSummary, singles: singleSummary, pairs: pairSummary, directComposite: { sourceRate: avg(runs.map(r => r.donor.sourceRate)), targetRate: avg(runs.map(r => r.donor.targetRate)), holdoutRate: avg(runs.map(r => r.donor.holdoutRate)), baselineTargetRate: avg(runs.map(r => r.baseline.targetRate)), baselineHoldoutRate: avg(runs.map(r => r.baseline.holdoutRate)) }, negativeTransferPairCount: sum(runs.map(r => r.pairSummary.negativeTransfer)), positiveSynergyPairCount: sum(runs.map(r => r.pairSummary.positiveSynergy)), meanPairSynergyTarget: avg(runs.map(r => r.pairSummary.meanSynergyTarget)), meanPairSynergyHoldout: avg(runs.map(r => r.pairSummary.meanSynergyHoldout)) },
      budget,
      notes: [
        '来源域为 L1/L2；目标适配域为 L3/L4；独立留出为 L5 与两张独立种子生成、求解验证的关卡。留出任务不参与 donor 训练、技能选择、冻结选择或目标进化。',
        '技能单项和两两组合迁移均从同一目标域基线出发，只替换来源域 donor 的相应模块；组合交互量为 pair - singleA - singleB + baseline。',
        '冻结集合在目标域训练前依据目标适配集上的单技能迁移增益选择；随机冻结控制组与高价值冻结组匹配相同冻结模块数量；两者均包含依赖闭包，且逐基因验证不变。',
        '四个目标适配臂使用相同种群大小、代数、候选评估数、训练关卡、每候选局数和单局工作上限；实际工作量仍可能因提前终止而不同。',
        '虚拟玩家为有限前瞻模拟代理；本实验测量算法代理的技能迁移，不等同于真人学习或认知迁移。',
        '种子数与任务数有限；结果是探索性模拟，不能单凭这些结果证明普遍迁移优势或统计显著性。'
      ]
    };
  }
  return { MODULES, PAIRS, makeTaskPack, dependencyClosure, applyFrozen, runExperiment };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MigrationLab;
