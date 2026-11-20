/* V1.2 Modular Cognition Lab. Independent experiment; legacy modules remain untouched. */
const ModularLab = (() => {
  const isNode = typeof module === 'object' && module.exports;
  const E = isNode ? require('./engine.js') : Engine;
  const V = isNode ? require('./evolution.js') : Evolution;
  const P = isNode ? require('./players.js') : Players;
  const clone = x => JSON.parse(JSON.stringify(x));
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const sum = a => a.reduce((s, x) => s + x, 0);
  const cap = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const bits = n => n.toString(2).split('1').length - 1;
  const MODULE_IDS = ['goal', 'route', 'economy', 'explore', 'facility', 'memory', 'recovery'];
  const SKILL_LIBRARY = [
    { id: 'goal', name: '目标追踪', role: '确定当前最重要的收集/终点目标', deps: [], alleles: [
      { id: 'relic_focus', name: '遗物优先' }, { id: 'balanced', name: '均衡推进' }, { id: 'finish_bias', name: '终点偏置' }
    ] },
    { id: 'route', name: '路线规划', role: '选择目标之间的低成本路径', deps: ['goal'], alleles: [
      { id: 'nearest', name: '最近目标' }, { id: 'goal_corridor', name: '出口走廊' }, { id: 'return_safe', name: '返程安全' }
    ] },
    { id: 'economy', name: '资源经济', role: '平衡库存、共鸣设施与资源支出', deps: [], alleles: [
      { id: 'reserve', name: '储备优先' }, { id: 'spend', name: '积极消耗' }, { id: 'echo_hunt', name: '共鸣优先' }
    ] },
    { id: 'explore', name: '探索发现', role: '发现未访问区域', deps: [], alleles: [
      { id: 'frontier', name: '边界探索' }, { id: 'novelty', name: '新区域优先' }, { id: 'cautious', name: '谨慎探索' }
    ] },
    { id: 'facility', name: '设施感知', role: '识别尚未激活的未来节点', deps: [], alleles: [
      { id: 'station_focus', name: '设施优先' }, { id: 'balanced', name: '均衡设施' }, { id: 'station_cautious', name: '谨慎设施' }
    ] },
    { id: 'memory', name: '情景记忆', role: '抑制近期循环与重复状态', deps: [], alleles: [
      { id: 'short_tabu', name: '短期禁忌' }, { id: 'long_tabu', name: '长期禁忌' }, { id: 'anti_cycle', name: '循环抑制' }
    ] },
    { id: 'recovery', name: '恢复规划', role: '评估移动余量并降低陷入局部死路的风险', deps: ['route', 'economy', 'memory'], alleles: [
      { id: 'escape', name: '脱困优先' }, { id: 'reserve', name: '储备恢复' }, { id: 'undo_safe', name: '撤销安全' }
    ] }
  ];
  const DEPENDENCY_GRAPH = [
    { from: 'perception', to: 'goal' }, { from: 'perception', to: 'economy' },
    { from: 'perception', to: 'explore' }, { from: 'perception', to: 'facility' }, { from: 'perception', to: 'memory' },
    { from: 'goal', to: 'route' }, { from: 'route', to: 'recovery' },
    { from: 'economy', to: 'recovery' }, { from: 'memory', to: 'recovery' }
  ];
  const DEFAULT_ALLELE = Object.fromEntries(SKILL_LIBRARY.map(m => [m.id, m.alleles[0].id]));
  const LIB = Object.fromEntries(SKILL_LIBRARY.map(m => [m.id, m]));

  function legacyWeights(tier) {
    const p = P.profiles[tier];
    return [1, 0, p.resource, p.explore, .6, .9, 0];
  }
  function makeGenome(arch, tier, rng, variant = false) {
    const base = legacyWeights(tier);
    if (arch === 'flat') {
      const weights = base.map((w, i) => cap(w + (variant ? (rng() - .5) * (i === 0 ? .9 : .7) : 0), -2.2, 2.2));
      return { arch, tier, weights, id: `F${Math.floor(rng() * 1e9).toString(36)}` };
    }
    const modules = {};
    SKILL_LIBRARY.forEach((m, i) => {
      const on = !variant || rng() > (m.id === 'goal' ? .05 : .22);
      modules[m.id] = {
        enabled: on,
        weight: cap(base[i] + (variant ? (rng() - .5) * .9 : 0), -2.2, 2.2),
        allele: variant ? m.alleles[Math.floor(rng() * m.alleles.length)].id : DEFAULT_ALLELE[m.id],
        threshold: variant ? (rng() - .5) * 3 : -40
      };
    });
    return repairGenome({ arch, tier, modules, id: `M${Math.floor(rng() * 1e9).toString(36)}` });
  }
  function repairGenome(g) {
    const x = clone(g);
    if (x.arch !== 'modular') return x;
    for (const m of SKILL_LIBRARY) {
      if (!x.modules[m.id]) x.modules[m.id] = { enabled: false, weight: 0, allele: DEFAULT_ALLELE[m.id], threshold: -40 };
      const gene = x.modules[m.id];
      if (!m.alleles.some(a => a.id === gene.allele)) gene.allele = DEFAULT_ALLELE[m.id];
      gene.weight = cap(Number(gene.weight) || 0, -2.2, 2.2);
      gene.threshold = cap(Number(gene.threshold) || 0, -8, 8);
    }
    // A dependent skill cannot remain active if any prerequisite is absent.
    if (!x.modules.goal.enabled) x.modules.route.enabled = false;
    if (!x.modules.route.enabled || !x.modules.economy.enabled || !x.modules.memory.enabled) x.modules.recovery.enabled = false;
    return x;
  }
  function dependencyViolations(g) {
    if (g.arch !== 'modular') return [];
    const out = [];
    for (const edge of DEPENDENCY_GRAPH) {
      if (edge.from === 'perception') continue;
      if (g.modules[edge.to].enabled && !g.modules[edge.from].enabled) out.push(`${edge.from}->${edge.to}`);
    }
    return out;
  }
  function mutateGenome(parent, rng) {
    const g = clone(parent);
    if (g.arch === 'flat') {
      const i = Math.floor(rng() * g.weights.length);
      g.weights[i] = cap(g.weights[i] + (rng() - .5) * (i === 0 ? 1.0 : .8), -2.2, 2.2);
    } else {
      const id = MODULE_IDS[Math.floor(rng() * MODULE_IDS.length)], gene = g.modules[id], m = LIB[id], op = Math.floor(rng() * 4);
      if (op === 0) gene.weight = cap(gene.weight + (rng() - .5) * 1.0, -2.2, 2.2);
      else if (op === 1) gene.allele = m.alleles[Math.floor(rng() * m.alleles.length)].id;
      else if (op === 2) {
        gene.enabled = !gene.enabled;
        if (gene.enabled) {
          if (id === 'route') g.modules.goal.enabled = true;
          if (id === 'recovery') ['route', 'goal', 'economy', 'memory'].forEach(k => g.modules[k].enabled = true);
        }
      } else gene.threshold = cap(gene.threshold + (rng() - .5) * 3, -8, 8);
    }
    g.id = `${g.arch[0].toUpperCase()}${Math.floor(rng() * 1e9).toString(36)}`;
    return g.arch === 'modular' ? repairGenome(g) : g;
  }
  function crossoverGenome(a, b, rng) {
    if (a.arch !== b.arch || a.tier !== b.tier) throw Error('incompatible genomes');
    if (a.arch === 'flat') {
      return { arch: 'flat', tier: a.tier, weights: a.weights.map((v, i) => cap(rng() < .5 ? v : b.weights[i], -2.2, 2.2)), id: 'F-cross' };
    }
    const modules = {};
    for (const id of MODULE_IDS) modules[id] = clone(rng() < .5 ? a.modules[id] : b.modules[id]);
    return repairGenome({ arch: 'modular', tier: a.tier, modules, id: 'M-cross' });
  }
  function genomeDistance(a, b) {
    if (a.arch !== b.arch) return 1;
    if (a.arch === 'flat') return avg(a.weights.map((v, i) => Math.abs(v - b.weights[i]) / 4.4));
    return avg(MODULE_IDS.map(id => {
      const x = a.modules[id], y = b.modules[id];
      return .4 * Number(x.enabled !== y.enabled) + .35 * Math.abs(x.weight - y.weight) / 4.4 + .15 * Number(x.allele !== y.allele) + .1 * Math.abs(x.threshold - y.threshold) / 16;
    }));
  }
  function alleleFeature(id, allele, base, ctx) {
    const { s, l, dist, targetDist, goalDist, startDist, inv, echoes, newNode, station, recentCount, recentLong, mobility, missing } = ctx;
    if (id === 'goal') {
      if (allele === 'balanced') return 4.8 * bits(s.relicMask) - .9 * targetDist;
      if (allele === 'finish_bias') return 5.5 * bits(s.relicMask) - 1.25 * (missing.length ? targetDist : goalDist);
      return base;
    }
    if (id === 'route') {
      if (allele === 'goal_corridor') return -goalDist + .35 * missing.length;
      if (allele === 'return_safe') return -targetDist - .35 * startDist;
      return -targetDist;
    }
    if (id === 'economy') {
      if (allele === 'spend') return -.5 * inv + .6 * echoes;
      if (allele === 'echo_hunt') return .4 * inv + 1.2 * echoes;
      return inv + .8 * echoes;
    }
    if (id === 'explore') {
      if (allele === 'station') return .3 * Number(newNode) + Number(station);
      if (allele === 'novelty') return Number(newNode) + .1 * Number(recentCount === 0);
      if (allele === 'cautious') return .7 * Number(newNode);
      return Number(newNode);
    }
    if (id === 'facility') {
      if (allele === 'balanced') return .8 * Number(station);
      if (allele === 'station_cautious') return .4 * Number(station);
      return Number(station);
    }
    if (id === 'memory') {
      if (allele === 'long_tabu') return -recentLong;
      if (allele === 'anti_cycle') return -1.4 * recentCount - .2 * Number(recentCount > 0);
      return -recentCount;
    }
    if (id === 'recovery') {
      if (allele === 'reserve') return .5 * inv + .4 * echoes - .2 * targetDist;
      if (allele === 'undo_safe') return .6 * mobility - .2 * recentCount - .1 * startDist;
      return mobility - .15 * startDist;
    }
    return base;
  }
  function featureVector(l, s, ctx, dist) {
    const missing = l.relics.filter((_, i) => !(s.relicMask & (1 << i)));
    const target = missing.length ? missing.reduce((best, n) => dist[s.node][n] < dist[s.node][best] ? n : best, missing[0]) : l.goal;
    const targetDist = dist[s.node][target], goalDist = dist[s.node][l.goal], startDist = dist[s.node][0];
    const inv = sum(s.inventory), echoes = E.echoes(l, s).size;
    const station = l.stations.some(([n], i) => n === s.node && s.choices[i] === -1);
    const stateKey = E.key(s), recentCount = ctx.recent.filter(k => k === stateKey).length;
    const recentLong = ctx.recentLong.filter(k => k === stateKey).length;
    const mobility = Math.min(4, E.actions(l, s).length) / 4;
    const baseGoal = 6 * bits(s.relicMask) - 1.1 * targetDist;
    return {
      goal: baseGoal,
      route: -targetDist,
      economy: inv + echoes * .8,
      explore: Number(!ctx.nodeSeen.has(s.node)),
      facility: Number(station),
      memory: -recentCount,
      recovery: mobility - .15 * startDist,
      ctx: { s, l, dist, targetDist, goalDist, startDist, inv, echoes, newNode: !ctx.nodeSeen.has(s.node), station, recentCount, recentLong, mobility, missing }
    };
  }
  function v14ContextValue(feature, c) {
    const l = c.l, nodeN = Math.max(1, l.nodes.length), edgeN = Math.max(1, l.edges.length);
    const stationN = l.stations.length, gateN = Object.values(l.gates || {}).reduce((n, xs) => n + xs.length, 0);
    const relicN = Math.max(1, l.relics.length);
    const progress = 1 - c.missing.length / relicN;
    const complexity = Math.min(1, .35 * (l.nodes.length / 10) + .25 * (l.edges.length / 18) + .2 * (stationN / 6) + .2 * (gateN / 6));
    const values = {
      inventory: c.inv, echoes: c.echoes, scarcity: 1 / (1 + c.inv + c.echoes),
      novelty: Number(c.newNode), loopRisk: Math.min(1, c.recentCount / 2 + c.recentLong / 8),
      mobility: c.mobility, targetDistance: Math.min(1, c.targetDist / 8),
      goalProgress: progress, station: Number(c.station), stationDensity: stationN / nodeN,
      edgeDensity: edgeN / nodeN, complexity, recoveryRisk: Math.min(1, .55 * (1 - c.mobility) + .45 * c.targetDist / 8),
      relicsRemaining: c.missing.length
    };
    return Number(values[feature] ?? 0);
  }
  function v14GateActivation(id, controller, c) {
    if (!controller || !controller.enabled || id === 'goal') return 1;
    const rule = controller.gates?.[id];
    let activation = 1;
    if (rule && rule.enabled !== false) {
      const x = v14ContextValue(rule.feature, c);
      const signed = rule.op === 'lte' ? rule.threshold - x : x - rule.threshold;
      const z = Math.max(-24, Math.min(24, signed * rule.slope));
      const soft = 1 / (1 + Math.exp(-z));
      activation = rule.floor + (1 - rule.floor) * soft;
    }
    for (const q of controller.quarantine || []) {
      if (q.module !== id) continue;
      const x = v14ContextValue(q.feature, c);
      const match = q.op === 'lte' ? x <= q.threshold : x >= q.threshold;
      if (match) activation = Math.min(activation, q.floor ?? 0.02);
    }
    return Math.max(0, Math.min(1, activation));
  }
  const V17_FEATURES = ['progress','remaining','targetDistance','goalDistance','startDistance','inventory','echoes','scarcity','novelty','station','loopRisk','mobility','recoveryRisk','routeSlack','complexity'];
  function skillFeatureVector(c) {
    const l=c.l, relicN=Math.max(1,l.relics.length), nodeN=Math.max(1,l.nodes.length), edgeN=Math.max(1,l.edges.length);
    const progress=1-c.missing.length/relicN;
    const complexity=Math.min(1,.35*(l.nodes.length/10)+.25*(l.edges.length/18)+.2*(l.stations.length/6)+.2*(Object.values(l.gates||{}).reduce((n,x)=>n+x.length,0)/6));
    return {progress,remaining:c.missing.length/relicN,targetDistance:Math.min(1,c.targetDist/8),goalDistance:Math.min(1,c.goalDist/8),startDistance:Math.min(1,c.startDist/8),inventory:Math.min(1,c.inv/8),echoes:Math.min(1,c.echoes/6),scarcity:1/(1+c.inv+c.echoes),novelty:Number(c.newNode),station:Number(c.station),loopRisk:Math.min(1,c.recentCount/2+c.recentLong/8),mobility:c.mobility,recoveryRisk:Math.min(1,.55*(1-c.mobility)+.45*c.targetDist/8),routeSlack:Math.max(-1,Math.min(1,(c.targetDist-c.goalDist)/8)),complexity};
  }
  function runV17Bytecode(skill, features) {
    const stack=[];
    for(const ins of skill.bytecode||[]){
      if(ins.op==='PUSH_FEATURE') stack.push(Number(features[ins.name]||0));
      else if(ins.op==='PUSH_CONST') stack.push(ins.value);
      else if(ins.op==='GT'||ins.op==='GTE'||ins.op==='LT'||ins.op==='LTE'){const b=stack.pop(),a=stack.pop();stack.push(ins.op==='GT'?a>b:ins.op==='GTE'?a>=b:ins.op==='LT'?a<b:a<=b);}
      else if(ins.op==='AND'||ins.op==='OR'){const n=ins.count,vals=stack.splice(stack.length-n,n);stack.push(ins.op==='AND'?vals.every(Boolean):vals.some(Boolean));}
      else if(ins.op==='NOT') stack.push(!stack.pop());
      else if(ins.op==='LINEAR'){let v=ins.bias;for(const t of ins.terms)v+=Number(features[t.feature]||0)*t.weight;stack.push(v);}
      else if(ins.op==='TANH') stack.push(Math.tanh(Number(stack.pop())||0));
      else if(ins.op==='SCALE') stack.push((Number(stack.pop())||0)*ins.value);
      else if(ins.op==='GATE'){const value=stack.pop(),gate=stack.pop();stack.push(gate?value:0);}
      else if(ins.op==='EMIT') return Number(stack.pop())||0;
      else throw Error('未知 V1.7 字节码指令：'+ins.op);
      if(stack.length>32) throw Error('V1.7 字节码栈溢出');
    }
    return 0;
  }
  function scoreState(l, s, ctx, dist, genome, budget) {
    const v14 = genome.v14 || null;
    const v17 = genome.v17 || null;
    const skillCost = v17 ? Number(v17.slotBudget || 0) * Number(v17.costPerSlot || 0) : 0;
    const scoringCost = (v14 ? Number(v14.budgetCost || 26) : MODULE_IDS.length) + skillCost;
    if (budget.used + scoringCost > budget.limit) return null;
    budget.used += scoringCost; budget.featureCalls++;
    const f = featureVector(l, s, ctx, dist), values = {};
    let score = 0;
    if (genome.arch === 'flat') {
      MODULE_IDS.forEach((id, i) => { values[id] = f[id]; score += genome.weights[i] * f[id]; });
      return { score, values };
    }
    // Preserve the original V1.2/V1.3 scoring path exactly for legacy genomes.
    if (!v14) {
      MODULE_IDS.forEach(id => {
        const gene = genome.modules[id], value = alleleFeature(id, gene.allele, f[id], f.ctx);
        values[id] = value;
        if (gene.enabled) {
          const gate = .5 + .5 * Math.tanh((value - gene.threshold) / 4);
          score += gene.weight * value * gate;
        }
      });
      return { score, values };
    }
    const gates = {}, raw = {};
    MODULE_IDS.forEach(id => {
      const gene = genome.modules[id];
      raw[id] = alleleFeature(id, gene.allele, f[id], f.ctx);
      gates[id] = gene.enabled ? v14GateActivation(id, v14.controller, f.ctx) : 0;
    });
    const incoming = Object.fromEntries(MODULE_IDS.map(id => [id, 0]));
    if (v14.topology?.enabled) {
      for (const edge of v14.topology.edges || []) {
        if (!edge.enabled || !(edge.from in incoming) || !(edge.to in incoming)) continue;
        incoming[edge.to] += edge.weight * Math.tanh(raw[edge.from] / 4) * gates[edge.from];
        budget.edgeEvaluations = (budget.edgeEvaluations || 0) + 1;
      }
    }
    for (const id of MODULE_IDS) {
      const gene = genome.modules[id], value = raw[id] + incoming[id];
      values[id] = value;
      if (gates[id] > 0) {
        const soft = .5 + .5 * Math.tanh((value - gene.threshold) / 4);
        score += gene.weight * value * soft * gates[id];
      }
      if (v14.controller?.enabled) {
        budget.gateEvaluations = (budget.gateEvaluations || 0) + 1;
        if (gates[id] >= .5) budget.gateActive = (budget.gateActive || 0) + 1;
      }
    }
    if (v17 && Array.isArray(v17.skills) && v17.skills.length) {
      const features = skillFeatureVector(f.ctx), outputs = {};
      for (const skill of v17.skills) {
        if (!skill || skill.enabled === false) continue;
        const runtimeFeatures = { ...features };
        for (const [id, value] of Object.entries(outputs)) runtimeFeatures['module:' + id] = value;
        const output = runV17Bytecode(skill, runtimeFeatures);
        outputs[skill.id] = output; score += output;
        budget.skillEvaluations = (budget.skillEvaluations || 0) + 1;
      }
    }
    return { score, values, gates, v17Features: v17 ? skillFeatureVector(f.ctx) : null };
  }
  function legalTransitions(l, s, budget) {
    const out = [];
    for (const a of E.actions(l, s)) {
      if (budget.used + 1 > budget.limit) return { out, complete: false };
      budget.used++; budget.expansions++;
      const t = E.step(l, s, a);
      if (t.ok) out.push({ a, s: t.state });
    }
    return { out, complete: true };
  }
  const actionKey = a => `${a.kind}:${a.index}:${a.option ?? '-'}`;
  function playEpisode(l, genome, seed, budgetUnits = 1800) {
    const p = P.profiles[genome.tier], rnd = V.rng(seed), dist = P.prepare(l);
    const budget = { used: 0, limit: budgetUnits, expansions: 0, featureCalls: 0, gateEvaluations: 0, gateActive: 0, edgeEvaluations: 0 };
    let s = E.initial(l), stack = [s], recent = [E.key(s)], recentLong = [E.key(s)], banned = new Map(), undos = 0, attempts = 0, reason = 'budget', peak = bits(s.relicMask);
    const nodeSeen = new Set([s.node]), lastActions = [];
    const context = () => ({ nodeSeen, recent, recentLong });
    function rate(first, ctx) {
      const initialScore = scoreState(l, first.s, ctx, dist, genome, budget);
      if (!initialScore) return { complete: false, value: -Infinity };
      let beam = [{ s: first.s, score: initialScore.score, seen: new Set([E.key(s), E.key(first.s)]) }], best = beam[0].score;
      for (let depth = 1; depth < p.depth; depth++) {
        const next = [];
        for (const b of beam) {
          const legal = legalTransitions(l, b.s, budget);
          if (!legal.complete) return { complete: false, value: best };
          for (const t of legal.out) {
            const key = E.key(t.s);
            if (b.seen.has(key)) continue;
            const val = scoreState(l, t.s, ctx, dist, genome, budget);
            if (!val) return { complete: false, value: best };
            const value = val.score - .22 * depth;
            next.push({ s: t.s, score: value, seen: new Set([...b.seen, key]) });
            best = Math.max(best, value);
          }
        }
        if (!next.length) break;
        next.sort((a, b) => b.score - a.score);
        beam = next.slice(0, p.width);
      }
      return { complete: true, value: best };
    }
    while (attempts < p.steps) {
      if (E.won(l, s)) { reason = 'win'; break; }
      const key = E.key(s), blocked = banned.get(key) || new Set();
      let legal = legalTransitions(l, s, budget);
      if (!legal.complete) { reason = 'compute_budget'; break; }
      let moves = legal.out.filter(t => !blocked.has(actionKey(t.a)));
      const nonLoop = moves.filter(t => !recent.slice(-p.memory).includes(E.key(t.s)));
      if (nonLoop.length) moves = nonLoop;
      else if (undos < p.undo && stack.length > 1) moves = [];
      if (!moves.length) {
        if (undos < p.undo && stack.length > 1) {
          const prev = stack[stack.length - 2], pk = E.key(prev);
          if (!banned.has(pk)) banned.set(pk, new Set());
          const last = lastActions.pop(); if (last) banned.get(pk).add(actionKey(last));
          stack.pop(); s = prev; undos++; attempts++;
          recent.push(E.key(s)); recentLong.push(E.key(s));
          if (recent.length > p.memory) recent.shift();
          if (recentLong.length > p.memory * 3) recentLong.shift();
          continue;
        }
        reason = 'stuck'; break;
      }
      const ranked = [];
      for (const t of moves) {
        const result = rate(t, context());
        if (!result.complete) { reason = 'compute_budget'; break; }
        ranked.push({ ...t, value: result.value });
      }
      if (reason === 'compute_budget') break;
      const max = Math.max(...ranked.map(t => t.value));
      const weights = ranked.map(t => Math.exp((t.value - max) / p.temp));
      let roll = rnd() * sum(weights), i = 0;
      while (i < weights.length - 1 && (roll -= weights[i]) > 0) i++;
      const chosen = ranked[i];
      s = chosen.s; stack.push(s); lastActions.push(chosen.a); nodeSeen.add(s.node);
      recent.push(E.key(s)); recentLong.push(E.key(s));
      if (recent.length > p.memory) recent.shift();
      if (recentLong.length > p.memory * 3) recentLong.shift();
      attempts++; peak = Math.max(peak, bits(s.relicMask));
    }
    if (E.won(l, s)) reason = 'win';
    return { win: reason === 'win', reason, attempts, undos, peak, visited: nodeSeen.size, workUnits: budget.used, allocatedUnits: budgetUnits, expansions: budget.expansions, featureCalls: budget.featureCalls, gateEvaluations: budget.gateEvaluations, gateActive: budget.gateActive, edgeEvaluations: budget.edgeEvaluations, skillEvaluations: budget.skillEvaluations || 0, utilization: budget.used / budgetUnits };
  }
  function evaluateGenome(levels, genome, seeds, budgetUnits) {
    const runs = [];
    for (let li = 0; li < levels.length; li++) for (let si = 0; si < seeds.length; si++) runs.push(playEpisode(levels[li], genome, seeds[si], budgetUnits));
    const n = Math.max(1, runs.length), p = P.profiles[genome.tier];
    const winRate = runs.filter(x => x.win).length / n;
    const meanAttempts = avg(runs.map(x => x.attempts / p.steps));
    const meanUndos = avg(runs.map(x => x.undos / Math.max(1, p.undo)));
    const fitness = winRate - .025 * meanAttempts - .015 * meanUndos;
    return { fitness, winRate, meanAttempts, meanUndos, runs, workUnits: sum(runs.map(x => x.workUnits)), allocatedUnits: runs.length * budgetUnits, budgetStops: runs.filter(x => x.reason === 'compute_budget').length };
  }
  function initPopulation(arch, tier, size, rng) {
    const pop = [makeGenome(arch, tier, rng, false)], base = legacyWeights(tier);
    while (pop.length < size) {
      // Consume the same four random draws per skill slot in both architectures.
      // Flat genomes use only the weight draw; modular genomes also use enable/allele/threshold.
      const draws = Array.from({ length: MODULE_IDS.length }, () => [rng(), rng(), rng(), rng()]);
      if (arch === 'flat') {
        pop.push({ arch, tier, weights: base.map((w, i) => cap(w + (draws[i][1] - .5) * (i === 0 ? .9 : .7), -2.2, 2.2)), id: `F${Math.floor(rng() * 1e9).toString(36)}` });
      } else {
        const modules = {};
        SKILL_LIBRARY.forEach((m, i) => {
          const [enableDraw, weightDraw, alleleDraw, thresholdDraw] = draws[i];
          modules[m.id] = {
            enabled: enableDraw > (m.id === 'goal' ? .05 : .22),
            weight: cap(base[i] + (weightDraw - .5) * (i === 0 ? .9 : .7), -2.2, 2.2),
            allele: m.alleles[Math.floor(alleleDraw * m.alleles.length)].id,
            threshold: (thresholdDraw - .5) * 3
          };
        });
        pop.push(repairGenome({ arch, tier, modules, id: `M${Math.floor(rng() * 1e9).toString(36)}` }));
      }
    }
    return pop;
  }
  function tournament(pop, fitness, rng) {
    const a = pop[Math.floor(rng() * pop.length)], b = pop[Math.floor(rng() * pop.length)];
    return fitness.get(a) >= fitness.get(b) ? a : b;
  }
  function evolvePopulation(pop, fitness, arch, rng) {
    const ranked = [...pop].sort((a, b) => fitness.get(b) - fitness.get(a));
    const next = [clone(ranked[0]), clone(ranked[1])];
    while (next.length < pop.length) {
      const pa = tournament(ranked.slice(0, Math.max(3, Math.ceil(ranked.length * .65))), fitness, rng);
      const pb = tournament(ranked.slice(0, Math.max(3, Math.ceil(ranked.length * .65))), fitness, rng);
      let child = crossoverGenome(pa, pb, rng);
      child = mutateGenome(child, rng);
      next.push(arch === 'modular' ? repairGenome(child) : child);
    }
    return next;
  }
  function pairwiseDiversity(pop) {
    if (pop.length < 2) return 0;
    const d = [];
    for (let i = 0; i < pop.length; i++) for (let j = i + 1; j < pop.length; j++) d.push(genomeDistance(pop[i], pop[j]));
    return avg(d);
  }
  function makeGenerated(seed, title, forbidden) {
    const rng = V.rng(seed);
    for (let attempt = 0; attempt < 300; attempt++) {
      const l = V.procedural(rng); l.id = `PROC_${title.replace(/\W/g, '')}_${attempt}`; l.title = title;
      try {
        E.validate(l);
        const sig = V.signature(l);
        if (forbidden.has(sig)) continue;
        const s = E.search(l, E.initial(l), null, 'full', 10000);
        if (s.complete && s.route) { forbidden.add(sig); return l; }
      } catch (_) {}
    }
    throw Error(`无法生成可解的独立关卡：${title}`);
  }
  function makeTaskPack(seed, generations, templates) {
    if (!Array.isArray(templates) || templates.length < 5) throw Error('需要五个正式关卡模板');
    const forbidden = new Set(templates.map(V.signature));
    const trainA = makeGenerated((seed ^ 0x1142a) >>> 0, '训练遗迹 A', forbidden);
    const trainB = makeGenerated((seed ^ 0x2253b) >>> 0, '训练遗迹 B', forbidden);
    const holdA = makeGenerated((seed ^ 0x3364c) >>> 0, '独立留出 A', forbidden);
    const holdB = makeGenerated((seed ^ 0x4475d) >>> 0, '独立留出 B', forbidden);
    const stages = [[templates[0], templates[1]], [templates[2], templates[3]], [templates[4], trainA], [trainB, templates[3]]];
    return { stages, anchor: [templates[0], templates[1]], holdout: [holdA, holdB], signatures: { train: [...stages.flat().map(V.signature)], holdout: [V.signature(holdA), V.signature(holdB)] } };
  }
  function seedList(seed, salt, n) { const r = V.rng((seed ^ salt) >>> 0), a = []; for (let i = 0; i < n; i++) a.push(Math.floor(r() * 4294967296)); return a; }
  function createConfig(opts, templates) {
    const seed = Number(opts.seed ?? 42), generations = Number(opts.generations ?? 6), population = Number(opts.population ?? 6), episodeBudget = Number(opts.episodeBudget ?? 1800), trainN = Number(opts.trainN ?? 2), auditN = Number(opts.auditN ?? 4);
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295 || !Number.isInteger(generations) || generations < 3 || generations > 12 || !Number.isInteger(population) || population < 4 || population > 10 || !Number.isInteger(episodeBudget) || episodeBudget < 600 || episodeBudget > 6000 || !Number.isInteger(trainN) || trainN < 1 || trainN > 4 || !Number.isInteger(auditN) || auditN < 2 || auditN > 12) throw Error('实验参数超出允许范围');
    const tasks = makeTaskPack(seed, generations, templates), trainSeeds = Array.from({ length: generations }, (_, g) => seedList(seed, 0x510001 + g, trainN));
    const anchorSeeds = seedList(seed, 0x610002, auditN), holdSeeds = seedList(seed, 0x710003, auditN);
    const contexts = {};
    for (const arch of ['flat', 'modular']) {
      const rng = V.rng((seed ^ 0x8192a) >>> 0);
      contexts[arch] = { rng, tiers: P.profiles.map((_, tier) => ({ pop: initPopulation(arch, tier, population, rng), history: [], anchorSeries: [], fitness: null, finalGenome: null, holdout: null, anchorFinal: null, finalPopulation: null })), stats: { candidateEvaluations: 0, trainEpisodes: 0, auditEpisodes: 0, holdoutEpisodes: 0, actualWorkUnits: 0, allocatedWorkUnits: 0, budgetStops: 0, featureCalls: 0, expansions: 0 } };
    }
    const stats = { generation: 0, totalCandidateEvaluations: 0, totalEpisodes: 0 };
    let generation = 0, finished = null;
    function processTier(arch, tier, g) {
      const ctx = contexts[arch], t = ctx.tiers[tier], stageIndex = Math.min(3, Math.floor(g * 4 / generations)), levels = tasks.stages[stageIndex], seeds = trainSeeds[g];
      const scored = [];
      for (const genome of t.pop) {
        const e = evaluateGenome(levels, genome, seeds, episodeBudget);
        scored.push({ genome, ...e });
        ctx.stats.candidateEvaluations++; ctx.stats.trainEpisodes += e.runs.length; ctx.stats.actualWorkUnits += e.workUnits; ctx.stats.allocatedWorkUnits += e.allocatedUnits; ctx.stats.budgetStops += e.budgetStops; ctx.stats.featureCalls += sum(e.runs.map(x => x.featureCalls)); ctx.stats.expansions += sum(e.runs.map(x => x.expansions));
      }
      scored.sort((a, b) => b.fitness - a.fitness);
      const best = scored[0], anchor = evaluateGenome(tasks.anchor, best.genome, anchorSeeds, episodeBudget);
      ctx.stats.auditEpisodes += anchor.runs.length; ctx.stats.actualWorkUnits += anchor.workUnits; ctx.stats.allocatedWorkUnits += anchor.allocatedUnits; ctx.stats.budgetStops += anchor.budgetStops; ctx.stats.featureCalls += sum(anchor.runs.map(x => x.featureCalls)); ctx.stats.expansions += sum(anchor.runs.map(x => x.expansions));
      t.history.push({ generation: g + 1, stage: stageIndex, trainRate: best.winRate, trainFitness: best.fitness, anchorRate: anchor.winRate, anchorAttempts: anchor.meanAttempts, diversity: pairwiseDiversity(t.pop), activeModules: best.genome.arch === 'modular' ? MODULE_IDS.filter(id => best.genome.modules[id].enabled).length : 6, bestGenome: clone(best.genome) });
      t.anchorSeries.push(anchor.winRate);
      t.fitness = new Map(scored.map(x => [x.genome, x.fitness]));
      if (g < generations - 1) t.pop = evolvePopulation(t.pop, t.fitness, arch, ctx.rng);
      else { t.finalGenome = clone(best.genome); t.finalPopulation = clone(t.pop); }
      ctx.stats.actualWorkUnits += 0;
    }
    function tick() {
      if (generation >= generations) return false;
      for (const arch of ['flat', 'modular']) for (let tier = 0; tier < 3; tier++) processTier(arch, tier, generation);
      generation++; stats.generation = generation;
      stats.totalCandidateEvaluations = contexts.flat.stats.candidateEvaluations + contexts.modular.stats.candidateEvaluations;
      stats.totalEpisodes = contexts.flat.stats.trainEpisodes + contexts.modular.stats.trainEpisodes;
      return true;
    }
    function finalize() {
      if (finished) return finished;
      const results = {};
      for (const arch of ['flat', 'modular']) {
        const ctx = contexts[arch];
        results[arch] = { tiers: [], stats: clone(ctx.stats) };
        for (let tier = 0; tier < 3; tier++) {
          const t = ctx.tiers[tier], h = evaluateGenome(tasks.holdout, t.finalGenome, holdSeeds, episodeBudget), a = evaluateGenome(tasks.anchor, t.finalGenome, anchorSeeds, episodeBudget);
          ctx.stats.holdoutEpisodes += h.runs.length; ctx.stats.auditEpisodes += a.runs.length; ctx.stats.actualWorkUnits += h.workUnits + a.workUnits; ctx.stats.allocatedWorkUnits += h.allocatedUnits + a.allocatedUnits; ctx.stats.budgetStops += h.budgetStops + a.budgetStops; ctx.stats.featureCalls += sum([...h.runs, ...a.runs].map(x => x.featureCalls)); ctx.stats.expansions += sum([...h.runs, ...a.runs].map(x => x.expansions));
          const hist = t.history, firstAnchor = hist[0].anchorRate, lastAnchor = hist.at(-1).anchorRate;
          const finalModules = arch === 'modular' ? MODULE_IDS.filter(id => t.finalGenome.modules[id].enabled) : MODULE_IDS;
          const coverage = arch === 'modular' ? MODULE_IDS.filter(id => t.finalPopulation.some(g => g.modules[id].enabled)) : MODULE_IDS;
          results[arch].tiers.push({ tier, name: P.profiles[tier].name, finalGenome: clone(t.finalGenome), finalPopulation: clone(t.finalPopulation), history: clone(hist), anchorInitial: firstAnchor, anchorFinal: a.winRate, anchorForgetting: Math.max(0, firstAnchor - a.winRate), anchorDelta: a.winRate - firstAnchor, holdout: h.winRate, holdoutRuns: h.runs.length, trainFinal: hist.at(-1).trainRate, diversity: pairwiseDiversity(t.finalPopulation), activeModules: finalModules, moduleCoverage: coverage, dependencyViolations: arch === 'modular' ? dependencyViolations(t.finalGenome) : [] });
        }
        results[arch].stats = clone(ctx.stats);
        results[arch].meanAnchorForgetting = avg(results[arch].tiers.map(x => x.anchorForgetting));
        results[arch].meanAnchorDelta = avg(results[arch].tiers.map(x => x.anchorDelta));
        results[arch].meanHoldout = avg(results[arch].tiers.map(x => x.holdout));
        results[arch].meanTrain = avg(results[arch].tiers.map(x => x.trainFinal));
        results[arch].meanDiversity = avg(results[arch].tiers.map(x => x.diversity));
        results[arch].activeSkillCoverage = arch === 'modular' ? new Set(results[arch].tiers.flatMap(x => x.moduleCoverage)).size : MODULE_IDS.length;
        results[arch].meanActiveModules = avg(results[arch].tiers.map(x => x.activeModules.length));
        results[arch].moduleUsage = arch === 'modular' ? Object.fromEntries(MODULE_IDS.map(id => [id, results[arch].tiers.filter(t => t.finalGenome.modules[id].enabled).length / 3])) : Object.fromEntries(MODULE_IDS.map(id => [id, 1]));
      }
      const expectedCandidateEvals = generations * population * 3;
      const expectedTrainEpisodes = expectedCandidateEvals * 2 * trainN;
      const expectedAuditEpisodes = (generations + 1) * 3 * 2 * auditN;
      const expectedHoldEpisodes = 3 * 2 * auditN;
      const expectedAllocated = (expectedTrainEpisodes + expectedAuditEpisodes + expectedHoldEpisodes) * episodeBudget;
      const sameAllocation = ['flat', 'modular'].every(a => contexts[a].stats.candidateEvaluations === expectedCandidateEvals && contexts[a].stats.trainEpisodes === expectedTrainEpisodes && contexts[a].stats.auditEpisodes === expectedAuditEpisodes && contexts[a].stats.holdoutEpisodes === expectedHoldEpisodes && contexts[a].stats.allocatedWorkUnits === expectedAllocated);
      finished = { version: 'V1.2', seed, generations, population, episodeBudget, trainN, auditN, tasks: { stages: tasks.stages.map(s => s.map(l => ({ id: l.id, title: l.title, signature: V.signature(l) }))), anchor: tasks.anchor.map(l => ({ id: l.id, title: l.title, signature: V.signature(l) })), holdout: tasks.holdout.map(l => ({ id: l.id, title: l.title, signature: V.signature(l) })) }, trainSeeds, anchorSeeds, holdSeeds, results, comparison: { equalCandidateEvaluations: sameAllocation, equalEpisodeAllocation: contexts.flat.stats.trainEpisodes === contexts.modular.stats.trainEpisodes && contexts.flat.stats.auditEpisodes === contexts.modular.stats.auditEpisodes && contexts.flat.stats.holdoutEpisodes === contexts.modular.stats.holdoutEpisodes, equalAllocatedWork: contexts.flat.stats.allocatedWorkUnits === contexts.modular.stats.allocatedWorkUnits && contexts.flat.stats.allocatedWorkUnits === expectedAllocated, allocatedWorkPerArchitecture: expectedAllocated, flatActualWork: results.flat.stats.actualWorkUnits, modularActualWork: results.modular.stats.actualWorkUnits }, notes: ['平坦架构与模块架构使用相同种子、任务、种群大小、候选评估数、每局工作上限和固定七维特征提取预算。', 'allocatedWork 是相同的上限预算；actualWork 会因提前通关、卡住或计算预算耗尽而不同，不能宣称实际 CPU 时间完全相等。', '固定锚点包含早期训练任务，仅用于观察后续遗忘；holdout 为独立生成且从未进入训练选择的关卡。', '虚拟玩家是有限前瞻规则代理，不是真人模型；成功率不是用户体验指标。', '模块基因的依赖约束是可执行结构约束，不代表已证明的认知神经机制。'] };
      return finished;
    }
    function snapshot(done = false) {
      if (done) { if (generation < generations) throw Error('实验尚未完成'); return finalize(); }
      return { version: 'V1.2', seed, generation, generations, population, episodeBudget, stats: clone(stats), progress: generation / generations, partial: Object.fromEntries(['flat', 'modular'].map(arch => [arch, contexts[arch].tiers.map(t => t.history)])) };
    }
    return { tick, snapshot, stop() { return snapshot(false); } };
  }
  function runConfig(opts, templates) { const c = createConfig(opts, templates); while (c.tick()) {} return c.snapshot(true); }
  return { MODULE_IDS, SKILL_LIBRARY, DEPENDENCY_GRAPH, DEFAULT_ALLELE, V17_FEATURES, skillFeatureVector, runV17Bytecode, legacyWeights, makeGenome, repairGenome, dependencyViolations, mutateGenome, crossoverGenome, genomeDistance, featureVector, v14ContextValue, v14GateActivation, scoreState, playEpisode, evaluateGenome, createConfig, runConfig };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ModularLab;
