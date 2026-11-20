/* Location-based, non-blocking environmental narrative. No effect on game state. */
const Story=(()=>{
 const chapters=[
 {name:'沉没的渡口',en:'01 / THE DROWNED CROSSING',notes:[['守望者的最后一班船','渡口的航灯还亮着。你能带走一段未来，却不能带走整座桥。'],['中继站 · 留言','「返程的桥，不要忘了。」一块损坏的铭牌在空中摇晃。'],['拾得记忆 · 渡口','记录里，一名守望者为后来的人留下了归路。他没有等到最后一班船。'],['归途','门上的刻痕指向来时的方向。它只为携带记忆的人打开。']]},
 {name:'无人之城',en:'02 / THE SILENT METROPOLIS',notes:[['城市边界','所有的路灯都在等待一个不会到来的清晨。让遗迹重新相连。'],['记忆塔 · 封存','塔内保存着街道曾经的声音。人们在离开前把名字刻进了墙壁。'],['停摆的工厂','机械臂停在半空。最后的工单只有一句：为另一条路保留能源。'],['重力井','昔日的货运平台坠入雾海。现在，碎石仍围绕井口旋转。'],['遗落档案 · 复原','这里的居民并未消失于同一天。他们各自选择了不同的离开方式。'],['终点站','这座站台从不售卖单程票。回来的路也是城市的一部分。']]},
 {name:'最后的天穹',en:'03 / THE LAST FIRMAMENT',notes:[['边缘 · 来访者','巨城只剩轮廓。你听见还未发生的未来，在断裂的地平线上回响。'],['重力塔','旧引力机仍将一片天空固定在原处。塔身的纹路记录着每次修复。'],['记忆库 · 星图','第一份档案是星图：未选择的航线仍然发着光。'],['中继台','信号来自未建成的城市。发信者的名字早已遗失。'],['铸造场','这里没有建造机器，只有把未实现的蓝图凝为实体的装置。'],['能源库 · 余烬','第二份档案是一盏从未熄灭的灯。有人为后来者储下了它。'],['冷却井','热量沿着破碎的管线缓缓消散；一切似乎终于学会了等待。'],['桥梁遗迹 · 归路','第三份档案是一张回程票。它提醒你，速度并不是唯一的目标。'],['出口 · 天穹之外','抬头吧，空白的星空里已经出现了你留下的路。']]}
 ];
 function render(i,l,s,done,count){let c=chapters[i]||{name:l.title,en:'RESONANCE / WORLD FORGE',notes:[]},n=c.notes[s.node]||[l.nodes[s.node].name,i===3?'远端的回声穿过虚空。这里的通路依赖另一处遗迹留下的力量。':i===4?'失落的网络需要两道重力回声共同维持。每条线路都能改变归途。':'你进入了自己编织的星图。'];document.body.dataset.chapter=String(i);document.getElementById('scene-name').textContent=c.name;document.getElementById('scene-sub').textContent=c.en;document.getElementById('note-title').textContent=done?'航行结束 / END OF CHAPTER':n[0];document.getElementById('note-text').textContent=done?'你没有选中的未来，成为了他人可以走过的道路。':n[1];document.getElementById('note-progress').innerHTML=Array.from({length:l.relics.length},(_,j)=>`<span class="${s.relicMask&(1<<j)?'lit':''}">◆</span>`).join('');document.getElementById('note-progress').setAttribute('aria-label',`记忆 ${count}/${l.relics.length}`);}
 return {render};
})();
