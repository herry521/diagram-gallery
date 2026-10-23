/* Pure selection logic. Usable from the page and from local, non-browser checks. */
const DEFAULT_FILTERS={task:'all',layout:'all',context:'all',role:'diagrams',access:'all',batch:'all',q:'',mode:'all',sort:'diverse',visibility:'all'};
function diversified(items){
  const groups=new Map();
  items.forEach(d=>{const k=d.layouts[0];if(!groups.has(k))groups.set(k,[]);groups.get(k).push(d)});
  const out=[];let pending=true;
  while(pending){pending=false;for(const group of groups.values()){if(group.length){out.push(group.shift());pending=true}}}
  return out;
}
function selectItems(items,f,favoriteIds=[],latestBatch=''){
  const favorites=new Set(favoriteIds),q=(f.q||'').trim().toLowerCase();
  let result=items.filter(d=>
    (!f.visibility||f.visibility==='all'||d.publication?.status==='allowed')&&
    (f.task==='all'||d.tasks.includes(f.task))&&
    (f.layout==='all'||d.layouts.includes(f.layout))&&
    (f.context==='all'||d.contexts.includes(f.context))&&
    (f.role==='all'||(f.role==='diagrams'?d.role!=='pack':d.role===f.role))&&
    (f.batch==='all'||d.batch===f.batch)&&
    (f.access==='all'||(f.access==='editable'?d.downloaded_editable:f.access==='ppt'?d.downloaded_ppt:f.access==='saved'?d.downloaded_asset:!d.downloaded_editable))&&
    (f.mode==='all'||(f.mode==='new'&&d.batch===latestBatch)||(f.mode==='featured'&&d.featured)||(f.mode==='favorites'&&favorites.has(d.id)))&&
    (!q||[d.id,d.title,d.source,d.relation,d.composition,d.recipe,d.classification_note,d.tags.join(' '),d.task_labels.join(' '),d.layout_labels.join(' '),d.context_labels.join(' ')].join(' ').toLowerCase().includes(q))
  );
  result.sort((a,b)=>f.sort==='id'?a.id.localeCompare(b.id):Number(b.featured)-Number(a.featured)||a.rank-b.rank||a.id.localeCompare(b.id));
  return f.sort==='diverse'?diversified(result):result;
}
function alternativesFor(d,items,limit=3){
  if(d.role==='pack')return [];
  const candidates=items.filter(x=>x.id!==d.id&&x.role!=='pack'&&x.layouts[0]!==d.layouts[0]&&x.tasks.includes(d.tasks[0])&&x.confidence==='visual');
  const score=x=>(x.tasks[0]===d.tasks[0]?6:0)+(x.contexts.some(c=>d.contexts.includes(c))?2:0)+(x.featured?1:0);
  candidates.sort((a,b)=>score(b)-score(a)||a.rank-b.rank||a.id.localeCompare(b.id));
  const out=[],used=new Set();
  for(const x of candidates){if(!used.has(x.layouts[0])){out.push(x);used.add(x.layouts[0]);if(out.length===limit)break}}
  return out;
}
if(typeof module!=='undefined'&&module.exports)module.exports={DEFAULT_FILTERS,diversified,selectItems,alternativesFor};
