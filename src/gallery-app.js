const LIB=JSON.parse(document.getElementById('library-data').textContent),DATA=LIB.items,TAX=LIB.taxonomy,TOURS=LIB.learning_paths,byId=Object.fromEntries(DATA.map(x=>[x.id,x]));
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names=Object.fromEntries(['tasks','layouts','contexts','roles'].map(k=>[k,Object.fromEntries(TAX[k].map(x=>[x.id,x.label]))]));
DATA.forEach(d=>{d.task_labels??=d.tasks.map(k=>names.tasks[k]);d.layout_labels??=d.layouts.map(k=>names.layouts[k]);d.context_labels??=d.contexts.map(k=>names.contexts[k]);d.role_label??=names.roles[d.role];d.assets??=[];d.tags??=[];});
if(LIB.public_site)DEFAULT_FILTERS.visibility='allowed';
let filters={...DEFAULT_FILTERS},view='purpose',tourId='cdp',favorites=new Set(),selected=new Set(),visibleItems=[],detailItems=[],currentDetailId=null,lastFocus=null,toastTimer;
try{const stored=JSON.parse(localStorage.getItem('composition-favorites-v1')||'[]');if(Array.isArray(stored))favorites=new Set(stored.filter(id=>byId[id]))}catch(e){}
function toast(s){clearTimeout(toastTimer);$('#toast').textContent=s;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,2600)}
function link(h,t){return '<a href="'+esc(h)+'" target="_blank" rel="noopener">'+esc(t)+'</a>'}
const BLANK_IMAGE='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',PAGE_SIZE=12,MAX_IMAGE_REQUESTS=3;
let renderedCount=0,detailGeneration=0,masonryFrame=0,offlineDetailsPromise=null;
const detailCache=new Map(),imageQueue=[],imageLoads=new Map();
function loadOfflineDetails(){
  if(!offlineDetailsPromise)offlineDetailsPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');let timer;
    const fail=()=>{clearTimeout(timer);script.remove();offlineDetailsPromise=null;reject(new Error('离线详情未能读取，请保留完整 data 文件夹并重试'))};
    script.src=new URL(LIB.offline_detail_script,document.baseURI).href;
    script.onload=()=>{const data=window.__galleryOfflineDetails;if(!data||typeof data!=='object'||!Object.keys(data).length){fail();return}clearTimeout(timer);resolve(data)};
    script.onerror=fail;timer=setTimeout(fail,20000);document.head.append(script);
  });return offlineDetailsPromise;
}
function loadDetail(d){
  if(!d.detail_href)return Promise.resolve(d);
  if(!detailCache.has(d.id))detailCache.set(d.id,(async()=>{
    let full;
    if(location.protocol==='file:')full=(await loadOfflineDetails())[d.id];
    else{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const response=await fetch(new URL(d.detail_href,document.baseURI),{credentials:'omit',signal:controller.signal});if(!response.ok)throw new Error('详情暂时无法加载（'+response.status+'）');full=await response.json()}catch(e){if(e.name==='AbortError')throw new Error('详情加载超时，请重试');throw e}finally{clearTimeout(timer)}}
    if(!full||full.id!==d.id)throw new Error('详情文件不匹配');return {...d,...full};
  })().catch(e=>{detailCache.delete(d.id);throw e}));return detailCache.get(d.id);
}
function imageHTML(d,cls='',full=false){
  if(!d.preview)return '<div class="noimage">'+skeleton(d.layouts[0])+'<b>布局示意 · 原图未发布</b><br><span class="subnote">此条保留构图分析与来源入口</span></div>';
  const w=d.preview_width||960,h=d.preview_height||600,small=d.thumbnail||d.preview,large=d.thumbnail_2x;
  const srcset=large&&large!==small?' data-srcset="'+esc(small+' '+(d.thumbnail_width||480)+'w, '+large+' '+(d.thumbnail_2x_width||960)+'w')+'"':'';
  return '<span class="image-frame"><img class="'+cls+'" src="'+(full?esc(d.preview):BLANK_IMAGE)+'" '+(full?'fetchpriority="high"':'data-src="'+esc(small)+'"'+srcset+' sizes="(max-width:760px) calc(100vw - 64px), (max-width:1200px) calc((100vw - 320px) / 2), 360px"')+' width="'+w+'" height="'+h+'" style="aspect-ratio:'+w+'/'+h+'" alt="'+esc(d.id+' '+d.title)+'" decoding="async" '+(full?'data-full-image':'data-thumbnail')+'><span class="image-hint">'+(full?'大图加载中':'缩略图加载中')+'</span></span>';
}
function scheduleMasonry(){if(!masonryFrame)masonryFrame=requestAnimationFrame(()=>{masonryFrame=0;const grid=$('#grid'),s=getComputedStyle(grid),row=parseFloat(s.gridAutoRows)||8,gap=parseFloat(s.rowGap)||16;grid.querySelectorAll('.card').forEach(c=>{const n=Math.ceil((c.getBoundingClientRect().height+gap)/(row+gap));if(c.style.gridRowEnd!=='span '+n)c.style.gridRowEnd='span '+n})})}
const cardResizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(scheduleMasonry):null;
function finishImage(img,ok){const frame=img.closest('.image-frame');if(frame){frame.classList.toggle('image-error',!ok);frame.classList.remove('image-loading');const hint=frame.querySelector('.image-hint');if(hint){hint.textContent=ok?'':img.hasAttribute('data-full-image')?'大图暂时未加载，可使用下方原图链接':'图片暂时未加载，点开查看详情';hint.hidden=ok}}scheduleMasonry()}
function pumpImages(){
  while(imageLoads.size<MAX_IMAGE_REQUESTS&&imageQueue.length){const img=imageQueue.shift();if(!img.isConnected||!img.dataset.src)continue;let done=false;const finish=(ok,abort=false)=>{if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;if(abort){img.removeAttribute('srcset');img.removeAttribute('sizes');img.src=BLANK_IMAGE}imageLoads.delete(img);finishImage(img,ok);pumpImages()};const timer=setTimeout(()=>finish(false,true),45000);imageLoads.set(img,()=>finish(false,true));img.onload=()=>finish(true);img.onerror=()=>finish(false);img.closest('.image-frame')?.classList.add('image-loading');if(img.dataset.srcset)img.srcset=img.dataset.srcset;img.src=img.dataset.src;img.removeAttribute('data-src');img.removeAttribute('data-srcset');if(img.complete&&img.naturalWidth>1)finish(true)}
}
const imageObserver=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting&&e.target.dataset.src){imageObserver.unobserve(e.target);if(!e.target.dataset.imageQueued){e.target.dataset.imageQueued='1';imageQueue.push(e.target)}}});pumpImages()},{rootMargin:'180px 0px'}):null;
function activateImages(root=document){
  for(const [img,cancel] of imageLoads)if(!img.isConnected)cancel()
  root.querySelectorAll('img[data-src]').forEach(img=>{if(img.dataset.imageQueued)return;if(imageObserver)imageObserver.observe(img);else{img.dataset.imageQueued='1';imageQueue.push(img)}});
  root.querySelectorAll('img[data-full-image]').forEach(img=>{const done=()=>finishImage(img,img.naturalWidth>1);img.onload=img.onerror=done;if(img.complete)done()});pumpImages();scheduleMasonry();
}
function tagsHTML(d){return '<div class="tags">'+d.task_labels.map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+d.layout_labels.map(t=>'<span class="tag layout">'+esc(t)+'</span>').join('')+'</div>'}
function skeleton(id){
  const r=(x,y,w=22,h=12)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="2"/>',p=d=>'<path d="'+d+'"/>',c=(x,y,z=7)=>'<circle cx="'+x+'" cy="'+y+'" r="'+z+'"/>';
  const s={
    chain:r(8,24)+r(49,24)+r(90,24)+p('M30 30H49M71 30H90'),
    lanes:r(3,5,114,22)+r(3,34,114,22)+r(15,10,20,12)+r(75,10,25,12)+r(15,39,30,12)+r(77,39,25,12)+p('M35 16H75M45 45H77'),
    fork:r(5,24)+r(90,3)+r(90,24)+r(90,45)+p('M27 30H52V9H90M52 30H90M52 30V51H90'),
    tree:r(49,2)+r(13,27)+r(85,27)+p('M60 14V21H24V27M60 21H96V27M24 39V47H9V57M24 47H39V57M96 39V47H81V57M96 47H111V57'),
    nested:r(6,3,108,53)+r(18,15,84,34)+r(28,27,27,15)+r(65,27,27,15),
    layers:r(10,2,100,13)+r(10,23,100,13)+r(10,44,100,13),
    matrix:r(5,4,110,51)+p('M5 21H115M5 38H115M32 4V55M60 4V55M88 4V55'),
    radial:c(60,30,10)+c(18,10)+c(102,10)+c(18,50)+c(102,50)+p('M51 26L25 13M69 26L95 13M51 34L25 47M69 34L95 47'),
    network:c(15,15)+c(58,5)+c(104,20)+c(72,50)+c(20,49)+p('M22 13L51 7M65 7L98 17M99 26L78 46M65 49L27 49M20 42L15 22M25 44L97 23M58 12L69 43'),
    ring:'<ellipse cx="60" cy="30" rx="43" ry="24"/>'+c(60,6,6)+c(103,30,6)+c(60,54,6)+c(17,30,6),
    paired:r(5,6,45,48)+r(70,6,45,48)+p('M14 18H40M14 29H40M14 40H40M80 18H106M80 29H106M80 40H106M56 30H64'),
    timeline:p('M5 40H115M20 34V46M60 34V46M100 34V46')+r(8,9,25,13)+r(47,17,25,13)+r(86,4,25,13)+p('M20 22V34M60 30V34M99 17V34'),
    chart:p('M8 5V54H114')+r(19,32,17,22)+r(49,18,17,36)+r(79,6,17,48),
    overlap:c(44,30,25)+c(76,30,25),
    house:p('M7 17L60 1L113 17Z')+r(11,21,18,26)+r(51,21,18,26)+r(91,21,18,26)+r(6,51,108,7),
    pyramid:p('M60 2L10 57H110ZM46 18H74M30 36H90'),
    canvas:r(5,3,110,54)+p('M5 19H115M40 19V57M78 19V57M40 38H115'),
    multiples:r(4,5,33,48)+r(44,5,33,48)+r(84,5,33,48)+p('M12 14H29V26H17V44M52 14H69V26H57V44M92 14H109V26H97V44'),
    metaphor:p('M7 51V34Q60 -5 113 34V51M7 39H113M25 25V51M47 17V51M73 17V51M95 25V51')
  };
  Object.assign(s,{
    lifelines:r(7,2,23,10)+r(49,2,23,10)+r(91,2,23,10)+p('M18 12V59M60 12V59M102 12V59M18 25H60L56 22M60 42H102L98 39M102 53H18'),
    timing:p('M6 17H27V6H58V17H112M6 41H46V29H79V41H112M6 55H112M27 50V59M58 50V59M79 50V59'),
    stockflow:r(46,21,34,24)+c(21,33,7)+c(103,33,7)+p('M3 33H46M80 33H117M21 26V19M103 26V19M63 21V5H21V19'),
    flowband:p('M6 3C46 3 36 20 65 20V35C36 35 46 19 6 19ZM6 37C40 37 42 35 65 35V52C42 52 40 56 6 56ZM65 20C88 20 86 6 114 6V25C88 25 88 35 65 35ZM65 35C88 35 88 45 114 45V57C88 57 88 52 65 52Z'),
    parallel_axes:p('M15 4V58M45 4V58M75 4V58M105 4V58M15 18L45 41L75 12L105 30M15 48L45 23L75 38L105 10M15 33L45 8L75 53L105 43'),
    density_layers:p('M4 53Q20 53 31 35Q44 14 58 37Q72 53 115 53M4 38Q35 38 44 19Q60 2 73 23Q84 38 115 38M4 23Q11 23 17 11Q28 -1 43 15Q52 23 115 23'),
    spatial_map:p('M15 7L43 3L56 14L79 8L107 16L115 36L89 54L66 45L40 57L18 44L5 26ZM43 3L40 57M79 8L66 45M15 25L110 27M20 41L99 45'),
    set_matrix:r(16,10,14,20)+r(50,3,14,27)+r(84,18,14,12)+p('M4 34H114M23 42V54M57 42V54M91 42V54')+c(23,42,3)+c(23,54,3)+c(57,42,3)+c(91,54,3),
    target_band:r(7,16,105,25)+r(7,16,32,25)+r(39,16,40,25)+r(7,24,60,9)+p('M89 12V46M7 51H112'),
    area_partition:r(5,3,110,54)+p('M53 3V57M5 29H53M82 3V57M53 21H115M82 42H115')
  });
  return '<svg class="skeleton" viewBox="0 0 120 62" aria-hidden="true"><g fill="#e8f0e8" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">'+(s[id]||s.canvas)+'</g></svg>';
}
function syncControls(){['task','layout','context','role','access','batch','sort','visibility'].forEach(k=>$('#'+k).value=filters[k]);$('#search').value=filters.q}
function reset(){filters={...DEFAULT_FILTERS};view='purpose';syncControls();render()}
function applyFilters(changes,go='browse'){filters={...filters,...changes};view=go==='compound'&&filters.role!=='composite'?'browse':go;syncControls();render()}
function currentCandidates(extra={}){return selectItems(DATA,{...filters,...extra},[...favorites],LIB.latest_batch)}
function renderExplorer(){
  const box=$('#explorer');box.hidden=view==='browse';$('#catalog').hidden=view==='tours';
  if(view==='purpose'){
    box.innerHTML='<h2 class="section-title">你最想让读者理解什么？</h2><p class="section-intro">先选关系，再试不同画法。下面的计数遵循当前领域、材料和文件条件；一张复合图可能同时属于几类。</p><div class="chooser">'+TAX.tasks.map(t=>{
      const xs=currentCandidates({task:t.id,layout:'all',mode:'all',q:''}),n=new Set(xs.flatMap(x=>x.layouts)).size;
      return '<button class="choice '+(filters.task===t.id?'active':'')+'" data-task="'+t.id+'"><strong>'+esc(t.label)+'</strong><span class="question">'+esc(t.question)+'</span><small>'+xs.length+' 项 · '+n+' 种可见骨架</small></button>'
    }).join('')+'</div><div class="aside-note">没有想好具体画法时，先看下方“轮换骨架”的图例；已知道想表达的关系，就进一步打开“按空间骨架”，探索同一目的的不同排法。</div>';
    box.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>applyFilters({task:b.dataset.task,layout:'all',q:'',mode:'all'}));
  }else if(view==='layout'){
    box.innerHTML='<h2 class="section-title">同一关系，可以放进不同空间。</h2><p class="section-intro">'+(filters.task!=='all'?'当前表达目的：'+esc(names.tasks[filters.task])+'。':'从画法出发浏览，或在左侧加一个表达目的。')+' 骨架示意仅帮助识别排布，不是新增素材，也不预设业务含义。</p><div class="chooser">'+TAX.layouts.map(l=>{
      const n=currentCandidates({layout:l.id}).length;
      return '<button class="choice '+(filters.layout===l.id?'active':'')+'" data-layout="'+l.id+'" title="'+esc(l.description)+'">'+skeleton(l.id)+'<strong>'+esc(l.label)+'</strong><small>'+n+' 项符合当前条件</small></button>'
    }).join('')+'</div><div class="aside-note">环形可以表达分类、层级或循环；金字塔可以表达层次、转化或数量。先读每张图的关系标签，再决定能否迁移。</div>';
    box.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>applyFilters({layout:b.dataset.layout}));
  }else if(view==='tours'){
    const tour=TOURS.find(x=>x.id===tourId)||TOURS[0];
    box.innerHTML='<h2 class="section-title">同题换画法：先比较各自强调什么。</h2><p class="section-intro">每组三张，用一个表达问题串起不同构图。素材来自不同场景，借鉴空间安排，业务含义仍需重新核实。</p><div class="tour-tabs">'+TOURS.map((t,i)=>'<button class="pill '+(t.id===tour.id?'active':'')+'" data-tour="'+t.id+'">'+(i+1)+'. '+esc(t.title.split('，')[0].split('：')[0])+'</button>').join('')+'</div><div class="tour-head"><h3>'+esc(tour.title)+'</h3><p>'+esc(tour.question)+'</p><p><b>观察重点：</b>'+esc(tour.lesson)+'</p></div><div class="tour-grid">'+tour.cards.map(c=>{
      const d=byId[c.id];return '<article class="tour-card"><button class="thumb" data-tour-open="'+d.id+'" aria-label="查看 '+esc(d.title)+'">'+imageHTML(d)+'</button><div class="body"><div class="cardmeta">'+d.id+' · '+esc(d.role_label)+'</div><h4>'+esc(c.angle)+'</h4><p>'+esc(c.reason)+'</p>'+tagsHTML(d)+'<button class="secondary" data-tour-open="'+d.id+'">看原图与拆解</button></div></article>'
    }).join('')+'</div><div class="tour-bottom"><button class="primary" id="compareTour">并排对照这三张</button><span class="subnote">点击图片打开大图，左右方向键逐张看。</span></div><div class="aside-note">'+esc(tour.boundary)+'</div>';
    box.querySelectorAll('[data-tour]').forEach(b=>b.onclick=()=>{tourId=b.dataset.tour;renderExplorer();activateImages(box)});
    box.querySelectorAll('[data-tour-open]').forEach(b=>b.onclick=()=>openDetail(byId[b.dataset.tourOpen],tour.cards.map(c=>byId[c.id])));
    $('#compareTour').onclick=()=>openCompare(tour.cards.map(c=>byId[c.id]),tour);
  }else if(view==='compound'){
    box.innerHTML='<h2 class="section-title">复杂图，先找主骨架，再看局部结构。</h2><p class="section-intro">复合关系指同时组织两种以上独立关系。文字多、配色多或形状多，本身不等于复合。</p><div class="tour-head"><p><b>第一遍：</b>遮住细节，判断整张图主要沿什么方向阅读。</p><p><b>第二遍：</b>看局部为什么需要另一种骨架，例如主流程里的分解树、泳道中的映射线。</p><p><b>第三遍：</b>找不同结构之间的连接，判断哪些位置或箭头确实有业务含义。</p><button class="secondary" id="compoundTour">看三种复合方式的对照</button></div>';
    $('#compoundTour').onclick=()=>{view='tours';tourId=TOURS.some(t=>t.id==='composite')?'composite':'quantity';render()};
  }
}
function cardHTML(d){
  const editable=d.editable_formats.length?(LIB.public_site?'可下载 ':'本地 ')+d.editable_formats.join(' / '):d.preview?'静态参考':'仅来源索引';
  return '<article class="card" data-item="'+d.id+'"><button class="thumb" data-open="'+d.id+'" aria-label="查看 '+esc(d.title)+'">'+imageHTML(d)+'<span class="kind">'+esc(d.role_label)+(d.confidence==='limited_preview'?' · 仅已见样例':'')+'</span></button><div class="cardbody"><div class="cardmeta">'+d.id+' · '+esc(d.context_labels.join(' / '))+(d.batch===LIB.latest_batch?' · 新增':'')+'</div><h2><button class="titlebutton" data-open="'+d.id+'">'+esc(d.title)+'</button></h2><p class="recipe">'+esc(d.recipe)+'</p>'+tagsHTML(d)+(d.assets.length?'<div class="local-open">'+link(d.assets[0].href,d.assets[0].label)+'</div>':LIB.public_site?'<div class="local-open"><button class="titlebutton" data-open="'+d.id+'">查看来源与分析</button></div>':'')+'</div><div class="cardfoot"><span class="access">'+esc(editable)+'</span><div class="actions"><button class="iconbtn '+(favorites.has(d.id)?'on':'')+'" data-fav="'+d.id+'" aria-label="'+(favorites.has(d.id)?'取消收藏':'收藏')+' '+esc(d.title)+'">'+(favorites.has(d.id)?'★':'☆')+'</button><label class="comparecheck"><input type="checkbox" aria-label="将 '+esc(d.title)+' 加入对照" data-compare="'+d.id+'" '+(selected.has(d.id)?'checked':'')+'>对照</label></div></div></article>';
}
function updateLoadStatus(){
  const more=renderedCount<visibleItems.length;$('#loadMore').hidden=!more;$('#loadStatus').textContent=visibleItems.length?'已呈现 '+renderedCount+' / '+visibleItems.length+' 项'+(more?' · 继续向下滚动，或点击加载更多':' · 当前结果已全部呈现'):'';
  $('#loadSentinel').hidden=!more||view==='tours';
}
function appendCards(manual=false){
  const before=renderedCount;renderedCount=Math.min(visibleItems.length,renderedCount+PAGE_SIZE);const grid=$('#grid');grid.insertAdjacentHTML('beforeend',visibleItems.slice(before,renderedCount).map(cardHTML).join(''));grid.querySelectorAll('.card').forEach(c=>cardResizeObserver?.observe(c));activateImages(grid);updateLoadStatus();if(manual&&$('#loadMore').hidden)grid.querySelector('[data-item="'+visibleItems[before]?.id+'"] [data-open]')?.focus();
}
function render({preserveCount=false}={}){
  imageObserver?.disconnect();cardResizeObserver?.disconnect();
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',view===b.dataset.view);b.setAttribute('aria-current',view===b.dataset.view?'page':'false')});
  renderExplorer();visibleItems=currentCandidates();
  $('#resultCount').textContent='当前 '+visibleItems.length+' / '+DATA.length+' 项 · 按单条素材计';
  $('#resultGuide').textContent=filters.sort==='diverse'?'当前按主骨架交替展示：尽量先见到不同排法，再深入同类。':'同一张图可以被多个关系或骨架检索到。';
  const keep=preserveCount?renderedCount:PAGE_SIZE;renderedCount=0;$('#empty').hidden=visibleItems.length>0;$('#grid').innerHTML='';while(renderedCount<Math.min(keep,visibleItems.length))appendCards();activateImages();updateLoadStatus();
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',filters.mode===b.dataset.mode));
  const labels={task:names.tasks[filters.task],layout:names.layouts[filters.layout],context:names.contexts[filters.context],role:$('#role').selectedOptions[0].textContent,access:$('#access').selectedOptions[0].textContent,batch:filters.batch,q:filters.q,visibility:LIB.public_site&&filters.visibility!=='all'?'本站有原图':''};
  $('#activeFilters').innerHTML=Object.entries(labels).filter(([k,v])=>v&&filters[k]!=='all').map(([k,v])=>'<button class="filterchip" data-remove="'+k+'">'+esc(v)+' ×</button>').join('');
  $('#activeFilters').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>applyFilters({[b.dataset.remove]:b.dataset.remove==='q'?'':'all'},view));
  updateCompare();
}
$('#grid').addEventListener('click',e=>{const open=e.target.closest('[data-open]');if(open){openDetail(byId[open.dataset.open],visibleItems);return}const b=e.target.closest('[data-fav]');if(!b)return;const id=b.dataset.fav;favorites.has(id)?favorites.delete(id):favorites.add(id);try{localStorage.setItem('composition-favorites-v1',JSON.stringify([...favorites]))}catch(e){toast('当前预览器无法保存收藏，可导出清单保留')}if(filters.mode==='favorites'){const at=[...$('#grid').querySelectorAll('[data-fav]')].indexOf(b),y=window.scrollY;render({preserveCount:true});const buttons=[...$('#grid').querySelectorAll('[data-fav]')];(buttons[Math.min(at,buttons.length-1)]||document.querySelector('[data-mode="favorites"]')).focus({preventScroll:true});window.scrollTo(0,y)}else{b.classList.toggle('on',favorites.has(id));b.textContent=favorites.has(id)?'★':'☆';b.setAttribute('aria-label',(favorites.has(id)?'取消收藏':'收藏')+' '+byId[id].title)}});
$('#grid').addEventListener('change',e=>{const c=e.target.closest('[data-compare]');if(!c)return;if(c.checked&&selected.size>=3){c.checked=false;toast('每次最多比较三张');return}c.checked?selected.add(c.dataset.compare):selected.delete(c.dataset.compare);updateCompare()});
$('#loadMore').onclick=()=>appendCards(true);
const moreObserver=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&view!=='tours'&&renderedCount<visibleItems.length)appendCards()},{rootMargin:'400px 0px'}):null;
moreObserver?.observe($('#loadSentinel'));
window.addEventListener('resize',scheduleMasonry);
function updateCompare(){$('#comparebar').hidden=selected.size===0;$('#comparecount').textContent='已选 '+selected.size+' / 3';$('#compareBtn').disabled=selected.size<2}
function discardImages(images){for(const img of images){imageObserver?.unobserve(img);imageLoads.get(img)?.();img.onload=img.onerror=null;img.removeAttribute('srcset');img.removeAttribute('sizes');img.src=BLANK_IMAGE}}
function openModal(content){
  if(!$('#modal').classList.contains('open'))lastFocus=document.activeElement;
  currentDetailId=null;const previous=[...$('#dialogContent').querySelectorAll('img')];$('#dialogContent').innerHTML=content;discardImages(previous);$('#modal').classList.add('open');document.body.style.overflow='hidden';$('#closeModal').focus();$('#modal').scrollTop=0;
}
function closeModal(){detailGeneration++;const previous=[...$('#dialogContent').querySelectorAll('img')];$('#dialogContent').replaceChildren();discardImages(previous);$('#modal').classList.remove('open');document.body.style.overflow='';currentDetailId=null;if(lastFocus&&lastFocus.isConnected)lastFocus.focus()}
async function openDetail(d,sequence=visibleItems){
  const token=++detailGeneration;detailItems=sequence.some(x=>x.id===d.id)?sequence:[d];const at=detailItems.findIndex(x=>x.id===d.id);
  openModal('<div class="detail-nav"><button class="secondary" id="prevDetail" '+(at===0?'disabled':'')+'>← 上一张</button><span>'+(at+1)+' / '+detailItems.length+'</span><button class="secondary" id="nextDetail" '+(at===detailItems.length-1?'disabled':'')+'>下一张 →</button></div><h2 id="dialogtitle">'+esc(d.title)+'</h2><div class="detail-loading">正在载入这张图的分析与大图…</div>');currentDetailId=d.id;
  $('#prevDetail').onclick=()=>stepDetail(-1);$('#nextDetail').onclick=()=>stepDetail(1);
  try{const full=await loadDetail(d);if(token!==detailGeneration||!$('#modal').classList.contains('open'))return;renderDetail(full,sequence)}catch(e){if(token!==detailGeneration||!$('#modal').classList.contains('open'))return;$('#dialogContent').querySelector('.detail-loading')?.remove();$('#dialogContent').insertAdjacentHTML('beforeend','<div class="aside-note">'+esc(e.message)+' <button class="secondary" id="retryDetail">重试</button> '+link('静态总览.html#item-'+d.id,'查看静态详情')+'</div>');$('#retryDetail').onclick=()=>openDetail(d,sequence);toast('详情未加载，可重试或打开静态总览')}
}
function renderDetail(d,sequence=visibleItems){
  detailItems=sequence.some(x=>x.id===d.id)?sequence:[d];const at=detailItems.findIndex(x=>x.id===d.id),alts=alternativesFor(d,LIB.public_site?DATA.filter(x=>x.publication?.status==='allowed'):DATA);
  const more=d.more_previews.map(p=>link(p.href,p.label)).join('');
  let html='<div class="detail-nav"><button class="secondary" id="prevDetail" '+(at===0?'disabled':'')+'>← 上一张</button><span>'+(at+1)+' / '+detailItems.length+' · 左右方向键</span><button class="secondary" id="nextDetail" '+(at===detailItems.length-1?'disabled':'')+'>下一张 →</button></div><div class="cardmeta">'+d.id+' · '+esc(d.role_label)+' · '+esc(d.context_labels.join(' / '))+'</div><h2 id="dialogtitle">'+esc(d.title)+'</h2><div class="detail-top"><div>'+imageHTML(d,'large-img',true)+'<div class="detaillinks">'+(d.preview?link(d.preview,'打开原比例预览'):link(d.source_href,'到原始来源查看图像'))+more+'</div>'+tagsHTML(d)+'<div class="recipe-box"><b>主骨架怎样容纳局部结构</b>'+esc(d.recipe)+'</div><div class="detailsource">分类依据：'+esc(d.classification_note)+(d.confidence==='limited_preview'?'<br>只按已看到的套装样例归类，不推断未查看页面。':'')+'</div></div><div class="detailtext"><dl><dt>图中实际表达的关系</dt><dd>'+esc(d.relation)+'</dd><dt>可以借鉴的空间安排</dt><dd>'+esc(d.composition)+'</dd><dt>迁移时需要注意</dt><dd>'+esc(d.caveat)+'</dd><dt>适用场景</dt><dd>'+esc(Array.isArray(d.use_cases)?d.use_cases.join('；'):d.use_cases)+'</dd><dt>文件与访问</dt><dd>'+esc(d.format)+'<br>'+esc(d.access)+'</dd></dl><div class="detaillinks">'+d.assets.map(a=>link(a.href,a.label)).join('')+'</div>'+(d.archive_assets?.length?'<div class="detaillinks">'+d.archive_assets.map(a=>link(a.href,a.label)).join('')+'</div>':'')+'</div></div>';
  if(d.novelty)html+='<div class="recipe-box"><b>本轮为什么收录：与旧库的差别</b>'+esc(d.novelty.difference)+'</div>';
  if(LIB.public_site&&d.publication)html+='<div class="aside-note">公开状态：'+esc(d.publication.status==='allowed'?'已按许可附原图与文件':'仅保留来源入口')+'。'+esc(d.publication.reason||'')+'</div>';
  if(alts.length)html+='<h3>也表达“'+esc(names.tasks[d.tasks[0]])+'”，换一种主骨架</h3><p class="subnote">依据关系标签推荐，优先同领域与精选项；这些图的业务含义并不等价。</p><div class="related-grid">'+alts.map(x=>'<button class="related-card" data-related="'+x.id+'">'+imageHTML(x)+'<strong>'+esc(x.id+' · '+x.title)+'</strong><small>'+esc(x.layout_labels.join(' + '))+'</small></button>').join('')+'</div>';
  html+='<div class="detailsource">来源：'+esc(d.source)+' · 核验日期 '+esc(d.checked_date)+'<br>'+esc(d.verification)+(d.recommended_pages?'<br>'+esc(d.recommended_pages):'')+'<br>许可与署名：'+esc(d.license_note)+'<br>证据记录：'+esc(d.evidence)+'<div class="detaillinks">'+link(d.source_href,d.page?'原 PDF · 第 '+d.page+' 页':'官方来源')+'</div></div>';
  openModal(html);currentDetailId=d.id;
  $('#prevDetail').onclick=()=>stepDetail(-1);$('#nextDetail').onclick=()=>stepDetail(1);activateImages($('#modal'));
  $('#dialogContent').querySelectorAll('[data-related]').forEach(b=>b.onclick=()=>openDetail(byId[b.dataset.related],alts));
}
function stepDetail(delta){const i=detailItems.findIndex(x=>x.id===currentDetailId);if(detailItems[i+delta])openDetail(detailItems[i+delta],detailItems)}
async function openCompare(items,tour=null){
  const token=++detailGeneration;currentDetailId=null;openModal('<h2 id="dialogtitle">并排对照</h2><div class="detail-loading">正在载入选中图例的分析…</div>');
  try{const full=await Promise.all(items.map(loadDetail));if(token!==detailGeneration||!$('#modal').classList.contains('open'))return;renderCompare(full,tour)}catch(e){if(token!==detailGeneration)return;$('#dialogContent').querySelector('.detail-loading')?.remove();$('#dialogContent').insertAdjacentHTML('beforeend','<div class="aside-note">'+esc(e.message)+' <button class="secondary" id="retryCompare">重试</button></div>');$('#retryCompare').onclick=()=>openCompare(items,tour)}
}
function renderCompare(items,tour=null){
  openModal('<h2 id="dialogtitle">'+esc(tour?tour.title:'并排比较：关系、骨架与取舍')+'</h2><p class="subnote">'+esc(tour?tour.lesson:'先比较主阅读线和关系，再看颜色与形状。')+'</p><div class="compare-grid">'+items.map(d=>{
    const prompt=tour&&tour.cards.find(c=>c.id===d.id);
    return '<div class="compare-item"><div class="cardmeta">'+d.id+' · '+esc(d.role_label)+'</div><h3>'+esc(prompt?prompt.angle:d.title)+'</h3>'+imageHTML(d)+tagsHTML(d)+'<dl><dt>这张图强调什么</dt><dd>'+esc(prompt?prompt.reason:d.relation)+'</dd><dt>骨架组合</dt><dd>'+esc(d.recipe)+'</dd><dt>分类依据</dt><dd>'+esc(d.classification_note)+'</dd><dt>迁移时的边界</dt><dd>'+esc(d.caveat)+'</dd></dl><div class="detaillinks">'+(d.preview?link(d.preview,'放大原图'):link(d.source_href,'查看原始来源'))+d.assets.map(a=>link(a.href,a.label)).join('')+'</div></div>'
  }).join('')+'</div>'+(tour?'<div class="aside-note">'+esc(tour.boundary)+'</div>':''));activateImages($('#modal'));
}
function applyHash(){
  const q=new URLSearchParams(location.hash.slice(1));if($('#modal').classList.contains('open'))closeModal();
  if(q.has('tour')&&TOURS.some(t=>t.id===q.get('tour'))){view='tours';tourId=q.get('tour')}
  if(q.has('task')&&names.tasks[q.get('task')]){filters.task=q.get('task');filters.role='all';view='browse'}
  if(q.has('layout')&&names.layouts[q.get('layout')]){filters.layout=q.get('layout');filters.role='all';view='browse'}
  if(q.has('item')&&byId[q.get('item')]){filters={...DEFAULT_FILTERS,role:'all',q:q.get('item')};view='browse'}
  syncControls();render();if(q.has('item')&&byId[q.get('item')])openDetail(byId[q.get('item')],visibleItems);
}
['task','layout','context'].forEach(k=>{const key={task:'tasks',layout:'layouts',context:'contexts'}[k];$('#'+k).innerHTML='<option value="all">全部'+({task:'表达关系',layout:'空间骨架',context:'领域'}[k])+'</option>'+TAX[key].map(x=>'<option value="'+x.id+'">'+esc(x.label)+'</option>').join('')});
$('#batch').innerHTML='<option value="all">全部批次</option>'+LIB.batches.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
  view=b.dataset.view;if(view==='compound'){filters={...DEFAULT_FILTERS,role:'composite'}}else if(view==='browse'){filters={...DEFAULT_FILTERS,role:'all'}}
  syncControls();render();
});
['task','layout','context','role','access','batch','sort','visibility'].forEach(k=>$('#'+k).addEventListener('change',()=>{filters[k]=$('#'+k).value;if(view==='tours')view='browse';if(view==='compound'&&k==='role'&&filters.role!=='composite')view='browse';render()}));
$('#search').addEventListener('input',()=>{filters.q=$('#search').value;if(view==='tours')view='browse';render()});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{filters.mode=b.dataset.mode;render()});
$('#showPacks').onclick=()=>{filters={...DEFAULT_FILTERS,role:'pack'};view='browse';syncControls();render()};
$('#reset').onclick=reset;$('#emptyReset').onclick=reset;$('#closeModal').onclick=closeModal;
$('#modal').onclick=e=>{if(e.target===$('#modal'))closeModal()};
$('#compareBtn').onclick=()=>openCompare([...selected].map(id=>byId[id]));$('#clearCompare').onclick=()=>{selected.clear();$('#grid').querySelectorAll('[data-compare]').forEach(c=>c.checked=false);updateCompare()};
document.addEventListener('keydown',e=>{
  if(!$('#modal').classList.contains('open'))return;
  if(e.key==='Escape'){closeModal();return}
  if(currentDetailId&&['ArrowLeft','ArrowRight'].includes(e.key)&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();stepDetail(e.key==='ArrowLeft'?-1:1)}
  if(e.key==='Tab'){const f=[...$('#modal').querySelectorAll('button,a,input,select')].filter(x=>!x.disabled);if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus()}}
});
$('#exportFav').onclick=async()=>{const chosen=DATA.filter(x=>favorites.has(x.id));if(!chosen.length){toast('先收藏几项，再导出清单');return}try{const a=await Promise.all(chosen.map(loadDetail));const blob=new Blob([JSON.stringify(a.map(({id,title,url,task_labels,layout_labels,recipe,caveat,local_asset})=>({id,title,url,task_labels,layout_labels,recipe,caveat,local_asset})),null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),el=document.createElement('a');el.href=u;el.download='我的构图收藏.json';el.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(e){toast('导出未完成：'+e.message)}};
$('#stats').innerHTML=[[DATA.length,'项已重审素材'],[TAX.tasks.length,'类表达关系'],[TAX.layouts.length,'种空间骨架']].map(([n,t])=>'<div class="stat"><b>'+n+'</b><span>'+t+'</span></div>').join('');
$('#reviewSummary').textContent='本次覆盖 '+TAX.reviewed_count+' 项；其中 '+TAX.limited_count+' 项按有限样例归类。另纠正 '+TAX.corrections.length+' 处已确认的原说明问题，具体记录可追溯。';
$('#footnote').innerHTML='共 '+LIB.ppt_count+' 份 PowerPoint、'+LIB.visio_count+' 份 Visio；原文件的范围与许可见每项详情。公开预览不等于可编辑模板。<br>'+link('分类地图.html','完整分类地图')+link('静态总览.html','静态总览')+link('分类下载索引.html','本地文件索引')+link('使用说明.txt','使用说明')+link('素材目录.json','结构化目录');
if(LIB.public_site)$('#publicationFilter').hidden=false;
window.addEventListener('hashchange',applyHash);applyHash();$('#loadingNotice').hidden=true;

const studied=DATA.filter(x=>x.role!=='pack');const under=TAX.tasks.map(t=>({label:t.label,n:studied.filter(x=>x.tasks[0]===t.id).length})).sort((a,b)=>a.n-b.n).slice(0,3);
$('#reviewSummary').insertAdjacentHTML('beforeend','<p><b>覆盖仍有偏向：</b>体系支撑、层级和映射较多；按主关系统计，'+under.map(x=>esc(x.label)+' '+x.n+' 项').join('、')+'相对较少（不含套装）。有类别入口不等于该类已充分覆盖。本轮已补入时序片段、带极性的反馈、存量流量和多维数量编码；仍值得增加更多中文真实业务的完整案例。</p>');

if(LIB.public_site){
  $('#footnote').innerHTML='<p><b>公开学习版：</b>本站随站保存 '+LIB.published_item_count+' 项素材的原图及许可允许的文件；其余条目只列来源与构图分析。'+link('素材署名与许可.html','逐项署名和分发范围')+'</p><p>完整个人素材含 '+LIB.archive_ppt_count+' 份 PowerPoint、'+LIB.archive_visio_count+' 份 Visio，以及引用的图片与 PDF，均存放在 '+link(LIB.archive_repository,'私有素材仓库（登录 GitHub）')+'。克隆该仓库后打开 index.html 可离线浏览全部素材。</p>'+link('分类地图.html','完整分类地图')+link('静态总览.html','静态总览')+link('分类下载索引.html','随站文件索引')+link('使用说明.txt','使用说明')+link('素材目录.json','结构化目录');
  document.querySelector('.intro').innerHTML='从表达关系与空间骨架学习构图。本站展示 '+LIB.published_item_count+' 组授权原图；完整 PPT、PDF 和图片可从 '+link(LIB.archive_repository,'私有素材仓库（登录 GitHub）')+' 获取。切换“全部来源”可检索全部 '+DATA.length+' 项。';
  document.querySelector('label[for="access"]').textContent='随站文件';
  document.querySelector('#access option[value="saved"]').textContent='本站有原文件';
}
