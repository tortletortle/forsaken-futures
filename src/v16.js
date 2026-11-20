/* V1.6: failure-guided skill synthesis and compilation. Research proxy; new skills compile into existing module gates/weights. */
const V16Lab=(()=>{
 const isNode=typeof module==='object'&&module.exports;
 const V=isNode?require('./evolution.js'):Evolution;
 const P=isNode?require('./players.js'):Players;
 const M=isNode?require('./modular.js'):ModularLab;
 const V14=isNode?require('./v14.js'):V14Lab;
 const V15=isNode?require('./v15.js'):V15Lab;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const SKILL_TEMPLATES={
  recovery:{name:'困境恢复',module:'recovery',alleles:['escape','reserve','undo_safe'],feature:'recoveryRisk',op:'gte',threshold:[.28,.62],slope:[3,6],floor:[.12,.38],weightDelta:[.3,.95],tag:'stuck_or_undo'},
  memory:{name:'循环抑制',module:'memory',alleles:['short_tabu','long_tabu','anti_cycle'],feature:'loopRisk',op:'gte',threshold:[.12,.48],slope:[3,7],floor:[.12,.4],weightDelta:[.25,.85],tag:'repeated_state'},
  explore:{name:'边界探查',module:'explore',alleles:['frontier','novelty','cautious'],feature:'novelty',op:'gte',threshold:[.35,.75],slope:[3,7],floor:[.12,.42],weightDelta:[.25,.85],tag:'low_coverage'},
  facility:{name:'设施扫描',module:'facility',alleles:['station_focus','balanced','station_cautious'],feature:'station',op:'gte',threshold:[.25,.75],slope:[3,7],floor:[.1,.4],weightDelta:[.25,.85],tag:'missed_relics'},
  route:{name:'远距规划',module:'route',alleles:['nearest','goal_corridor','return_safe'],feature:'targetDistance',op:'gte',threshold:[.25,.72],slope:[3,7],floor:[.1,.38],weightDelta:[.3,.9],tag:'long_route_or_budget'},
  economy:{name:'资源保全',module:'economy',alleles:['reserve','spend','echo_hunt'],feature:'scarcity',op:'gte',threshold:[.25,.72],slope:[3,7],floor:[.1,.4],weightDelta:[.25,.85],tag:'resource_pressure'}
 };
 const ARMS=[{id:'base',name:'无新技能基线'},{id:'random',name:'随机技能搜索'},{id:'guided',name:'失败驱动技能合成'}];
 function rngRange(rng,range){return range[0]+rng()*(range[1]-range[0]);}
 function makeSkill(kind,rng,serial,provenance={}){
  const t=SKILL_TEMPLATES[kind];if(!t)throw Error('未知技能模板：'+kind);
  return {id:`SK16_${kind}_${serial}`,name:t.name,targetModule:t.module,trigger:{feature:t.feature,op:t.op,threshold:Number(rngRange(rng,t.threshold).toFixed(3)),slope:Number(rngRange(rng,t.slope).toFixed(2)),floor:Number(rngRange(rng,t.floor).toFixed(3))},effect:{weightDelta:Number(rngRange(rng,t.weightDelta).toFixed(3))},allele:t.alleles[Math.floor(rng()*t.alleles.length)],provenance:{method:provenance.method||'random',failureTags:provenance.failureTags||[],observations:provenance.observations||0,template:kind},parents:[t.module],version:1};
 }
 function validateSkill(skill){
  if(!skill||typeof skill.id!=='string'||!skill.id.startsWith('SK16_'))throw Error('技能 ID 不合法');
  if(!M.MODULE_IDS.includes(skill.targetModule)||skill.targetModule==='goal')throw Error('技能目标模块不合法');
  if(!V14.FEATURES.includes(skill.trigger?.feature)||!['gte','lte'].includes(skill.trigger?.op))throw Error('技能触发条件不合法');
  if(!Number.isFinite(skill.trigger.threshold)||skill.trigger.threshold< -1||skill.trigger.threshold>4)throw Error('技能阈值越界');
  if(!Number.isFinite(skill.trigger.slope)||skill.trigger.slope<.5||skill.trigger.slope>8)throw Error('技能斜率越界');
  if(!Number.isFinite(skill.trigger.floor)||skill.trigger.floor<0||skill.trigger.floor>.5)throw Error('技能激活下限越界');
  if(!Number.isFinite(skill.effect?.weightDelta)||Math.abs(skill.effect.weightDelta)>.95)throw Error('技能效果越界');
  const moduleDef=M.SKILL_LIBRARY.find(x=>x.id===skill.targetModule);if(!moduleDef?.alleles.some(a=>a.id===skill.allele))throw Error('技能等位策略不合法');
  return true;
 }
 function compileSkill(base,skill){
  validateSkill(skill);const g=clone(base),target=skill.targetModule;
  if(!g.modules[target])throw Error('目标模块不存在');
  // The skill is compiled into a pre-existing scoring channel: one contextual gate plus a bounded weight adjustment.
  g.v14=g.v14||{mode:'v16',controller:V14.defaultController(true),topology:V14.defaultTopology(false),budgetCost:V14.BUDGET_COST};
  g.v14.controller=V14.defaultController(true);
  for(const id of M.MODULE_IDS)g.v14.controller.gates[id].enabled=false;
  g.v14.controller.gates[target]={enabled:true,feature:skill.trigger.feature,op:skill.trigger.op,threshold:skill.trigger.threshold,slope:skill.trigger.slope,floor:skill.trigger.floor};
  g.modules[target].enabled=true;
  g.modules[target].allele=skill.allele;
  g.modules[target].weight=clamp(g.modules[target].weight+skill.effect.weightDelta,-2.2,2.2);
  g.v14.topology=V14.defaultTopology(false);g.v14.mode='v16_compiled_skill';g.v16={compiledSkill:clone(skill),compilerVersion:'1.0',targetModule:target};
  return V14.repairGenome(g);
 }
 function seedList(seed,salt,n){const r=V.rng((seed^salt)>>>0);return Array.from({length:n},()=>Math.floor(r()*4294967296));}
 function seedByLevel(seed,salt,levels,n){return levels.map((_,i)=>seedList(seed,(salt+i*0x9e37)>>>0,n));}
 function evaluate(levels,genome,seedsByLevel,budget){const runs=[];for(let i=0;i<levels.length;i++)for(const seed of seedsByLevel[i]){const e=M.playEpisode(levels[i],genome,seed,budget);runs.push({...e,levelId:levels[i].id,progress:.65*(e.peak/Math.max(1,levels[i].relics.length))+.35*(e.visited/Math.max(1,levels[i].nodes.length))});}const p=P.profiles[genome.tier],n=Math.max(1,runs.length),winRate=runs.filter(x=>x.win).length/n,meanAttempts=avg(runs.map(x=>x.attempts/p.steps)),meanUndos=avg(runs.map(x=>x.undos/Math.max(1,p.undo))),meanProgress=avg(runs.map(x=>x.progress));return {winRate,wins:runs.filter(x=>x.win).length,n,meanAttempts,meanUndos,meanProgress,fitness:winRate+.15*meanProgress-.02*meanAttempts-.015*meanUndos,actualWork:runs.reduce((s,x)=>s+x.workUnits,0),allocatedWork:runs.length*budget,budgetStops:runs.filter(x=>x.reason==='compute_budget').length,runs};}
 function diagnoseFailures(levels,base,seedsByLevel,budget){
  const tags={recovery:0,memory:0,explore:0,facility:0,route:0,economy:0},observations=[];
  for(let i=0;i<levels.length;i++)for(const seed of seedsByLevel[i]){const e=M.playEpisode(levels[i],base,seed,budget);const l=levels[i],tagged=[];
   if(e.reason==='stuck'||e.undos>0){tags.recovery+=2;tagged.push('recovery');}
   if(e.visited<Math.max(2,l.nodes.length*.55)){tags.explore+=2;tagged.push('explore');}
   if(e.peak<l.relics.length){tags.facility+=2;tagged.push('facility');}
   if(e.reason==='compute_budget'||e.attempts>=P.profiles[base.tier].steps*.72){tags.route+=2;tagged.push('route');}
   if(e.undos>0&&e.attempts>P.profiles[base.tier].steps*.45){tags.memory+=1;tagged.push('memory');}
   if(e.reason==='stuck'&&e.visited>=Math.max(2,l.nodes.length*.55)){tags.economy+=1;tagged.push('economy');}
   observations.push({levelId:l.id,seed,win:e.win,reason:e.reason,attempts:e.attempts,undos:e.undos,peak:e.peak,visited:e.visited,tags:tagged,workUnits:e.workUnits});
  }
  const ranked=Object.entries(tags).sort((a,b)=>b[1]-a[1]);return {tags,ranked,observations,episodes:observations.length,actualWork:observations.reduce((s,o)=>s+(o.workUnits||0),0)};
 }
 function guidedSkills(diagnosis,rng,count){
  const ranked=diagnosis.ranked.filter(x=>x[1]>0).map(x=>x[0]);
  const fallback=['route','explore','recovery','facility','memory','economy'];
  const order=ranked.length?ranked.concat(fallback.filter(x=>!ranked.includes(x))):fallback;
  return Array.from({length:count},(_,i)=>{const kind=order[i%order.length];return makeSkill(kind,rng,i+1,{method:'failure_guided',failureTags:diagnosis.observations.flatMap(o=>o.tags).filter(t=>t===kind),observations:diagnosis.episodes});});
 }
 function randomSkills(rng,count){const keys=Object.keys(SKILL_TEMPLATES);return Array.from({length:count},(_,i)=>makeSkill(keys[Math.floor(rng()*keys.length)],rng,i+1,{method:'random'}));}
 function fitnessCompare(a,b){return b.fitness-a.fitness||a.index-b.index;}
 function pairedAudit(base,selected,levels,seeds,budget){const b=evaluate(levels,base,seeds,budget),s=evaluate(levels,selected,seeds,budget);return {baseline:b,selected:s,delta:s.winRate-b.winRate,pairedWins:s.runs.filter((x,i)=>x.win&&!b.runs[i].win).length,pairedLosses:s.runs.filter((x,i)=>!x.win&&b.runs[i].win).length};}
 function runOne(seed,tier,templates,cfg){
  const tasks=V14.makeTaskPack(seed,templates),base=V15.makeGenome(tier,(seed^((tier+1)*0x16a71))>>>0,{id:'static'});
  const discoverySeeds=seedByLevel(seed,0x161001,tasks.target,cfg.discoveryN),trainSeeds=seedByLevel(seed,0x162001,tasks.target,cfg.trainN),validationSeeds=seedByLevel(seed,0x163001,tasks.target,cfg.validationN),sourceSeeds=seedByLevel(seed,0x164001,tasks.source,cfg.auditN),targetAuditSeeds=seedByLevel(seed,0x165001,tasks.target,cfg.auditN),holdoutSeeds=seedByLevel(seed,0x166001,tasks.holdout,cfg.auditN);
  const arms=[];
  for(let ai=0;ai<ARMS.length;ai++){
   const arm=ARMS[ai],rng=V.rng((seed^0x16b001^(tier*0x9e37)^(ai*0x51a5))>>>0),diagnosis=diagnoseFailures(tasks.target,base,discoverySeeds,cfg.episodeBudget);
   const skills=arm.id==='guided'?guidedSkills(diagnosis,rng,cfg.skillCandidates):arm.id==='random'?randomSkills(rng,cfg.skillCandidates):[];
   const candidates=[clone(base),...skills.map(s=>compileSkill(base,s))];
   while(candidates.length<cfg.skillCandidates+1)candidates.push(clone(base));
   const evaluated=candidates.map((g,index)=>{const ev=evaluate(tasks.target,g,trainSeeds,cfg.episodeBudget);return {index,skill:g.v16?.compiledSkill||null,genome:g,fitness:ev.fitness,winRate:ev.winRate,meanProgress:ev.meanProgress,wins:ev.wins,n:ev.n,actualWork:ev.actualWork,allocatedWork:ev.allocatedWork};}).sort(fitnessCompare);
   const chosen=evaluated[0],baseValidation=evaluate(tasks.target,base,validationSeeds,cfg.episodeBudget),candidateValidation=evaluate(tasks.target,chosen.genome,validationSeeds,cfg.episodeBudget);
   const validationGain=candidateValidation.fitness-baseValidation.fitness,accepted=!!chosen.skill&&validationGain>=cfg.promotionMargin;
   const finalGenome=accepted?clone(chosen.genome):clone(base);
   const source=evaluate(tasks.source,finalGenome,sourceSeeds,cfg.episodeBudget),target=evaluate(tasks.target,finalGenome,targetAuditSeeds,cfg.episodeBudget),holdout=evaluate(tasks.holdout,finalGenome,holdoutSeeds,cfg.episodeBudget);
   arms.push({id:arm.id,name:arm.name,diagnosis,candidateCount:candidates.length,skillsGenerated:skills,rankedCandidates:evaluated.map(x=>({index:x.index,skill:x.skill,fitness:x.fitness,winRate:x.winRate,wins:x.wins,n:x.n})),selectedSkill:chosen.skill,selectedTrainingWinRate:chosen.winRate,validation:{baseFitness:baseValidation.fitness,candidateFitness:candidateValidation.fitness,gain:validationGain,accepted},finalGenome,source:{winRate:source.winRate,meanProgress:source.meanProgress,n:source.n,actualWork:source.actualWork,allocatedWork:source.allocatedWork},target:{winRate:target.winRate,meanProgress:target.meanProgress,n:target.n,actualWork:target.actualWork,allocatedWork:target.allocatedWork},holdout:{winRate:holdout.winRate,meanProgress:holdout.meanProgress,n:holdout.n,actualWork:holdout.actualWork,allocatedWork:holdout.allocatedWork},actualWork:diagnosis.actualWork+evaluated.reduce((s,x)=>s+x.actualWork,0)+baseValidation.actualWork+candidateValidation.actualWork+source.actualWork+target.actualWork+holdout.actualWork});
  }
  const expectedDiag=tasks.target.length*cfg.discoveryN,expectedCandidate= (cfg.skillCandidates+1)*tasks.target.length*cfg.trainN,expectedValidation=2*tasks.target.length*cfg.validationN,expectedAudit=(tasks.source.length+tasks.target.length+tasks.holdout.length)*cfg.auditN;
  const episodeCounts=arms.map(a=>({id:a.id,diagnostic:expectedDiag,candidate:expectedCandidate,validation:expectedValidation,audit:expectedAudit,total:expectedDiag+expectedCandidate+expectedValidation+expectedAudit,allocatedWork:(expectedDiag+expectedCandidate+expectedValidation+expectedAudit)*cfg.episodeBudget}));
  return {seed,tier,tierName:P.profiles[tier].name,diagnosis:arms.find(a=>a.id==='guided').diagnosis,taskIds:{source:tasks.source.map(x=>x.id),target:tasks.target.map(x=>x.id),holdout:tasks.holdout.map(x=>x.id)},arms,episodeCounts,equalAllocatedBudget:episodeCounts.every(x=>x.total===episodeCounts[0].total&&x.allocatedWork===episodeCounts[0].allocatedWork)};
 }
 function mean(rows,fn){return avg(rows.map(fn));}
 function clusteredInterval(values){const n=values.length,m=avg(values),sd=Math.sqrt(values.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,n-1)),critical=n===5?2.776:n===4?3.182:n===3?4.303:1.96;return {mean:m,approx95:[m-critical*sd/Math.sqrt(Math.max(1,n)),m+critical*sd/Math.sqrt(Math.max(1,n))],n};}
 function runExperiment(opts,templates,onProgress=()=>{}){
  const seeds=opts.seeds||[1601,2707,3803,4909,6011],cfg={skillCandidates:Number(opts.skillCandidates??4),discoveryN:Number(opts.discoveryN??2),trainN:Number(opts.trainN??2),validationN:Number(opts.validationN??2),auditN:Number(opts.auditN??2),episodeBudget:Number(opts.episodeBudget??2400),promotionMargin:Number(opts.promotionMargin??.01)};
  if(!Array.isArray(seeds)||seeds.length<3||seeds.length>8)throw Error('需要3–8个配对随机种子');if(cfg.skillCandidates<2||cfg.skillCandidates>6||cfg.discoveryN<1||cfg.discoveryN>3||cfg.trainN<1||cfg.trainN>3||cfg.validationN<1||cfg.validationN>3||cfg.auditN<1||cfg.auditN>3||cfg.episodeBudget<900||cfg.episodeBudget>6000||cfg.promotionMargin<0||cfg.promotionMargin>.2)throw Error('V1.6 参数超出范围');
  const runs=[],total=seeds.length*3;for(let si=0;si<seeds.length;si++)for(let tier=0;tier<3;tier++){const row=runOne(seeds[si],tier,templates,cfg);runs.push(row);onProgress({completed:runs.length,total,seed:seeds[si],tier,tierName:row.tierName});}
  const summary={};for(const a of ARMS){const rows=runs.flatMap(r=>r.arms.filter(x=>x.id===a.id));summary[a.id]={name:a.name,source:mean(rows,x=>x.source.winRate),target:mean(rows,x=>x.target.winRate),holdout:mean(rows,x=>x.holdout.winRate),sourceProgress:mean(rows,x=>x.source.meanProgress),targetProgress:mean(rows,x=>x.target.meanProgress),holdoutProgress:mean(rows,x=>x.holdout.meanProgress),promotionRate:mean(rows,x=>Number(x.validation.accepted)),meanValidationGain:mean(rows,x=>x.validation.gain),meanGenerated:mean(rows,x=>x.skillsGenerated.length),meanActualWork:mean(rows,x=>x.actualWork)};}
  const paired={},pairedProgress={};for(const id of ['random','guided'])for(const domain of ['source','target','holdout']){const bySeed=seeds.map(seed=>{const rows=runs.filter(r=>r.seed===seed);return avg(rows.map(r=>r.arms.find(x=>x.id===id)[domain].winRate-r.arms.find(x=>x.id==='base')[domain].winRate));});const bySeedProgress=seeds.map(seed=>{const rows=runs.filter(r=>r.seed===seed);return avg(rows.map(r=>r.arms.find(x=>x.id===id)[domain].meanProgress-r.arms.find(x=>x.id==='base')[domain].meanProgress));});paired[`${id}_${domain}`]=clusteredInterval(bySeed);pairedProgress[`${id}_${domain}`]=clusteredInterval(bySeedProgress);}
  return {version:'V1.6',config:{...cfg,seeds,tierCount:3},runs,summary,paired,pairedProgress,budget:{equalAllocatedBudget:runs.every(r=>r.equalAllocatedBudget),arms:ARMS.length,candidateEvaluationsPerArm:(cfg.skillCandidates+1)*2*cfg.trainN,notes:'所有策略臂执行相同的诊断、候选评估、验证与审计局数；实际工作量受提前终止影响。'},notes:['技能由失败行为遥测触发的确定性规则模板合成，不使用大模型生成，也不读取最终留出结果。','编译器将技能映射到现有七个模块之一的上下文门控和权重增量；当前没有新增独立评分头，属于可执行技能适配器，不是任意新算法代码。','候选技能只根据训练种子排序；独立验证集决定是否晋级；最终留出集只用于报告。','所有策略臂使用相同诊断局、候选评估、验证和审计局数及分配预算；实际 workUnits 因提前结束而可能不同。','配对置信区间先在每个随机种子内平均三个玩家等级，再以随机种子为独立簇计算；五个种子仍属小样本。','虚拟玩家是有限前瞻规则代理，不代表真人学习或通用智能。']};
 }
 return {SKILL_TEMPLATES,ARMS,makeSkill,validateSkill,compileSkill,diagnoseFailures,guidedSkills,randomSkills,runOne,runExperiment};
})();if(typeof module!=='undefined'&&module.exports)module.exports=V16Lab;
