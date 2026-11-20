/* V1.3 skill transfer and composition UI. */
const MigrationUI = (() => {
  const $ = id => document.getElementById(id);
  const dialog = $('migration-dialog');
  const tierNames = ['新手', '探索者', '策略型'];
  const names = Object.fromEntries(MigrationLab.MODULES.map((id, i) => [id, ModularLab.SKILL_LIBRARY.find(x => x.id === id).name]));
  let worker = null, result = null, epoch = 0, busy = false;
  const pct = x => (100 * x).toFixed(1) + '%';
  const pp = x => (x >= 0 ? '+' : '') + (100 * x).toFixed(1) + ' pp';
  const num = x => Number(x).toFixed(3);
  const table = (heads, rows) => `<div class="mod-scroll"><table class="multi-table"><thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  function setBusy(on) {
    busy = on;
    for (const id of ['migration-seed','migration-seeds','migration-generations','migration-population','migration-budget','migration-run']) $(id).disabled = on;
    $('migration-stop').disabled = !on;
    $('migration-export').disabled = on || !result;
    $('migration-genome-export').disabled = on || !result;
  }
  function finish(message) {
    worker?.terminate(); worker = null; setBusy(false);
    $('migration-status').textContent = message;
  }
  function render(r) {
    const a = r.summary.arms;
    const cards = [
      ['配对种子 × 玩家等级', r.runs.length],
      ['模块单项迁移测试', r.runs.length * 7],
      ['两两组合测试', r.runs.length * 21],
      ['正交互组合（目标域）', r.summary.positiveSynergyPairCount],
      ['负迁移组合（目标域）', r.summary.negativeTransferPairCount],
      ['冻结基因完整性', pct(r.budget.frozenIntegrityRate)],
      ['等候选评估预算', r.budget.equalCandidateEvaluations ? '通过' : '失败'],
      ['等分配工作预算', r.budget.equalAllocatedWork ? '通过' : '失败']
    ];
    $('migration-summary').innerHTML = `<div class="robust-kpis">${cards.map(([k,v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
    $('migration-summary').innerHTML += `<p class="lab-help">来源域专门化组合：来源 ${pct(r.summary.directComposite.sourceRate)} · 目标 ${pct(r.summary.directComposite.targetRate)} · 独立留出 ${pct(r.summary.directComposite.holdoutRate)}；目标基线 ${pct(r.summary.directComposite.baselineTargetRate)} · 留出基线 ${pct(r.summary.directComposite.baselineHoldoutRate)}。</p>`;
    const skillRows = MigrationLab.MODULES.map(id => {
      const x = r.summary.singles[id];
      return [names[id], pp(x.targetDelta), pp(x.holdoutDelta), `${x.positiveTargetRuns}/${x.runs}`, `${x.negativeTargetRuns}/${x.runs}`, '来源域单技能专门化'];
    });
    $('migration-singles').innerHTML = table(['技能','目标域迁移增益','留出迁移增益','目标正迁移','目标负迁移','说明'], skillRows);
    const sample = r.runs[0].donor.skillSweep;
    $('migration-skills').innerHTML = table(['技能','来源域选中变体','权重','门限','来源训练成功率','候选数'], sample.map(x => [names[x.module], x.allele, num(x.weight), num(x.threshold), pct(x.sourceTrainRate), x.candidates]));
    const pairs = [...r.summary.pairs].sort((x,y) => y.meanSynergyHoldout - x.meanSynergyHoldout);
    $('migration-pairs').innerHTML = table(['技能组合','目标交互量','留出交互量','目标负迁移比例','正交互次数','负交互次数'], pairs.map(x => [x.modules.map(id => names[id]).join(' + '), pp(x.meanSynergyTarget), pp(x.meanSynergyHoldout), pct(x.negativeTransferRate), x.positiveSynergyRuns, x.negativeSynergyRuns]));
    const armOrder = ['scratch','transfer_all','freeze_top','freeze_random'];
    $('migration-arms').innerHTML = table(['适配策略','来源保持率','目标审计成功率','独立留出成功率','留出增益 vs 从零','冻结模块数','冻结完整性'], armOrder.map(id => {
      const x = a[id]; return [x.name, pct(x.sourceRate.mean), pct(x.targetRate.mean), pct(x.holdoutRate.mean), pp(x.holdoutDeltaVsScratch.mean), x.meanFrozenCount.toFixed(1), (x.frozenIntegrityRate == null ? '—' : pct(x.frozenIntegrityRate))];
    }));
    const deps = MigrationLab.MODULES.map(id => {
      const d = ModularLab.SKILL_LIBRARY.find(x => x.id === id).deps;
      return [names[id], d.length ? d.map(x => names[x]).join(' + ') : '环境感知核心', d.length ? '依赖约束' : '基础模块'];
    });
    $('migration-deps').innerHTML = table(['模块','依赖','冻结规则'], deps) + `<p class="lab-help">冻结模块会递归冻结其依赖模块，防止修复依赖时意外改写已冻结基因。冻结完整性按最终基因 JSON 精确比较。</p>`;
    $('migration-budget-report').innerHTML = table(['预算指标','实测结果'], [
      ['每个 seed × 玩家等级的来源技能候选', r.runs[0].donor.stats.candidateEvaluations],
      ['直接迁移候选数（基线 + 单项 + 两两 + 全组合）', r.runs[0].budget.directCandidates],
      ['每个直接候选试玩局数', r.runs[0].budget.directEpisodesPerCandidate],
      ['直接迁移阶段分配工作单位', r.runs[0].budget.directAllocatedWorkPerRun.toLocaleString()],
      ['每个适配臂候选数', `${r.budget.minCandidatesPerArm}–${r.budget.maxCandidatesPerArm}`],
      ['每个适配臂训练局数', `${r.budget.minTrainEpisodesPerArm}–${r.budget.maxTrainEpisodesPerArm}`],
      ['每个适配臂分配工作单位', `${r.budget.minAllocatedWorkPerArm.toLocaleString()}–${r.budget.maxAllocatedWorkPerArm.toLocaleString()}`],
      ['候选评估相等', r.budget.equalCandidateEvaluations ? '通过' : '失败'],
      ['训练局数相等', r.budget.equalTrainEpisodes ? '通过' : '失败'],
      ['分配工作量相等', r.budget.equalAllocatedWork ? '通过' : '失败'],
      ['冻结基因完整性', pct(r.budget.frozenIntegrityRate)],
      ['适配训练预算耗尽局数', armOrder.reduce((s,id)=>s+a[id].budgetStops,0)]
    ]);
    $('migration-notes').innerHTML = `<h3>实验边界与解释</h3><ul>${r.notes.map(x => `<li>${x}</li>`).join('')}</ul>`;
  }
  function receive(msg, token) {
    if (token !== epoch) return;
    if (msg.error) { finish('失败：' + msg.error); return; }
    if (msg.progress) {
      const p = msg.progress; $('migration-progress').value = p.completed;
      $('migration-status').textContent = `已完成 ${p.completed}/${p.total} 个配对任务 · ${p.seed} / ${tierNames[p.tier]} · 迁移、组合与冻结实验运行中`;
      return;
    }
    if (msg.result) { result = msg.result; render(result); finish('完成 · 最终留出未参与技能选择、冻结选择或目标域进化'); }
  }
  function start() {
    const base = Number($('migration-seed').value), count = Number($('migration-seeds').value);
    const seeds = Array.from({length:count}, (_,i) => (base + i * 1103515245) >>> 0);
    const opts = { seeds, generations: Number($('migration-generations').value), population: Number($('migration-population').value), episodeBudget: Number($('migration-budget').value) };
    const templates = JSON.parse(JSON.stringify(LEVELS.filter(l => l.id !== 'CUSTOM'))), token = ++epoch;
    result = null;
    for (const id of ['migration-summary','migration-singles','migration-skills','migration-deps','migration-pairs','migration-arms','migration-budget-report','migration-notes']) $(id).innerHTML = '';
    setBusy(true); $('migration-progress').max = seeds.length * 3; $('migration-progress').value = 0; $('migration-status').textContent = '生成独立留出关卡并启动配对迁移实验…';
    const fallback = () => {
      try { const r = MigrationLab.runExperiment(opts, templates, p => receive({progress:p}, token)); receive({result:r}, token); }
      catch (e) { receive({error:e.message}, token); }
    };
    try {
      const ids = ['engine-source','evolution-source','players-source','modular-source','migration-source'];
      const source = ids.map(id => $(id).textContent).join('\n') + `\nself.onmessage=({data:{opts,templates}})=>{try{const r=MigrationLab.runExperiment(opts,templates,p=>self.postMessage({progress:p}));self.postMessage({result:r})}catch(e){self.postMessage({error:e.message})}}`;
      const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
      worker = new Worker(url); URL.revokeObjectURL(url);
      worker.onmessage = e => receive(e.data, token);
      worker.onerror = e => { e.preventDefault(); worker?.terminate(); worker = null; if (token === epoch && busy) fallback(); };
      worker.postMessage({opts,templates});
    } catch (_) { fallback(); }
  }
  $('migration-open').onclick = () => { if (typeof locked === 'undefined' || !locked) dialog.showModal(); };
  $('migration-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (busy) { epoch++; finish('已停止 · 未完成实验不计入结果'); } });
  $('migration-run').onclick = start;
  $('migration-stop').onclick = () => { epoch++; finish('已停止 · 未完成实验不计入结果'); };
  $('migration-export').onclick = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download='forsaken-v1.3-migration-experiment.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('migration-genome-export').onclick = () => {
    if (!result) return;
    const run = result.runs[0], payload = {version:'V1.3',skillLibrary:ModularLab.SKILL_LIBRARY,dependencyGraph:ModularLab.DEPENDENCY_GRAPH,donorGenome:run.donor.genome,freezeSelection:run.freezeSelection};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download='forsaken-v1.3-composed-skill-genome.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return {getResult:()=>result};
})();
