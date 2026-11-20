/* Deterministic rules ported from the original Python reference. */
const Engine = (() => {
  const types = 'BPW';
  const key = s => JSON.stringify([s.node,s.inventory,s.choices,s.relicMask]);
  const maskOn = (l,n) => l.relics.includes(n) ? 1 << l.relics.indexOf(n) : 0;
  const initial = l => ({node:0, inventory:[0,0,0], choices:l.stations.map(()=>-1), relicMask:maskOn(l,0)});
  const won = (l,s) => s.node===l.goal && s.relicMask===(1<<l.relics.length)-1;
  const echoes = (l,s) => {const m=new Map(); s.choices.forEach((c,i)=>{if(c<0)return;const e=l.stations[i][2-c][1];if(!m.has(e))m.set(e,[]);m.get(e).push(i)});return m;};
  const entities = (l,s) => [...echoes(l,s)].sort((a,b)=>a[0]-b[0]).map(([edge,sources])=>{const [u,v,type]=l.edges[edge], a=l.nodes[u],b=l.nodes[v];return {id:`echo-${edge}`,edge,type,sources,x:(a.x+b.x)/2,y:(a.y+b.y)/2,radians:Math.atan2(b.y-a.y,b.x-a.x),span:Math.hypot(b.x-a.x,b.y-a.y)};});
  // Each gate has a primary slot and zero or more supplemental slots.
  // A designated remote echo may satisfy a supplemental slot, otherwise a token is required.
  function requirements(l,s,i,mode='full') {
    const e=l.edges[i];if(!e)return [];
    const active=mode==='token_only'?new Map():echoes(l,s);
    const slots=[{type:e[2],sources:[i],primary:true}];
    if(mode!=='no_gates')for(const g of l.gates?.[i]||[])slots.push({type:g.type,sources:g.sources,primary:false});
    return slots.map(g=>({...g,via:g.sources.filter(x=>(g.primary||mode!=='no_relay')&&active.has(x))}));
  }
  function moveCost(l,s,i,mode='full') {const counts=[0,0,0];for(const g of requirements(l,s,i,mode))if(!g.via.length)counts[types.indexOf(g.type)]++;return counts;}
  function step(l,s,a,mode='full') {
    const fail=reason=>({ok:false,reason});
    if(won(l,s)) return fail('WON');
    if(!a || !Number.isInteger(a.index)) return fail('INVALID_ACTION');
    const i=a.index, n={node:s.node,inventory:[...s.inventory],choices:[...s.choices],relicMask:s.relicMask};
    if(a.kind==='choose'){
      if(!l.stations[i] || ![0,1].includes(a.option))return fail('INVALID_ACTION');
      if(l.stations[i][0]!==s.node)return fail('NOT_HERE');
      if(s.choices[i]!==-1)return fail('STATION_USED');
      n.choices[i]=a.option;
      n.inventory[types.indexOf(l.stations[i][1+a.option][0])]+=mode==='echo_only'?0:1;
    } else if(a.kind==='move'){
      if(!l.edges[i] || (a.option!==undefined && a.option!==-1))return fail('INVALID_ACTION');
      const [u,v,t]=l.edges[i];
      if(s.node!==u&&s.node!==v)return fail('NOT_ADJACENT');
      const cost=moveCost(l,s,i,mode);if(cost.some((c,j)=>c>n.inventory[j]))return fail('NO_RESOURCE');n.inventory=n.inventory.map((v,j)=>v-cost[j]);
      n.node=s.node===u?v:u;n.relicMask|=maskOn(l,n.node);
    } else return fail('INVALID_ACTION');
    return {ok:true,state:n};
  }
  function actions(l,s,fixed=null){
    if(won(l,s))return [];
    const a=[];l.stations.forEach(([p],i)=>{if(p===s.node&&s.choices[i]===-1)for(const option of [0,1])if(fixed===null||option===fixed)a.push({kind:'choose',index:i,option})});
    l.edges.forEach(([u,v],i)=>{if(s.node===u||s.node===v)a.push({kind:'move',index:i})});return a;
  }
  function search(l,start=initial(l),fixed=null,mode='full',limit=30000){
    const k0=key(start), states=new Map([[k0,start]]),dist=new Map([[k0,0]]),parents=new Map(),reverse=new Map(),queue=[k0],wins=[],profiles=new Map();
    let complete=true; outer: for(let j=0;j<queue.length;j++) {const k=queue[j],s=states.get(k);if(won(l,s)){wins.push(k);const profile=JSON.stringify(s.choices);if(!profiles.has(profile))profiles.set(profile,k);continue;}
      for(const a of actions(l,s,fixed)){const r=step(l,s,a,mode);if(!r.ok)continue;const nk=key(r.state);if(!reverse.has(nk))reverse.set(nk,[]);reverse.get(nk).push(k);if(!states.has(nk)){if(states.size>=limit){complete=false;break outer;}states.set(nk,r.state);dist.set(nk,dist.get(k)+1);parents.set(nk,[k,a]);queue.push(nk);}}
    }
    const viable=new Set(wins), rq=[...wins];for(let i=0;i<rq.length;i++)for(const p of reverse.get(rq[i])||[])if(!viable.has(p)){viable.add(p);rq.push(p);}
    const route=k=>{const a=[];while(k!==k0){const [p,x]=parents.get(k);a.push(x);k=p;}return a.reverse();};
    const spent=s=>s.choices.filter(c=>c!==-1).length-s.inventory.reduce((a,b)=>a+b,0);
    const costs=new Map();for(const k of wins){const pair=[dist.get(k),spent(states.get(k))-spent(start)];const str=JSON.stringify(pair);if(!costs.has(str))costs.set(str,k);}
    const pairs=[...costs.keys()].map(JSON.parse);const frontier=pairs.filter(c=>!pairs.some(o=>o!==c&&o[0]<=c[0]&&o[1]<=c[1]&&(o[0]<c[0]||o[1]<c[1]))).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    return {complete,states,dead:complete?states.size-viable.size:null,profiles,shortest:wins.length?dist.get(wins[0]):null,route:wins.length?route(wins[0]):null,frontier,optimal:frontier.map(c=>({cost:c,route:route(costs.get(JSON.stringify(c)))})),viable};
  }
  function validate(l){
    const n=l.nodes.length;const check=(b)=>{if(!b)throw Error('Invalid level '+l.id)};
    check(n>0&&l.nodes.every((x,i)=>x.id===i&&Number.isFinite(x.x)&&Number.isFinite(x.y))&&new Set(l.nodes.map(x=>`${x.x},${x.y}`)).size===n);
    const validNode=x=>Number.isInteger(x)&&x>=0&&x<n;
    check(validNode(l.goal)&&l.relics.length<31&&new Set(l.relics).size===l.relics.length&&l.relics.every(validNode));
    const pairs=new Set();for(const [u,v,t] of l.edges){check(validNode(u)&&validNode(v)&&u!==v&&types.includes(t)&&t.length===1);let k=[u,v].sort((a,b)=>a-b).join(',');check(!pairs.has(k));pairs.add(k);}
    for(const [p,a,b] of l.stations){check(validNode(p)&&a[0]!==b[0]);for(const [t,i] of [a,b])check(Number.isInteger(i)&&l.edges[i]?.[2]===t);}
    check(n<=12&&l.edges.length<=20&&l.stations.length<=8&&l.relics.length<=8);
    check(typeof l.id==='string'&&typeof l.title==='string'&&l.title.length>0&&l.title.length<=50&&l.nodes.every(x=>typeof x.name==='string'&&x.name.length>0&&x.name.length<=30&&Math.abs(x.x)<=1500&&Math.abs(x.y)<=1500));
    check(new Set(l.stations.map(x=>x[0])).size===l.stations.length);
    check(l.gates===undefined||(l.gates&&typeof l.gates==='object'&&!Array.isArray(l.gates)));
    for(const [i,slots] of Object.entries(l.gates||{})){check(/^\d+$/.test(i)&&String(+i)===i&&!!l.edges[+i]&&Array.isArray(slots)&&slots.length<=2);for(const g of slots){check(g&&typeof g.type==='string'&&g.type.length===1&&types.includes(g.type)&&Array.isArray(g.sources)&&g.sources.length<=3&&new Set(g.sources).size===g.sources.length&&g.sources.every(j=>Number.isInteger(j)&&j!==+i&&l.edges[j]?.[2]===g.type));}}
    return true;
  }
  function replay(l,log){if(!Array.isArray(log))throw Error('Invalid log');let s=initial(l);let history=[s];for(const a of log){let r=step(l,s,a);if(!r.ok)throw Error(r.reason);s=r.state;history.push(s);}return history;}
  return {types,key,initial,won,requirements,moveCost,echoes,entities,step,actions,search,validate,replay};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Engine;
