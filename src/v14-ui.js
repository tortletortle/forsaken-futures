/* V1.4 Skill Gating & Topology Evolution UI. */
const V14UI = (() => {
  const $ = id => document.getElementById(id);
  const dialog = $('v14-dialog');
  const armOrder = V14Lab.ARM_META.map(x=>x.id);
  const featureNames = {scarcity:'资源稀缺',novelty:'新区域',loopRisk:'循环风险',mobility:'可行动性',targetDistance:'目标距离',goalProgress:'目标进度',station:'未来节点',stationDensity:'设施密度',edgeDensity:'通道密度',complexity:'结构复杂度',recoveryRisk:'脱困风险',inventory:'库存',echoes:'共鸣设施'};
  const moduleNames = Object.fromEntries(ModularLab.SKILL_LIBRARY.map(x=>[x.id,x.name]));
  let worker=null,result=null,epoch=0,busy=false;
  const pct=x=>(100*x).toFixed(1)+'%';
  const pp=x=>(x>=0?'+':'')+(100*x).toFixed(1)+' pp';
  const num=x=>Number(x||0).toFixed(2);
  const table=(heads,rows)=>`<div class="mod-scroll"><table class="multi-table"><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  function setBusy(on){busy=on;for(const id of ['v14-seed','v14-seeds','v14-generations','v14-population','v14-budget','v14-train-n','v14-diag-n','v14-audit-n','v14-run'])$(id).disabled=on;$('v14-stop').disabled=!on;$('v14-export').disabled=on||!result;$('v14-genome-export').disabled=on||!result;}
  function finish(message){worker?.terminate();worker=null;setBusy(false);$('v14-status').textContent=message;}
  function download(name,data){const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function render(r){
    const s=r.summary;
    const cards=[['配对任务 × 玩家等级',r.runs.length],['策略对照臂',4],['每臂反事实诊断局',r.runs[0].budget.expectedDiagnosticEpisodes],['平均隔离模块数',s.detector.detectedNegativeModules.toFixed(2)+' / 7'],['平均门控激活率',pct(s.gating.gateActivation)],['拓扑平均边数',num(s.topology.topologyEdges)],['候选预算一致',r.budget.equalCandidateEvaluations?'通过':'失败'],['分配工作预算一致',r.budget.equalAllocatedWork?'通过':'失败']];
    $('v14-summary').innerHTML=`<div class="robust-kpis">${cards.map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
    const rows=armOrder.map(id=>{const x=s[id];return [x.name,pct(x.sourceRate),pct(x.targetRate),pct(x.holdoutRate),pp(x.targetDeltaVsStatic),pp(x.holdoutDeltaVsStatic),x.quarantineCount.toFixed(2),x.topologyEdges.toFixed(2),pct(x.gateActivation)];});
    $('v14-arms').innerHTML=table(['策略','来源域','目标域','独立留出','目标增益 vs 静态','留出增益 vs 静态','隔离规则','拓扑边','门控激活'],rows);
    const diagnosticRows=V14Lab.MODULES.map(id=>{const all=r.runs.flatMap(run=>run.arms.find(a=>a.id==='detector').diagnosis.rows.filter(x=>x.module===id));const gain=all.reduce((a,x)=>a+x.meanAblationGain,0)/Math.max(1,all.length);const flagged=all.filter(x=>x.harmfulContexts.length>0).length;return [moduleNames[id],pp(gain),`${flagged}/${all.length}`,all[0]?.protectedAnchor?'稳定锚点，不参与隔离':(flagged?'出现反事实负迁移证据':'未达到检测阈值')];});
    $('v14-diagnostics').innerHTML=table(['技能模块','平均消融增益','被标记任务数','检测说明'],diagnosticRows);
    const sample=r.runs.find(x=>x.tier===1)||r.runs[0],best=sample.arms.find(x=>x.id==='topology');
    const gates=V14Lab.MODULES.map(id=>{const g=best.genome.v14.controller.gates[id];return [moduleNames[id],g.feature in featureNames?featureNames[g.feature]:g.feature,g.op==='gte'?'高于阈值':'低于阈值',num(g.threshold),num(g.slope),num(g.floor)];});
    $('v14-gates').innerHTML=table(['模块','门控特征','触发方向','阈值','斜率','最低激活'],gates);
    const edges=best.genome.v14.topology.edges;
    $('v14-topology').innerHTML=edges.length?`<div class="v14-edge-list">${edges.map(e=>`<div><b>${moduleNames[e.from]}</b><span>→</span><b>${moduleNames[e.to]}</b><small>${e.weight>=0?'+':''}${num(e.weight)}</small></div>`).join('')}</div>`:'<p class="lab-help">当前最优个体没有保留交互边。</p>';
    const hist=best.history.map(h=>[h.generation,num(h.fitness),pct(h.trainRate),h.topologyEdges,h.diversity.toFixed(3)]);
    $('v14-history').innerHTML=table(['代数','适应度','训练成功率','交互边','种群差异'],hist);
    $('v14-budget-report').innerHTML=table(['预算核验','结果'],[
      ['每臂候选评估',`${r.budget.minCandidates}–${r.budget.maxCandidates}`],
      ['每臂训练试玩',`${r.budget.minTrainEpisodes}–${r.budget.maxTrainEpisodes}`],
      ['每臂反事实诊断试玩',r.runs[0].budget.expectedDiagnosticEpisodes],
      ['每臂独立审计试玩',r.runs[0].budget.expectedAuditEpisodes],
      ['每臂分配工作单位',r.budget.minAllocatedWork.toLocaleString()],
      ['候选评估等量',r.budget.equalCandidateEvaluations?'通过':'失败'],
      ['训练试玩等量',r.budget.equalTrainEpisodes?'通过':'失败'],
      ['总分配工作等量',r.budget.equalAllocatedWork?'通过':'失败'],
      ['每个种子×等级×策略臂实际工作量（平均）',Math.round(r.budget.meanActualWork).toLocaleString()],
      ['全部策略臂总实际工作量',Math.round(r.budget.meanActualWork*r.runs.length*4).toLocaleString()],
      ['总模拟试玩局数',r.runs.length*4*(r.runs[0].budget.expectedTrainEpisodes+r.runs[0].budget.expectedDiagnosticEpisodes+r.runs[0].budget.expectedAuditEpisodes)]
    ]);
    $('v14-notes').innerHTML=`<h3>实验边界</h3><ul>${r.notes.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  }
  function receive(msg,token){if(token!==epoch)return;if(msg.error){finish('失败：'+msg.error);return;}if(msg.progress){const p=msg.progress;$('v14-progress').value=p.completed;$('v14-status').textContent=`完成 ${p.completed}/${p.total} · 种子 ${p.seed} · ${['新手','探索者','策略型'][p.tier]} · 评估门控、负迁移与拓扑`;return;}if(msg.result){result=msg.result;render(result);finish('完成 · 负迁移检测仅读取目标适配域，最终留出不参与选择');}}
  function start(){const base=Number($('v14-seed').value),count=Number($('v14-seeds').value),seeds=Array.from({length:count},(_,i)=>(base+i*1110)>>>0);const opts={seeds,generations:Number($('v14-generations').value),population:Number($('v14-population').value),episodeBudget:Number($('v14-budget').value),trainN:Number($('v14-train-n').value),diagN:Number($('v14-diag-n').value),auditN:Number($('v14-audit-n').value)};const templates=JSON.parse(JSON.stringify(LEVELS.filter(l=>l.id!=='CUSTOM'))),token=++epoch;result=null;for(const id of ['v14-summary','v14-arms','v14-diagnostics','v14-gates','v14-topology','v14-history','v14-budget-report','v14-notes'])$(id).innerHTML='';setBusy(true);$('v14-progress').max=seeds.length*3;$('v14-progress').value=0;$('v14-status').textContent='生成独立任务并启动配对实验…';const fallback=()=>{try{const r=V14Lab.runExperiment(opts,templates,p=>receive({progress:p},token));receive({result:r},token);}catch(e){receive({error:e.message},token);}};try{const ids=['engine-source','evolution-source','players-source','modular-source','v14-source'];const source=ids.map(id=>$(id).textContent).join('\n')+`\nself.onmessage=({data:{opts,templates}})=>{try{const r=V14Lab.runExperiment(opts,templates,p=>self.postMessage({progress:p}));self.postMessage({result:r})}catch(e){self.postMessage({error:e.message})}}`;const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);worker.onmessage=e=>receive(e.data,token);worker.onerror=e=>{e.preventDefault();worker?.terminate();worker=null;if(token===epoch&&busy)fallback();};worker.postMessage({opts,templates});}catch(_){fallback();}}
  $('v14-open').onclick=()=>{if(typeof locked==='undefined'||!locked)dialog.showModal();};$('v14-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(busy){epoch++;finish('已停止 · 未完成实验不计入结果');}});$('v14-run').onclick=start;$('v14-stop').onclick=()=>{epoch++;finish('已停止 · 未完成实验不计入结果');};$('v14-export').onclick=()=>{if(result)download('forsaken-v1.4-gating-experiment.json',result);};$('v14-genome-export').onclick=()=>{if(result){const r=result.runs.find(x=>x.tier===1)||result.runs[0];download('forsaken-v1.4-policy-genomes.json',{version:'V1.4',arms:r.arms.map(a=>({id:a.id,genome:a.genome,diagnosis:a.diagnosis}))});}};
  return {getResult:()=>result};
})();
