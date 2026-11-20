/* V1.2 Modular cognition experiment UI. */
const ModularUI = (() => {
  const $ = id => document.getElementById(id), dialog = $('mod-dialog');
  const tierNames = ['新手', '探索者', '策略型'];
  const moduleNames = Object.fromEntries(ModularLab.SKILL_LIBRARY.map(x => [x.id, x.name]));
  const alleleNames = Object.fromEntries(ModularLab.SKILL_LIBRARY.map(x => [x.id, Object.fromEntries(x.alleles.map(a => [a.id, a.name]))]));
  let worker = null, result = null, epoch = 0, busy = false;
  const pct = x => (100 * x).toFixed(1) + '%';
  const num = x => Number(x).toFixed(3);
  const signed = x => (x >= 0 ? '+' : '') + (100 * x).toFixed(1) + ' pp';
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const tr = cells => '<tr>' + cells.map(x => `<td>${x}</td>`).join('') + '</tr>';
  const table = (heads, rows) => `<div class="mod-scroll"><table class="multi-table"><thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  function setBusy(on) {
    busy = on;
    for (const id of ['mod-seed', 'mod-generations', 'mod-population', 'mod-budget', 'mod-train-n', 'mod-audit-n', 'mod-run']) $(id).disabled = on;
    $('mod-stop').disabled = !on;
    $('mod-export').disabled = on || !result;
    $('mod-genome-export').disabled = on || !result;
    $('mod-tier').disabled = on || !result;
  }
  function finish(message) { worker?.terminate(); worker = null; setBusy(false); $('mod-status').textContent = message; }
  function dependencyGraph() {
    const groups = [
      ['感知核心', ['perception']],
      ['基础技能', ['goal', 'economy', 'explore', 'facility', 'memory']],
      ['组合技能', ['route']],
      ['高阶技能', ['recovery']]
    ];
    $('mod-dependency').innerHTML = `<div class="mod-graph">${groups.map((g, i) => `<div class="mod-graph-group"><small>${g[0]}</small><div>${g[1].map(id => `<span class="mod-node ${id === 'perception' ? 'core' : ''}">${id === 'perception' ? '环境感知' : moduleNames[id]}</span>`).join('')}</div>${i < groups.length - 1 ? '<b class="mod-arrow">↓</b>' : ''}</div>`).join('')}</div><p class="lab-help">依赖边：感知 → 目标/资源/探索/设施/记忆；目标 → 路线；路线 + 资源 + 记忆 → 恢复。缺少前置技能时，依赖模块自动关闭。</p>`;
  }
  function skillLibrary() {
    $('mod-library').innerHTML = `<div class="mod-skill-grid">${ModularLab.SKILL_LIBRARY.map(m => `<article class="mod-skill"><b>${m.name}</b><p>${m.role}</p><small>依赖：${m.deps.length ? m.deps.map(x => moduleNames[x]).join(' + ') : '感知核心'}</small><div>${m.alleles.map(a => `<span>${a.name}</span>`).join('')}</div></article>`).join('')}</div>`;
  }
  function chart(r) {
    const flat = r.results.flat.tiers, modular = r.results.modular.tiers, n = r.generations;
    const f = Array.from({ length: n }, (_, i) => avg(flat.map(t => t.history[i].anchorRate)));
    const m = Array.from({ length: n }, (_, i) => avg(modular.map(t => t.history[i].anchorRate)));
    const x = i => 40 + i * 360 / Math.max(1, n - 1), y = v => 142 - 112 * v;
    const line = (a, c) => `<polyline fill="none" stroke="${c}" stroke-width="3" points="${a.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`;
    $('mod-chart').innerHTML = `<svg class="mod-chart" viewBox="0 0 430 178" role="img" aria-label="固定锚点能力保留曲线">${[0,.25,.5,.75,1].map(v => `<line x1="40" x2="408" y1="${y(v)}" y2="${y(v)}" stroke="#29414c"/><text x="33" y="${y(v)+3}" fill="#aebfc5" font-size="10" text-anchor="end">${Math.round(v*100)}%</text>`).join('')}${line(f, '#e7c68c')}${line(m, '#8cdec9')}${Array.from({length:n},(_,i)=>`<text x="${x(i)}" y="160" fill="#aebfc5" font-size="10" text-anchor="middle">G${i+1}</text>`).join('')}<text x="42" y="14" fill="#e7c68c" font-size="11">平坦权重架构</text><text x="174" y="14" fill="#8cdec9" font-size="11">模块化架构</text></svg><p class="lab-help">每代冠军在固定早期锚点上的审计成功率。锚点参与早期训练，后续仅用于审计；不是完全未见测试集。</p>`;
  }
  function renderStrategy(r) {
    const tier = Number($('mod-tier').value), flat = r.results.flat.tiers[tier], mod = r.results.modular.tiers[tier], g = mod.finalGenome;
    const rows = ModularLab.SKILL_LIBRARY.map(m => {
      const gene = g.modules[m.id];
      return [m.name, gene.enabled ? '启用' : '关闭', alleleNames[m.id][gene.allele], num(gene.weight), num(gene.threshold), m.deps.length ? m.deps.map(x => moduleNames[x]).join(' + ') : '感知'];
    });
    $('mod-strategy').innerHTML = `<h4>${tierNames[tier]} · 最终模块组合</h4>${table(['技能模块','状态','技能变体','权重','阈值','依赖'], rows)}<p class="lab-help">平坦架构同等级权重：${flat.finalGenome.weights.map(num).join(' / ')}。模块依赖违规：${mod.dependencyViolations.length}。</p>`;
    $('mod-history').innerHTML = table(['代','训练成功率','锚点成功率','适应度','种群多样性','启用模块'], mod.history.map(h => [h.generation, pct(h.trainRate), pct(h.anchorRate), num(h.trainFitness), pct(h.diversity), h.activeModules]));
  }
  function draw(r) {
    const f = r.results.flat, m = r.results.modular;
    const cards = [
      ['候选评估数 / 架构', f.stats.candidateEvaluations],
      ['每局工作上限', r.episodeBudget.toLocaleString()],
      ['锚点遗忘 · 平坦', pct(f.meanAnchorForgetting)],
      ['锚点遗忘 · 模块', pct(m.meanAnchorForgetting)],
      ['未见关卡成功率 · 平坦', pct(f.meanHoldout)],
      ['未见关卡成功率 · 模块', pct(m.meanHoldout)],
      ['最终策略平均启用模块', `${m.meanActiveModules.toFixed(1)}/${ModularLab.MODULE_IDS.length}`],
      ['依赖违规', m.tiers.reduce((s, t) => s + t.dependencyViolations.length, 0)]
    ];
    $('mod-summary').innerHTML = `<div class="robust-kpis">${cards.map(([k,v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
    chart(r); renderStrategy(r);
    $('mod-compare').innerHTML = '<h3>等计算预算对照 · 平坦权重 vs 模块化技能</h3>' + table(['指标','平坦权重 GA','模块化 GA','解释'], [
      ['固定锚点遗忘', pct(f.meanAnchorForgetting), pct(m.meanAnchorForgetting), '首代至末代的非负成功率下降'],
      ['锚点最终变化', signed(f.meanAnchorDelta), signed(m.meanAnchorDelta), '末代减首代；正值代表改善'],
      ['未见关卡成功率', pct(f.meanHoldout), pct(m.meanHoldout), '完全独立生成的留出关卡'],
      ['训练最终成功率', pct(f.meanTrain), pct(m.meanTrain), '各自最后一代训练任务'],
      ['策略基因多样性', pct(f.meanDiversity), pct(m.meanDiversity), '末代种群平均基因距离'],
      ['实际工作单位', f.stats.actualWorkUnits.toLocaleString(), m.stats.actualWorkUnits.toLocaleString(), '动作扩展 + 固定七维特征运算'],
      ['分配工作上限', f.stats.allocatedWorkUnits.toLocaleString(), m.stats.allocatedWorkUnits.toLocaleString(), '候选数、任务数、种子数、每局上限完全相同'],
      ['计算预算耗尽局数', f.stats.budgetStops, m.stats.budgetStops, '提前耗尽单局工作上限'],
      ['候选评估 / 架构', f.stats.candidateEvaluations, m.stats.candidateEvaluations, '必须相等'],
      ['训练 / 审计 / 留出局数', `${f.stats.trainEpisodes}/${f.stats.auditEpisodes}/${f.stats.holdoutEpisodes}`, `${m.stats.trainEpisodes}/${m.stats.auditEpisodes}/${m.stats.holdoutEpisodes}`, '必须逐项相等']
    ]);
    $('mod-summary-note').innerHTML = `<p class="lab-help">预算核验：候选评估相等 = ${r.comparison.equalCandidateEvaluations ? '通过' : '失败'}；训练/审计/留出局数相等 = ${r.comparison.equalEpisodeAllocation ? '通过' : '失败'}；分配工作上限相等 = ${r.comparison.equalAllocatedWork ? '通过' : '失败'}。每个策略每局获得相同的工作上限；实际消耗会因提前通关或停滞而不同，因此不把 allocated budget 误称为相同 CPU 时间。平坦与模块架构均计算七维特征，避免模块较少时免费获得计算优势。</p>`;
    renderStrategy(r);
  }
  function receive(message, token) {
    if (token !== epoch) return;
    if (message.error) { finish('失败：' + message.error); return; }
    if (message.progress) {
      const p = message.progress;
      $('mod-progress').value = p.generation;
      $('mod-status').textContent = `第 ${p.generation}/${p.generations} 代 · 已完成 ${p.stats.totalCandidateEvaluations} 次候选评估 · 两种架构同步推进`;
      return;
    }
    if (message.result) {
      result = message.result; draw(result); finish('完成 · 独立留出未参与进化选择');
    }
  }
  function start() {
    const opts = {
      seed: Number($('mod-seed').value), generations: Number($('mod-generations').value), population: Number($('mod-population').value),
      episodeBudget: Number($('mod-budget').value), trainN: Number($('mod-train-n').value), auditN: Number($('mod-audit-n').value)
    };
    const templates = JSON.parse(JSON.stringify(LEVELS.filter(l => l.id !== 'CUSTOM'))), token = ++epoch;
    result = null; for (const id of ['mod-summary','mod-chart','mod-strategy','mod-history','mod-compare','mod-summary-note']) $(id).innerHTML = '';
    setBusy(true); $('mod-progress').max = opts.generations; $('mod-progress').value = 0; $('mod-status').textContent = '生成训练任务、固定锚点和独立留出关卡…';
    const fallback = () => {
      try {
        const c = ModularLab.createConfig(opts, templates);
        const next = () => {
          if (token !== epoch || !busy) return;
          try {
            if (c.tick()) { receive({ progress: c.snapshot() }, token); setTimeout(next, 0); }
            else receive({ result: c.snapshot(true) }, token);
          } catch (e) { receive({ error: e.message }, token); }
        };
        setTimeout(next, 0);
      } catch (e) { receive({ error: e.message }, token); }
    };
    try {
      const ids = ['engine-source','quality-source','evolution-source','players-source','modular-source'];
      const source = ids.map(id => $(id).textContent).join('\n') + `\nself.onmessage=({data:{opts,templates}})=>{try{const c=ModularLab.createConfig(opts,templates);while(c.tick())self.postMessage({progress:c.snapshot()});self.postMessage({result:c.snapshot(true)})}catch(e){self.postMessage({error:e.message})}}`;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      worker = new Worker(url); URL.revokeObjectURL(url);
      worker.onmessage = e => receive(e.data, token);
      worker.onerror = e => { e.preventDefault(); worker?.terminate(); worker = null; if (token === epoch && busy) fallback(); };
      worker.postMessage({ opts, templates });
    } catch (_) { fallback(); }
  }
  $('mod-open').onclick = () => { if (typeof locked === 'undefined' || !locked) dialog.showModal(); };
  $('mod-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (busy) { epoch++; finish('已停止 · 未完成实验不计入结果'); } });
  $('mod-run').onclick = start;
  $('mod-stop').onclick = () => { epoch++; finish('已停止 · 未完成实验不计入结果'); };
  $('mod-tier').onchange = () => { if (result) renderStrategy(result); };
  $('mod-export').onclick = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'forsaken-v1.2-modular-experiment.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('mod-genome-export').onclick = () => {
    if (!result) return;
    const tier = Number($('mod-tier').value), genome = result.results.modular.tiers[tier].finalGenome;
    const payload = { version: 'V1.2', skillLibrary: ModularLab.SKILL_LIBRARY, dependencyGraph: ModularLab.DEPENDENCY_GRAPH, genome };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `forsaken-v1.2-${tierNames[tier]}-skill-genome.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  dependencyGraph(); skillLibrary();
  return { getResult: () => result };
})();
