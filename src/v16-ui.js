(()=>{
 const $=id=>document.getElementById(id);if(!$('v16-open'))return;let result=null;
 const pct=x=>(x*100).toFixed(1)+'%';
 function download(name,obj){const u=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 function table(head,rows){return `<div class="table-wrap"><table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
 $('v16-open').onclick=()=>$('v16-dialog').showModal();$('v16-close').onclick=()=>$('v16-dialog').close();
 $('v16-run').onclick=()=>{
  const seed=Number($('v16-seed').value),n=Number($('v16-seeds').value),seeds=Array.from({length:n},(_,i)=>(seed+i*1103)>>>0);
  const opts={seeds,skillCandidates:Number($('v16-candidates').value),episodeBudget:Number($('v16-budget').value),discoveryN:Number($('v16-discovery').value),trainN:Number($('v16-train').value),validationN:Number($('v16-validation').value),auditN:Number($('v16-audit').value),promotionMargin:Number($('v16-margin').value)};
  $('v16-run').disabled=true;$('v16-export').disabled=true;$('v16-status').textContent='正在运行失败诊断、技能合成、候选评估、验证和独立审计…';$('v16-progress').max=seeds.length*3;$('v16-progress').value=0;
  try{const templates=LEVELS.filter(l=>l.id!=='CUSTOM').slice(0,5);result=V16Lab.runExperiment(opts,templates,p=>{$('v16-progress').value=p.completed;$('v16-status').textContent=`完成 ${p.completed}/${p.total} · ${p.tierName}`;});render(result);$('v16-status').textContent='完成 · 留出任务仅用于最终报告，未参与技能合成与晋级。';$('v16-export').disabled=false;}
  catch(e){$('v16-status').textContent='实验失败：'+(e?.stack||e.message);}
  finally{$('v16-run').disabled=false;}
 };
 function render(r){const s=r.summary,ids=['base','random','guided'];
  $('v16-summary').innerHTML=`<div class="robust-kpis">${[['配对任务单元',r.runs.length],['每臂候选数',r.config.skillCandidates+1],['单局预算',r.config.episodeBudget],['预算分配一致',r.budget.equalAllocatedBudget?'是':'否']].map(x=>`<div><small>${x[0]}</small><b>${x[1]}</b></div>`).join('')}</div>`;
  $('v16-arms').innerHTML=table(['策略臂','来源域胜率','目标域胜率','留出胜率','留出进度','技能晋级率','验证增益'],ids.map(id=>[s[id].name,pct(s[id].source),pct(s[id].target),pct(s[id].holdout),pct(s[id].holdoutProgress),pct(s[id].promotionRate),pct(s[id].meanValidationGain)]));
  $('v16-paired').innerHTML='<h3>胜率配对差值</h3>'+table(['相对无新技能基线','平均差值','按随机种子聚类的近似95%区间','种子数'],Object.entries(r.paired).map(([k,v])=>[k,pct(v.mean),`[${pct(v.approx95[0])}, ${pct(v.approx95[1])}]`,v.n]))+'<h3>行为进度配对差值</h3>'+table(['策略 / 域','平均进度差','近似95%区间','种子数'],Object.entries(r.pairedProgress).map(([k,v])=>[k,pct(v.mean),`[${pct(v.approx95[0])}, ${pct(v.approx95[1])}]`,v.n]));
  const skills=r.runs.flatMap(x=>x.arms.filter(a=>a.id==='guided').map(a=>({seed:x.seed,tier:x.tier,diagnosis:x.diagnosis,skill:a.selectedSkill,validation:a.validation,final:a.validation.accepted?a.selectedSkill:null}))).filter(x=>x.skill);
  $('v16-library').innerHTML=`<h3>本轮合成技能库</h3><p>共合成 ${r.runs.flatMap(x=>x.arms.filter(a=>a.id==='guided').flatMap(a=>a.skillsGenerated)).length} 个候选；以下展示被训练集选中的技能及独立验证晋级结果。</p>`+table(['技能','目标模块','触发条件','权重增量','来源诊断标签','验证结果'],skills.slice(0,24).map(x=>[x.skill.name,x.skill.targetModule,`${x.skill.trigger.feature} ${x.skill.trigger.op} ${x.skill.trigger.threshold}`,x.skill.effect.weightDelta,(x.skill.provenance.failureTags||[]).join(', ')||'回退模板',x.validation.accepted?'晋级':'未晋级']));
  const diag=r.runs.flatMap(x=>x.arms.filter(a=>a.id==='guided').map(a=>({seed:x.seed,tier:x.tier,tags:x.diagnosis.tags,observations:x.diagnosis.episodes})));$('v16-diagnostics').innerHTML='<h3>失败行为诊断</h3>'+table(['种子','玩家等级','诊断局数','缺口标签计数'],diag.map(x=>[x.seed,['新手','探索者','策略型'][x.tier],x.observations,Object.entries(x.tags).map(([k,v])=>`${k}:${v}`).join(' · ')]));
  $('v16-notes').innerHTML='<h3>实验边界</h3><ul>'+r.notes.map(x=>`<li>${x}</li>`).join('')+'</ul>';
 }
 $('v16-export').onclick=()=>result&&download('forsaken-futures-v1.6-experiment.json',result);
})();
