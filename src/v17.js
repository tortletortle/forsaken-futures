/* V1.7: bounded DSL skill modules, bytecode compiler and independent scoring heads. */
const V17Lab=(()=>{
 const isNode=typeof module==='object'&&module.exports;
 const V=isNode?require('./evolution.js'):Evolution;
 const P=isNode?require('./players.js'):Players;
 const M=isNode?require('./modular.js'):ModularLab;
 const V14=isNode?require('./v14.js'):V14Lab;
 const V15=isNode?require('./v15.js'):V15Lab;
 const V16=isNode?require('./v16.js'):V16Lab;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const FEATURES=M.V17_FEATURES;
 const OPS=['gt','gte','lt','lte'];
 const ARMS=[{id:'base',name:'无新增模块基线'},{id:'legacy',name:'V1.6 既有模块适配器'},{id:'v17',name:'V1.7 独立技能评分头'}];
 const TEMPLATES={
  recovery:{name:'困境恢复策略',condition:[['recoveryRisk','gte'],['mobility','lte']],terms:['mobility','routeSlack','loopRisk']},
  exploration:{name:'探索边界策略',condition:[['novelty','gte'],['progress','lte']],terms:['novelty','remaining','targetDistance']},
  resource:{name:'资源时机策略',condition:[['scarcity','gte'],['targetDistance','gte']],terms:['inventory','scarcity','targetDistance']},
  loop:{name:'循环逃逸策略',condition:[['loopRisk','gte'],['mobility','lte']],terms:['loopRisk','mobility','novelty']},
  relic:{name:'碎片回收策略',condition:[['remaining','gte'],['station','gte']],terms:['remaining','station','progress']},
  route:{name:'远距返程策略',condition:[['targetDistance','gte'],['routeSlack','lte']],terms:['targetDistance','routeSlack','startDistance']}
 };
 function compileExpr(node,out,allowed,depth=0){
  if(depth>4||!node||typeof node!=='object')throw Error('条件表达式深度或结构非法');
  if(node.op==='all'||node.op==='any'){
   if(!Array.isArray(node.args)||node.args.length<2||node.args.length>4)throw Error('all/any 参数数目非法');
   node.args.forEach(x=>compileExpr(x,out,allowed,depth+1));out.push({op:node.op==='all'?'AND':'OR',count:node.args.length});return;
  }
  if(node.op==='not'){compileExpr(node.arg,out,allowed,depth+1);out.push({op:'NOT'});return;}
  if(!OPS.includes(node.op)||!allowed.has(node.feature)||!Number.isFinite(node.value)||node.value< -1||node.value>1)throw Error('条件比较节点非法');
  out.push({op:'PUSH_FEATURE',name:node.feature},{op:'PUSH_CONST',value:node.value},{op:node.op.toUpperCase()});
 }
 function topoSort(modules){
  const byId=new Map(modules.map(m=>[m.id,m]));if(byId.size!==modules.length)throw Error('模块 ID 重复');
  const state=new Map(),out=[];
  function visit(id){const s=state.get(id)||0;if(s===1)throw Error('技能依赖存在循环');if(s===2)return;const m=byId.get(id);if(!m)throw Error('依赖模块不存在：'+id);state.set(id,1);for(const d of m.dependsOn||[])visit(d);state.set(id,2);out.push(m);}
  modules.forEach(m=>visit(m.id));return out;
 }
 function validateModule(m,knownIds){
  if(!m||typeof m.id!=='string'||!/^N17_[a-z0-9_]{3,40}$/i.test(m.id))throw Error('技能模块 ID 不合法');
  if(!Array.isArray(m.dependsOn)||m.dependsOn.length>2||m.dependsOn.includes(m.id)||m.dependsOn.some(x=>!knownIds.has(x)))throw Error('技能依赖非法');
  if(!m.program||!Number.isFinite(m.program.bias)||Math.abs(m.program.bias)>1.5||!Number.isFinite(m.program.gain)||Math.abs(m.program.gain)>1.8)throw Error('技能输出参数越界');
  if(!Array.isArray(m.program.terms)||m.program.terms.length<1||m.program.terms.length>4)throw Error('技能评分项数量非法');
  const allowed=new Set([...FEATURES,...(m.dependsOn||[]).map(x=>'module:'+x)]);
  for(const t of m.program.terms){if(!allowed.has(t.feature)||!Number.isFinite(t.weight)||Math.abs(t.weight)>2)throw Error('技能评分项非法');}
  return true;
 }
 function compileModule(m,knownIds){
  validateModule(m,knownIds);const allowed=new Set([...FEATURES,...(m.dependsOn||[]).map(x=>'module:'+x)]),bytecode=[];
  compileExpr(m.condition,bytecode,allowed);
  bytecode.push({op:'LINEAR',bias:m.program.bias,terms:clone(m.program.terms)},{op:'TANH'},{op:'SCALE',value:m.program.gain},{op:'GATE'},{op:'EMIT'});
  return {...clone(m),bytecode,compilerVersion:'1.7.0'};
 }

 function repairSkillGraph(modules,slotBudget=2){
  if(!Array.isArray(modules)||modules.length<1||modules.length>slotBudget||slotBudget>3)throw Error('技能模块数量超出槽位预算');
  const out=clone(modules),ids=new Set(out.map(m=>m?.id));if(ids.size!==out.length)throw Error('技能模块 ID 重复');
  const repairs=[];
  for(const m of out){
   if(!m||typeof m.id!=='string'||!/^N17_[a-z0-9_]{3,40}$/i.test(m.id))throw Error('技能模块 ID 不合法');
   const oldDeps=Array.isArray(m.dependsOn)?m.dependsOn:[];
   m.dependsOn=[...new Set(oldDeps)].filter(d=>ids.has(d)&&d!==m.id).slice(0,2);
   if(m.dependsOn.length!==oldDeps.length)repairs.push({module:m.id,kind:'dependency_prune'});
   m.program=m.program||{};
   const oldBias=Number(m.program.bias)||0,oldGain=Number(m.program.gain)||0;
   m.program.bias=clamp(oldBias,-1.5,1.5);m.program.gain=clamp(oldGain,-1.8,1.8);
   if(m.program.bias!==oldBias||m.program.gain!==oldGain)repairs.push({module:m.id,kind:'parameter_clip'});
   const allowed=new Set([...FEATURES,...m.dependsOn.map(d=>'module:'+d)]);
   const terms=Array.isArray(m.program.terms)?m.program.terms:[];const seen=new Set();
   m.program.terms=terms.filter(t=>t&&allowed.has(t.feature)&&!seen.has(t.feature)).slice(0,4).map(t=>{seen.add(t.feature);const w=Number(t.weight)||0;const clipped=clamp(w,-2,2);if(clipped!==w)repairs.push({module:m.id,kind:'weight_clip'});return {feature:t.feature,weight:clipped};});
   if(!m.program.terms.length)throw Error('技能修复后没有合法评分项');
   function repairExpr(node,depth=0){if(depth>4||!node||typeof node!=='object')throw Error('条件表达式不可修复');if(node.op==='all'||node.op==='any'){if(!Array.isArray(node.args)||node.args.length<2||node.args.length>4)throw Error('条件逻辑参数不可修复');return {op:node.op,args:node.args.map(x=>repairExpr(x,depth+1))};}if(node.op==='not')return {op:'not',arg:repairExpr(node.arg,depth+1)};if(!OPS.includes(node.op)||!allowed.has(node.feature)||!Number.isFinite(node.value))throw Error('条件表达式包含不支持操作');const value=clamp(node.value,-1,1);if(value!==node.value)repairs.push({module:m.id,kind:'threshold_clip'});return {op:node.op,feature:node.feature,value};}
   m.condition=repairExpr(m.condition);
  }
  const sorted=topoSort(out);return {modules:sorted,repairs};
 }
 function mutateModule(module,rng){
  const m=clone(module),op=rngInt(rng,4);
  if(op===0)m.program.gain=clamp(m.program.gain+(rng()-.5)*.7,-1.8,1.8);
  else if(op===1){const t=m.program.terms[rngInt(rng,m.program.terms.length)];t.weight=clamp(t.weight+(rng()-.5)*.9,-2,2);}
  else if(op===2){const cmp=m.condition.op==='all'||m.condition.op==='any'?m.condition.args[0]:m.condition;cmp.value=clamp(cmp.value+(rng()-.5)*.3,-1,1);}
  else m.program.bias=clamp(m.program.bias+(rng()-.5)*.5,-1.5,1.5);
  return m;
 }
 function crossoverModules(a,b,id){
  if(JSON.stringify(a.dependsOn||[])!==JSON.stringify(b.dependsOn||[]))throw Error('交叉父代依赖结构必须一致');
  const terms=[];for(let i=0;i<Math.max(a.program.terms.length,b.program.terms.length)&&terms.length<4;i++){const src=i%2?b:a,t=src.program.terms[i%src.program.terms.length];if(t&&!terms.some(x=>x.feature===t.feature))terms.push(clone(t));}
  return {id:id||'N17_cross_child',name:`${a.name} × ${b.name}`,primitive:a.primitive,dependsOn:clone(a.dependsOn||[]),condition:clone(a.condition),program:{terms,bias:(a.program.bias+b.program.bias)/2,gain:(a.program.gain+b.program.gain)/2},provenance:{method:'skill_crossover',parents:[a.id,b.id]}};
 }

 function compileSkillGraph(base,modules,slotBudget=2){
  const repaired=repairSkillGraph(modules,slotBudget);
  const ids=new Set(repaired.modules.map(m=>m.id));repaired.modules.forEach(m=>validateModule(m,ids));
  const sorted=repaired.modules.map(m=>compileModule(m,ids));
  const g=clone(base);g.v17={version:1,slotBudget,costPerSlot:8,skills:sorted,graph:sorted.map(m=>({id:m.id,dependsOn:[...m.dependsOn]})),repairs:repaired.repairs,compiler:'V17-SafeDSL'};
  return g;
 }
 function makeCondition(template,rng){const [a,b]=template.condition;const mk=x=>({op:x[1],feature:x[0],value:Number((.25+rng()*.5).toFixed(3))});return {op:'all',args:[mk(a),mk(b)]};}
 function makeModule(kind,rng,serial,dependsOn=[],namespace='default'){
  const t=TEMPLATES[kind];if(!t)throw Error('未知技能原语');
  const features=[...t.terms];
  const terms=features.slice(0,2+rngInt(rng,2)).map(feature=>({feature,weight:Number(((rng()-.5)*2.8).toFixed(3))}));
  for(const dep of dependsOn)terms.push({feature:'module:'+dep,weight:Number(((rng()-.5)*1.4).toFixed(3))});
  return {id:`N17_${String(namespace).replace(/[^a-z0-9_]/gi,'_')}_${kind}_${serial}`,name:t.name,primitive:kind,dependsOn:[...dependsOn],condition:makeCondition(t,rng),program:{terms,bias:Number(((rng()-.5)*.8).toFixed(3)),gain:Number((.45+rng()*.95).toFixed(3))},provenance:{method:'failure_guided_grammar',template:kind,serial}};
 }
 function rngInt(rng,n){return Math.floor(rng()*n);}
 function synthesizeCandidates(diagnosis,rng,count=4,namespace='default'){
  const order=diagnosis.ranked.filter(x=>x[1]>0).map(x=>x[0]);
  const map={recovery:'recovery',memory:'loop',explore:'exploration',facility:'relic',route:'route',economy:'resource'};
  const kinds=[...new Set(order.map(x=>map[x]).filter(Boolean))];
  const fallback=['recovery','exploration','resource','loop','relic','route'];
  const pool=kinds.concat(fallback.filter(x=>!kinds.includes(x)));
  return Array.from({length:count},(_,i)=>{
   const kind=pool[i%pool.length],a=makeModule(kind,rng,`${i+1}a`,[],namespace);
   if(i%2===1){const secondKind=pool[(i+2)%pool.length],b=makeModule(secondKind,rng,`${i+1}b`,[a.id],namespace);return {id:`C17_${i+1}`,modules:[a,b],composition:'two-stage'};}
   return {id:`C17_${i+1}`,modules:[a],composition:'single-head'};
  });
 }
 function seedByLevel(seed,salt,levels,n){return levels.map((_,i)=>{const r=V.rng((seed^salt^(i*0x9e37))>>>0);return Array.from({length:n},()=>Math.floor(r()*4294967296));});}
 function evaluate(levels,genome,seedsByLevel,budget){const runs=[];for(let i=0;i<levels.length;i++)for(const seed of seedsByLevel[i]){const e=M.playEpisode(levels[i],genome,seed,budget);runs.push({...e,levelId:levels[i].id,progress:.65*e.peak/Math.max(1,levels[i].relics.length)+.35*e.visited/Math.max(1,levels[i].nodes.length)});}const p=P.profiles[genome.tier],n=Math.max(1,runs.length),winRate=runs.filter(x=>x.win).length/n,meanProgress=avg(runs.map(x=>x.progress)),meanAttempts=avg(runs.map(x=>x.attempts/p.steps)),meanUndos=avg(runs.map(x=>x.undos/Math.max(1,p.undo)));return {winRate,meanProgress,fitness:winRate+.15*meanProgress-.02*meanAttempts-.015*meanUndos,wins:runs.filter(x=>x.win).length,n,actualWork:runs.reduce((s,x)=>s+x.workUnits,0),allocatedWork:runs.length*budget,skillEvaluations:runs.reduce((s,x)=>s+(x.skillEvaluations||0),0),budgetStops:runs.filter(x=>x.reason==='compute_budget').length,runs};}
 function makeBase(tier,seed,slots=2){const g=V15.makeGenome(tier,seed,{id:'static'});g.v17={version:1,slotBudget:slots,costPerSlot:8,skills:[],graph:[],compiler:'V17-SafeDSL'};return g;}
 function scoreCandidates(base,candidates,levels,seeds,budget){const all=[{index:0,modules:[],genome:base,composition:'base'},...candidates.map((c,i)=>({index:i+1,modules:c.modules,genome:compileSkillGraph(base,c.modules,base.v17.slotBudget),composition:c.composition}))];return all.map(c=>{const ev=evaluate(levels,c.genome,seeds,budget);return {...c,fitness:ev.fitness,winRate:ev.winRate,progress:ev.meanProgress,actualWork:ev.actualWork,allocatedWork:ev.allocatedWork,skillEvaluations:ev.skillEvaluations,n:ev.n};}).sort((a,b)=>b.fitness-a.fitness||a.index-b.index);}
 function clustered(values){const n=values.length,m=avg(values),sd=Math.sqrt(values.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,n-1)),t=n===5?2.776:n===4?3.182:n===3?4.303:1.96;return {mean:m,approx95:[m-t*sd/Math.sqrt(n),m+t*sd/Math.sqrt(n)],n};}
 function runOne(seed,tier,templates,cfg){
  const tasks=V14.makeTaskPack(seed,templates),base=makeBase(tier,(seed^((tier+1)*0x17a71))>>>0,cfg.slotBudget);
  const discoverySeeds=seedByLevel(seed,0x171001,tasks.target,cfg.discoveryN),trainSeeds=seedByLevel(seed,0x172001,tasks.target,cfg.trainN),validationSeeds=seedByLevel(seed,0x173001,tasks.target,cfg.validationN),sourceSeeds=seedByLevel(seed,0x174001,tasks.source,cfg.auditN),targetSeeds=seedByLevel(seed,0x175001,tasks.target,cfg.auditN),holdSeeds=seedByLevel(seed,0x176001,tasks.holdout,cfg.auditN);
  const diagnosis=V16.diagnoseFailures(tasks.target,base,discoverySeeds,cfg.episodeBudget),arms=[];
  for(let ai=0;ai<ARMS.length;ai++){
   const arm=ARMS[ai],rng=V.rng((seed^0x17b001^(tier*0x9e37)^(ai*0x51a5))>>>0);
   let candidates=[];
   if(arm.id==='legacy') candidates=V16.guidedSkills(diagnosis,rng,cfg.candidates).map((skill,i)=>({id:`L16_${i}`,modules:[],legacySkill:skill,composition:'legacy-adapter'}));
   if(arm.id==='v17') candidates=synthesizeCandidates(diagnosis,rng,cfg.candidates,`s${seed}_t${tier}`);
   let scored;
   if(arm.id==='base'){
    const pool=Array.from({length:cfg.candidates+1},(_,index)=>({index,genome:clone(base),skill:null,composition:'base'}));
    scored=pool.map(c=>{const e=evaluate(tasks.target,c.genome,trainSeeds,cfg.episodeBudget);return {...c,fitness:e.fitness,winRate:e.winRate,progress:e.meanProgress,actualWork:e.actualWork,allocatedWork:e.allocatedWork,skillEvaluations:e.skillEvaluations||0,n:e.n};}).sort((a,b)=>b.fitness-a.fitness||a.index-b.index);
   }else if(arm.id==='legacy'){
    const pool=[{index:0,genome:base,skill:null,composition:'base'},...candidates.map((c,i)=>{const g=V16.compileSkill(base,c.legacySkill);g.v17=clone(base.v17);return {index:i+1,genome:g,skill:c.legacySkill,composition:'legacy-adapter'};})];
    scored=pool.map(c=>{const e=evaluate(tasks.target,c.genome,trainSeeds,cfg.episodeBudget);return {...c,fitness:e.fitness,winRate:e.winRate,progress:e.meanProgress,actualWork:e.actualWork,allocatedWork:e.allocatedWork,skillEvaluations:e.skillEvaluations||0,n:e.n};}).sort((a,b)=>b.fitness-a.fitness||a.index-b.index);
   }else scored=scoreCandidates(base,candidates,tasks.target,trainSeeds,cfg.episodeBudget);
   const chosen=scored[0],baseVal=evaluate(tasks.target,base,validationSeeds,cfg.episodeBudget),candVal=evaluate(tasks.target,chosen.genome,validationSeeds,cfg.episodeBudget),gain=candVal.fitness-baseVal.fitness,accepted=chosen.index>0&&gain>=cfg.promotionMargin;
   const finalGenome=accepted?clone(chosen.genome):clone(base),source=evaluate(tasks.source,finalGenome,sourceSeeds,cfg.episodeBudget),target=evaluate(tasks.target,finalGenome,targetSeeds,cfg.episodeBudget),holdout=evaluate(tasks.holdout,finalGenome,holdSeeds,cfg.episodeBudget);
   arms.push({id:arm.id,name:arm.name,candidatesGenerated:candidates.length,selectedIndex:chosen.index,selectedSkill:chosen.skill||chosen.modules||null,selectedComposition:chosen.composition,trainingFitness:chosen.fitness,validation:{baseFitness:baseVal.fitness,candidateFitness:candVal.fitness,gain,accepted},promotedModuleCount:accepted?(chosen.genome.v17?.skills?.length||0):0,finalGenome,source:{winRate:source.winRate,progress:source.meanProgress,n:source.n,actualWork:source.actualWork,allocatedWork:source.allocatedWork},target:{winRate:target.winRate,progress:target.meanProgress,n:target.n,actualWork:target.actualWork,allocatedWork:target.allocatedWork},holdout:{winRate:holdout.winRate,progress:holdout.meanProgress,n:holdout.n,actualWork:holdout.actualWork,allocatedWork:holdout.allocatedWork},skillEvaluations:scored.reduce((sum,x)=>sum+(x.skillEvaluations||0),0),candidateScores:scored.map(x=>({index:x.index,composition:x.composition,fitness:x.fitness,winRate:x.winRate,progress:x.progress,skillEvaluations:x.skillEvaluations||0})),generated:candidates});
  }
  const sharedDiscovery=tasks.target.length*cfg.discoveryN,expectedTrain=(cfg.candidates+1)*tasks.target.length*cfg.trainN,expectedValidation=2*tasks.target.length*cfg.validationN,expectedAudit=(tasks.source.length+tasks.target.length+tasks.holdout.length)*cfg.auditN;
  const armSpecificTotal=expectedTrain+expectedValidation+expectedAudit;
  const counts=arms.map(a=>({id:a.id,sharedDiscovery,train:expectedTrain,validation:expectedValidation,audit:expectedAudit,armSpecificTotal,allocatedArmSpecific:armSpecificTotal*cfg.episodeBudget}));
  return {seed,tier,tierName:P.profiles[tier].name,tasks:{source:tasks.source.map(l=>l.id),target:tasks.target.map(l=>l.id),holdout:tasks.holdout.map(l=>l.id)},diagnosis,arms,budget:{counts,equalEpisodeAllocation:counts.every(x=>x.armSpecificTotal===counts[0].armSpecificTotal),equalAllocatedBudget:counts.every(x=>x.allocatedArmSpecific===counts[0].allocatedArmSpecific),sharedDiscoveryExecutedOnce:true}};
 }
 function runExperiment(opts,templates,onProgress=()=>{}){
  const seeds=opts.seeds||[1701,2811,3921,4031,5141],cfg={candidates:Number(opts.candidates??4),discoveryN:Number(opts.discoveryN??2),trainN:Number(opts.trainN??2),validationN:Number(opts.validationN??2),auditN:Number(opts.auditN??2),episodeBudget:Number(opts.episodeBudget??2400),promotionMargin:Number(opts.promotionMargin??.01),slotBudget:Number(opts.slotBudget??2)};
  if(!Array.isArray(seeds)||seeds.length<3||seeds.length>8)throw Error('需要3–8个配对随机种子');if(cfg.candidates<2||cfg.candidates>6||cfg.discoveryN<1||cfg.discoveryN>3||cfg.trainN<1||cfg.trainN>3||cfg.validationN<1||cfg.validationN>3||cfg.auditN<1||cfg.auditN>3||cfg.episodeBudget<900||cfg.episodeBudget>6000||cfg.promotionMargin<0||cfg.promotionMargin>.2||cfg.slotBudget<1||cfg.slotBudget>3)throw Error('V1.7 参数超出范围');
  const runs=[],total=seeds.length*3;for(const seed of seeds)for(let tier=0;tier<3;tier++){const row=runOne(seed,tier,templates,cfg);runs.push(row);onProgress({completed:runs.length,total,seed,tier,tierName:row.tierName});}
  const summary={};for(const arm of ARMS){const rows=runs.flatMap(r=>r.arms.filter(a=>a.id===arm.id));summary[arm.id]={name:arm.name,source:avg(rows.map(x=>x.source.winRate)),target:avg(rows.map(x=>x.target.winRate)),holdout:avg(rows.map(x=>x.holdout.winRate)),sourceProgress:avg(rows.map(x=>x.source.progress)),targetProgress:avg(rows.map(x=>x.target.progress)),holdoutProgress:avg(rows.map(x=>x.holdout.progress)),promotionRate:avg(rows.map(x=>Number(x.validation.accepted))),meanValidationGain:avg(rows.map(x=>x.validation.gain)),meanPromotedModules:avg(rows.map(x=>x.promotedModuleCount)),meanSkillEvaluations:avg(rows.map(x=>x.skillEvaluations))};}
  const paired={};for(const id of ['legacy','v17'])for(const domain of ['source','target','holdout']){const diffs=seeds.map(seed=>avg(runs.filter(r=>r.seed===seed).map(r=>r.arms.find(a=>a.id===id)[domain].winRate-r.arms.find(a=>a.id==='base')[domain].winRate)));paired[`${id}_${domain}`]=clustered(diffs);}
  const targetN=2,sourceN=2,holdoutN=3,taskUnits=runs.length,sharedDiscoveryEpisodes=taskUnits*targetN*cfg.discoveryN,trainEpisodes=taskUnits*ARMS.length*(cfg.candidates+1)*targetN*cfg.trainN,validationEpisodes=taskUnits*ARMS.length*2*targetN*cfg.validationN,auditEpisodes=taskUnits*ARMS.length*(sourceN+targetN+holdoutN)*cfg.auditN;
  return {version:'V1.7',config:{...cfg,seeds,tierCount:3},runs,summary,paired,budget:{equalEpisodeAllocation:runs.every(r=>r.budget.equalEpisodeAllocation),equalAllocatedBudget:runs.every(r=>r.budget.equalAllocatedBudget),sharedDiscoveryEpisodes,trainEpisodes,validationEpisodes,auditEpisodes,totalSimulatedEpisodes:sharedDiscoveryEpisodes+trainEpisodes+validationEpisodes+auditEpisodes,totalAllocatedAbstractWorkUnits:(sharedDiscoveryEpisodes+trainEpisodes+validationEpisodes+auditEpisodes)*cfg.episodeBudget,sharedDiscoveryExecutedOnce:true,abstractWorkUnits:true,notes:'失败诊断是三个策略臂共享的前置数据，只实际执行一次；每臂的候选、验证、审计局数及分配预算完全一致。抽象预算不是 CPU 时间。'},notes:['V1.7 技能是受限 DSL 编译出的独立加性评分头，具有独立条件、线性特征项、增益和可选模块依赖；不是任意代码生成或神经网络自动架构搜索。','字节码解释器仅执行白名单指令，不使用 eval/Function。','候选按目标训练集排序，独立验证集决定晋级；最终留出关卡仅审计。','V1.6 适配器作为对照，仍修改已有模块的 gate/allele/weight；V1.7 模块直接向候选动作评分添加独立输出。','每个 genome 预留相同技能槽预算，基线、V1.6 与 V1.7 的每状态抽象评分成本相同；实际工作量因早停而不同。','虚拟玩家为有限前瞻规则代理，不能代表真人游戏体验；五个随机种子不足以证明统计显著性。']};
 }
 return {FEATURES,ARMS,TEMPLATES,compileExpr,compileModule,compileSkillGraph,validateModule,repairSkillGraph,mutateModule,crossoverModules,topoSort,synthesizeCandidates,runExperiment,runOne,evaluate,makeBase};
})();if(typeof module!=='undefined'&&module.exports)module.exports=V17Lab;
