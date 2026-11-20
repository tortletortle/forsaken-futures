(()=>{
 const $=id=>document.getElementById(id);if(!$('v17-open'))return;let result=null;
 const pct=x=>(100*x).toFixed(1)+'%';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function table(head,rows){return `<div class="table-wrap"><table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
 function download(name,obj){const u=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 $('v17-open').onclick=()=>$('v17-dialog').showModal();$('v17-close').onclick=()=>$('v17-dialog').close();
 $('v17-run').onclick=()=>{
  const seed=Number($('v17-seed').value),n=Number($('v17-seeds').value),seeds=Array.from({length:n},(_,i)=>(seed+i*1110)>>>0);
  const opts={seeds,candidates:Number($('v17-candidates').value),slotBudget:Number($('v17-slots').value),episodeBudget:Number($('v17-budget').value),promotionMargin:Number($('v17-margin').value)};
  $('v17-run').disabled=true;$('v17-export').disabled=true;$('v17-status').textContent='正在生成候选 DSL、编译字节码并运行配对实验…';$('v17-progress').max=seeds.length*3;$('v17-progress').value=0;
  try{const templates=LEVELS.filter(l=>l.id!=='CUSTOM').slice(0,5);result=V17Lab.runExperiment(opts,templates,p=>{$('v17-progress').value=p.completed;$('v17-status').textContent=`完成 ${p.completed}/${p.total} · ${p.tierName}`;});render(result);$('v17-status').textContent='完成 · 最终留出关卡只参与审计，不参与技能生成、排序或晋级。';$('v17-export').disabled=false;}
  catch(e){$('v17-status').textContent='实验失败：'+(e?.stack||e.message);}
  finally{$('v17-run').disabled=false;}
 };
 function render(r){const ids=['base','legacy','v17'],s=r.summary;
  $('v17-summary').innerHTML=`<div class="robust-kpis">${[['配对任务单元',r.runs.length],['每臂候选数',r.config.candidates+1],['独立技能槽',r.config.slotBudget],['分配预算一致',r.budget.equalAllocatedBudget?'是':'否']].map(x=>`<div><small>${x[0]}</small><b>${x[1]}</b></div>`).join('')}</div>`;
  $('v17-arms').innerHTML=table(['策略架构','来源域胜率','目标域胜率','独立留出胜率','留出进度','晋级率','平均验证增益','晋级模块数'],ids.map(id=>[s[id].name,pct(s[id].source),pct(s[id].target),pct(s[id].holdout),pct(s[id].holdoutProgress),pct(s[id].promotionRate),s[id].meanValidationGain.toFixed(4),s[id].meanPromotedModules.toFixed(2)]));
  $('v17-paired').innerHTML=table(['相对基线','平均胜率差','近似95%区间（种子聚类）','种子数'],Object.entries(r.paired).map(([k,v])=>[k,pct(v.mean),`[${pct(v.approx95[0])}, ${pct(v.approx95[1])}]`,v.n]));
  const mods=r.runs.flatMap(x=>x.arms.filter(a=>a.id==='v17').flatMap(a=>a.generated.flatMap(c=>c.modules))).slice(0,40);
  $('v17-library').innerHTML=`<p>本轮展示前 ${mods.length} 个 DSL 模块样本。模块输出通过安全字节码执行，依赖模块按拓扑顺序运行。</p>`+mods.map(m=>`<div class="skill-card"><b>${esc(m.name)}</b> · <code>${esc(m.id)}</code><p>依赖：${m.dependsOn.length?m.dependsOn.map(esc).join(' → '):'无'}；条件：${esc(JSON.stringify(m.condition))}</p><p>评分项：${esc(JSON.stringify(m.program.terms))}；gain=${m.program.gain}</p></div>`).join('');
  const graphs=r.runs.flatMap(x=>x.arms.filter(a=>a.id==='v17').flatMap(a=>a.generated.filter(c=>c.modules.length>1).map(c=>({id:c.id,modules:c.modules.map(m=>({id:m.id,dependsOn:m.dependsOn}))}))));
  $('v17-graph').innerHTML=graphs.length?table(['组合候选','模块依赖链'],graphs.slice(0,20).map(g=>[g.id,g.modules.map(m=>m.id+(m.dependsOn.length?' ← '+m.dependsOn.join(','):'')).join(' → ')])):'<p class="lab-help">本轮没有双模块组合候选。</p>';
  $('v17-diagnostics').innerHTML=table(['种子','玩家等级','缺口标签','候选数 / 晋级'],r.runs.flatMap(x=>x.arms.filter(a=>a.id==='v17').map(a=>[x.seed,x.tierName,Object.entries(x.diagnosis.tags).filter(z=>z[1]>0).map(z=>z[0]+':'+z[1]).join(' · ')||'无',`${a.candidatesGenerated} / ${a.promotedModuleCount}`])));
  $('v17-notes').innerHTML='<ul>'+r.notes.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';
 }
 $('v17-export').onclick=()=>result&&download('forsaken-futures-v1.7-experiment.json',result);
})();
