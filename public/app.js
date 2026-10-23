'use strict';
const $ = (s, root=document) => root.querySelector(s);
const main = $('#main');
const dialog = $('#modal');
const state = {user:null, csrf:null, category:'全部', q:'', sort:'featured', routeVersion:0, modalVersion:0, collectionTab:'collected'};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = p => '¥ ' + (p/100).toFixed(2);
const date = t => new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(t));
const short = h => h.slice(0,10)+'…'+h.slice(-8);
const empty = (title, text) => `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`;
let toastTimer;
function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500); }
async function api(path, data) {
  const r=await fetch(path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-CSRF-Token':state.csrf||''}:{},body:data?JSON.stringify(data):undefined});
  const result=await r.json();
  if(!r.ok) { const e=new Error(result.error||'请求未完成');e.status=r.status;throw e; }
  return result;
}
async function syncSession() {
  const s=await api('/api/session');state.user=s.user;state.csrf=s.csrf;
  $('#identity').textContent=s.user?s.user.name:'开启体验';
  $('#identity').title=s.user?'管理本地身份':'使用体验身份或注册登录';
}
async function ensureUser() {
  if(state.user) return;
  await api('/api/auth/guest',{});await syncSession();
}
function openModal(html) {
  state.modalVersion++;$('#modal-content').innerHTML=html;
  if(!dialog.open) dialog.showModal();
  return state.modalVersion;
}
function closeModal() {state.modalVersion++;dialog.close();}
$('.modal-close').addEventListener('click',closeModal);
dialog.addEventListener('click',e=>{if(e.target===dialog && (e.offsetX<0||e.offsetX>dialog.clientWidth||e.offsetY<0||e.offsetY>dialog.clientHeight)) closeModal();});
dialog.addEventListener('cancel',()=>state.modalVersion++);

function card(w) {
  return `<article class="work-card"><button class="card-image" data-detail="${esc(w.id)}" aria-label="查看${esc(w.title)}详情"><img src="${esc(w.image)}" alt="${esc(w.title)}" loading="lazy"><span class="badge">${esc(w.category)}</span><span class="serial">EDITION / ${String(w.supply).padStart(3,'0')}</span><span class="card-open">↗</span></button><div class="card-body"><h3><button data-detail="${esc(w.id)}">${esc(w.title)}</button></h3><div class="creator-label"><span class="mini-avatar">${esc(w.creator.slice(0,1))}</span>${esc(w.creator)}${w.serial?` · 收藏编号 #${String(w.serial).padStart(3,'0')}`:''}</div><div class="card-bottom"><span class="price"><small>收藏展示价</small><strong>${money(w.price)}</strong></span><button data-detail="${esc(w.id)}">查看作品 ↗</button></div><div class="card-provenance"><span><span class="status-dot"></span>本地存证</span><span>${esc(w.id)}</span></div></div></article>`;
}
function heading(en,title,description) {return `<div class="page-header"><span class="section-label">${en}</span><h1>${title}</h1><p>${description}</p></div>`;}
function filters() {
  return `<div class="filters"><div class="tabs" aria-label="作品分类">${['全部','数字绘画','国风艺术','生成艺术','摄影艺术'].map(c=>`<button class="tab ${state.category===c?'active':''}" data-category="${c}" aria-pressed="${state.category===c}">${c}</button>`).join('')}</div><select class="sort" id="sort" aria-label="作品排序"><option value="featured" ${state.sort==='featured'?'selected':''}>精选推荐</option><option value="newest" ${state.sort==='newest'?'selected':''}>最新发布</option><option value="popular" ${state.sort==='popular'?'selected':''}>收藏最多</option><option value="price" ${state.sort==='price'?'selected':''}>价格从低到高</option></select></div>`;
}
async function home(v) {
  const [stats,works,artists]=await Promise.all([api('/api/stats'),api('/api/works'),api('/api/creators')]);
  if(v!==state.routeVersion)return;
  const featured=works.works[0],second=works.works[1]||featured;
  main.innerHTML=`<div class="container home-container"><section class="original-hero"><div class="hero-copy"><span class="eyebrow"><span class="tiny-square"></span> ART, CONNECTED. / 数字艺术新视界</span><h1>把热爱，<br>藏进<span class="hero-serif">数字世界。</span><sup>®</sup></h1><p class="hero-subtitle">在创作中相遇，在收藏中共鸣。<br>发现独特的数字艺术，让每一份灵感有迹可循。</p><div class="hero-buttons"><a href="#explore" class="button dark">发现心动作品 <span>↗</span></a><a href="#create" class="hero-secondary">成为创作者 <span>＋</span></a></div><form id="hero-search" class="searchbar"><span class="search-icon" aria-hidden="true">⌕</span><input name="q" aria-label="寻找你想要的作品" placeholder="搜索作品、创作者或作品编号"><button aria-label="搜索">↗</button></form><div class="trends">灵感索引 <button data-trend="数字绘画">数字绘画</button><button data-trend="国风艺术">国风艺术</button><button data-trend="生成艺术">生成艺术</button></div></div><div class="hero-stage"><span class="stage-coordinate">CURATED BY YILIAN / VOL. 001</span><div class="stage-orbit"></div><div class="stage-orbit second"></div><button class="stage-back" data-detail="${esc(second.id)}" aria-label="查看${esc(second.title)}"><img src="${esc(second.image)}" alt="${esc(second.title)}"><span>${esc(second.title)} / ${esc(second.id)}</span></button><button class="stage-front" data-detail="${esc(featured.id)}" aria-label="查看${esc(featured.title)}"><div class="art-frame"><img src="${esc(featured.image)}" alt="${esc(featured.title)}"></div><div class="frame-caption"><div><small>FEATURED ARTWORK</small><strong>${esc(featured.title)}</strong></div><span>↗</span></div></button><span class="stage-stamp">ART<br>WITH<br>IDENTITY<span>✳</span></span><div class="stage-note"><span class="status-dot"></span>每件作品，都有自己的故事与记录。</div><span class="stage-cross">＋</span></div></section><section class="home-stats stats-strip"><div class="stats-intro"><strong>让创作与热爱，彼此连接。</strong><span>当前数字艺术空间 · 本地样例与体验数据</span></div><div class="stat"><strong>${String(stats.works).padStart(2,'0')}<small>件</small></strong><span>艺术作品 / ARTWORKS</span></div><div class="stat"><strong>${String(stats.creators).padStart(2,'0')}<small>位</small></strong><span>独立创作者 / CREATORS</span></div><div class="stat"><strong>${String(stats.records).padStart(2,'0')}<small>条</small></strong><span>作品记录 / RECORDS</span></div></section><section class="home-works"><div class="section-heading"><div><span class="section-label">01 / THE COLLECTION</span><h2>与你共鸣的，下一件作品<span class="heading-dot">.</span></h2><p>不同的表达，同样值得被看见。内置作品为展示样例。</p></div><a href="#explore" class="round-link">探索全部 <span>↗</span></a></div><div class="home-category-bar"><span class="category-current">精选作品 <span>${works.works.length.toString().padStart(2,'0')}</span></span><button data-trend="数字绘画">数字绘画 ↗</button><button data-trend="国风艺术">国风艺术 ↗</button><button data-trend="生成艺术">生成艺术 ↗</button><a href="#gallery">进入展厅 <span>▧</span></a></div><div class="grid">${works.works.slice(0,6).map(card).join('')}</div></section><section class="home-creators"><div class="section-heading"><div><span class="section-label">02 / CREATIVE VOICES</span><h2>灵感背后，是一个个创作者<span class="heading-dot">.</span></h2><p>遇见不同的创作语言，发现值得关注的艺术表达。</p></div><a href="#creators" class="round-link">创作者排行 <span>↗</span></a></div><div class="home-creator-grid">${artists.creators.slice(0,3).map((c,i)=>`<button class="home-creator" data-creator="${esc(c.name)}"><span class="creator-order">0${i+1}</span><img src="/img/avatar${[2,3,4][i]}.jpg" alt="样例头像"><div><strong>${esc(c.name)}</strong><small>${c.works} 件作品 · ${c.collections} 次演示收藏</small></div><span class="creator-arrow">↗</span></button>`).join('')}</div></section><section class="home-create-banner"><div class="banner-symbol">✳</div><div><small>GIVE YOUR IDEAS A PLACE TO LIVE</small><h2>你的下一次灵感，<br>值得一个被看见的开始。</h2><p>从一张作品，到一段有迹可循的创作故事。</p></div><a href="#create" class="button dark">进入创作工作台 ↗</a></section><section class="journey"><div><span class="section-label">03 / HOW IT WORKS</span><h2>让艺术走近，<br>让记录清晰。</h2><a href="#about" class="link">关于艺链 ↗</a></div><div class="steps"><div class="step"><b>01</b><h3>发布一份灵感</h3><p>上传作品，写下创作故事，<br>建立专属的数字作品档案。</p></div><div class="step"><b>02</b><h3>收藏一份共鸣</h3><p>发现心动的作品，<br>在个人空间留存收藏记录。</p></div><div class="step"><b>03</b><h3>追溯每个瞬间</h3><p>从作品发布到收藏，<br>让每一步记录清楚可查。</p></div></div></section></div>`;
  $('#hero-search').onsubmit=e=>{e.preventDefault();state.q=new FormData(e.currentTarget).get('q').trim();state.category='全部';location.hash='#explore';};
}
async function explore(v, gallery=false) {
  const r=await api('/api/works?'+new URLSearchParams({q:state.q,category:state.category,sort:state.sort}));
  if(v!==state.routeVersion)return;
  main.innerHTML=`<div class="container">${heading(gallery?'DIGITAL GALLERY':'EXPLORE THE COLLECTION',gallery?'线上艺术展厅':'发现数字艺术',gallery?'走进作品之间，感受不同创作者的想象。':'让每一次浏览，都成为与新灵感的相遇。内置作品为展示样例。')}<div class="section-heading"><form id="search-form" class="searchbar"><span aria-hidden="true">⌕</span><input name="q" value="${esc(state.q)}" aria-label="搜索作品" placeholder="搜索作品、创作者、作品编号或哈希"><button>搜索</button></form><div class="section-actions"><span class="count-label">${r.works.length} 件作品</span><a class="link" href="${gallery?'#explore':'#gallery'}">${gallery?'列表模式':'展厅模式'} ↗</a></div></div>${filters()}<section class="${gallery?'gallery-grid':'grid'} section">${r.works.length?r.works.map(w=>gallery?`<button class="gallery-item" data-detail="${esc(w.id)}"><img src="${esc(w.image)}" alt="${esc(w.title)}"><p>${esc(w.title)}</p><small>${esc(w.creator)} / ${esc(w.category)}</small></button>`:card(w)).join(''):empty('暂时没有找到作品','试试其他关键词或分类，也可以发布你的第一件作品。')}</section></div>`;
  $('#search-form').addEventListener('submit',e=>{e.preventDefault();state.q=new FormData(e.currentTarget).get('q').trim();route(false);});
  $('#sort').addEventListener('change',e=>{state.sort=e.target.value;route(false);});
}
function timeline(events) {
  return `<ol class="timeline">${events.slice().reverse().map(e=>`<li><strong>${e.action==='PUBLISH'?'作品发布 · 本地存证':'演示收藏 · 编号 #'+String(e.payload.serial).padStart(3,'0')}</strong><small>${esc(e.actor_name)} · ${date(e.timestamp)}</small><code>${esc(e.hash)}</code></li>`).join('')}</ol>`;
}
async function detail(id) {
  const mv=openModal('<div class="loading">正在读取作品档案…</div>');
  try {
    const r=await api('/api/works/'+encodeURIComponent(id));if(mv!==state.modalVersion || !dialog.open)return;
    const w=r.work;
    $('#modal-content').innerHTML=`<div class="detail artwork-detail"><div class="detail-image"><div class="detail-art-top"><span>YILIAN / THE COLLECTION</span><span>${esc(w.id)}</span></div><img src="${esc(w.image)}" alt="${esc(w.title)}"><div class="detail-art-caption"><span>${esc(w.category)}</span><span>ARTWORK / ${String(w.supply).padStart(3,'0')} EDITIONS</span></div></div><div class="detail-content"><span class="section-label">A PIECE TO CONNECT WITH</span><h2>${esc(w.title)}</h2><div class="creator-label"><span class="mini-avatar">${esc(w.creator[0])}</span><span>创作者 <strong>${esc(w.creator)}</strong></span></div><p class="description">${esc(w.description)}</p><div class="edition-bar"><span class="badge">限量 ${w.supply} 份</span><span>余 ${w.remaining} 份可体验收藏</span></div><div class="detail-price"><small>收藏展示价 / CNY</small><strong>${money(w.price)}</strong></div><div class="detail-actions"><button class="button dark" data-collect="${esc(w.id)}" ${w.remaining===0?'disabled':''}>${w.remaining===0?'已全部收藏':'收藏这份灵感'} ↗</button><button class="button outline" data-certificate="${esc(w.id)}" aria-label="下载本地存证">存证 ↓</button></div><p class="detail-disclosure">本地演示收藏 · 无实际扣款<br>收藏不包含著作权转让，使用权以创作者授权为准。</p><div class="detail-section-heading"><h3>作品档案</h3><span>ARTWORK INFORMATION</span></div><dl class="meta-grid"><div><dt>作品编号</dt><dd>${esc(w.id)}</dd></div><div><dt>发布时间</dt><dd>${date(w.created)}</dd></div><div><dt>记录方式</dt><dd>本地文件摘要存证</dd></div><div><dt>演示收藏次数</dt><dd>${w.collected} 次</dd></div></dl><details class="record-details"><summary>查看作品文件指纹 <span>＋</span></summary><p>文件指纹用于检查作品文件是否一致。当前为本地记录，尚未接入真实联盟链。</p><div class="hash">${esc(w.content_hash)}</div></details><p class="detail-verify-link"><button class="link" data-verify="${esc(w.id)}">查看存证与完整记录 ↗</button></p><div class="detail-section-heading"><h3>作品轨迹</h3><span>THE STORY SO FAR</span></div>${timeline(r.events)}</div></div>`;
  } catch(e){if(mv===state.modalVersion)$('#modal-content').innerHTML=`<div class="confirm-panel"><h2>无法打开作品</h2><p>${esc(e.message)}</p></div>`;}
}
async function collect(id) {
  const mv=openModal('<div class="loading">正在准备收藏…</div>');
  try {
    await ensureUser();const {work:w}=await api('/api/works/'+encodeURIComponent(id));
    const {order}=await api('/api/orders',{work_id:id});
    if(mv!==state.modalVersion||!dialog.open)return;
    $('#modal-content').innerHTML=`<div class="confirm-panel"><span class="section-label">YOUR ART ORDER</span><h2>确认作品订单</h2><img src="${esc(w.image)}" alt="${esc(w.title)}"><h3>${esc(w.title)}</h3><p>${esc(w.creator)} · 展示价 ${money(order.price)}</p><p class="hash">订单编号：${esc(order.id)}</p><div class="note warning">此订单为本地购买流程演示，不会调用微信或支付宝，也不会扣款。确认后生成收藏编号和记录；库存以确认时的剩余份数为准。</div><label class="checkbox"><input id="confirm-demo" type="checkbox">我了解本次为演示收藏，且不包含作品著作权转让。</label><div class="error-message" id="collect-error" role="alert"></div><button class="button dark wide" id="confirm-collect">确认演示购买 ↗</button><p><button class="link" id="cancel-current-order">取消订单</button> · <a class="link" href="#orders">查看全部订单</a></p></div>`;
    $('#cancel-current-order').onclick=async()=>{try{await api('/api/orders/'+encodeURIComponent(order.id)+'/cancel',{});closeModal();toast('订单已取消');}catch(e){toast(e.message);}};
    $('#modal-content a[href="#orders"]').onclick=()=>{closeModal();if(location.hash==='#orders')route();};
    $('#confirm-collect').addEventListener('click',async e=>{
      if(!$('#confirm-demo').checked){$('#collect-error').textContent='请先勾选演示说明。';return;}
      const btn=e.currentTarget;btn.disabled=true;
      try {const r=await api('/api/orders/'+encodeURIComponent(order.id)+'/confirm',{confirm_demo:true});
        $('#modal-content').innerHTML=`<div class="confirm-panel"><div class="success-box"><div class="success-icon">✓</div><h2>${r.already?'这件作品已在你的收藏中':'收藏成功'}</h2><p>收藏编号 #${String(r.collection.serial).padStart(3,'0')}</p><p>${esc(w.title)}</p></div><p class="hash">${esc(r.collection.event_hash)}</p><p class="note">本地演示记录已保存，无实际扣款。</p><button class="button dark wide" id="go-collection">查看我的收藏 ↗</button></div>`;
        $('#go-collection').onclick=()=>{closeModal();location.hash='#collection';if(location.hash==='#collection')route();};
      }catch(err){$('#collect-error').textContent=err.message;btn.disabled=false;}
    });
  }catch(e){toast(e.message);closeModal();}
}
async function certificate(id) {
  const r=await api('/api/works/'+encodeURIComponent(id)+'/certificate');
  const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=id+'-本地演示存证.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('本地存证文件已下载');
}
async function verifyPage(v) {
  main.innerHTML=`<div class="container record-container">${heading('PROVENANCE / 作品溯源','每一份热爱，都有迹可循。','从首次发布到每一次收藏，循着记录，了解一件作品的故事。')}<div class="record-layout"><aside class="record-intro"><span class="record-symbol" aria-hidden="true">◎</span><span class="section-label">FOLLOW THE STORY</span><h2>看见作品，<br>也看见它的来处。</h2><p>输入作品编号或完整哈希，即可查看发布信息、文件校验结果与收藏轨迹。</p><div class="record-steps"><div><b>01</b><span>找到作品编号<small>作品详情页可查看</small></span></div><div><b>02</b><span>查询作品档案<small>了解发布与收藏记录</small></span></div><div><b>03</b><span>留存作品记录<small>下载本地存证文件</small></span></div></div><a href="#explore" class="link">先去发现一件作品 ↗</a></aside><div class="verify-box"><div class="panel record-panel"><div class="record-panel-heading"><span class="section-label">ARTWORK RECORDS</span><span class="record-environment"><span class="status-dot"></span>本地演示记录</span></div><h2>查询作品记录</h2><form id="verify-form" class="searchbar"><input name="q" id="verify-q" aria-label="存证查询内容" placeholder="作品编号 / 文件哈希 / 记录哈希" required maxlength="200"><button>查询记录 ↗</button></form><div class="quick-example">第一次查询？<button class="link" id="verify-example">试试样例 YL-001 ↗</button></div><div class="record-scope"><span aria-hidden="true">i</span><p>当前查询本地演示记录，尚未连接真实联盟链。校验结果用于检查文件与记录的一致性，不作为法律权属证明。</p></div><div id="verify-result" aria-live="polite"></div></div></div></div></div>`;
  let searchVersion=0;
  async function lookup(value) {
    const sv=++searchVersion;const target=$('#verify-result');target.innerHTML='<div class="loading">正在验证文件与记录…</div>';
    try{
      const r=await api('/api/verify?'+new URLSearchParams({q:value}));
      if(v!==state.routeVersion||sv!==searchVersion)return;
      const w=r.work;
      target.innerHTML=`<div class="result"><div class="result-head"><img src="${esc(w.image)}" alt="${esc(w.title)}"><div><span class="section-label">ARTWORK FOUND</span><h3>${esc(w.title)}</h3><small>${esc(w.creator)} · ${esc(w.id)}</small><p><span class="badge">${r.ledger.valid&&r.ledger.file_valid?'✓ 本地校验通过':'校验异常'}</span></p></div><button class="result-open" data-detail="${esc(w.id)}" aria-label="查看${esc(w.title)}详情">↗</button></div><dl class="meta-grid result-checks"><div><dt>记录完整性</dt><dd>${r.ledger.valid?'✓ 记录连续一致':'! 记录不一致'}</dd></div><div><dt>作品文件</dt><dd>${r.ledger.file_valid?'✓ 文件哈希一致':'! 文件缺失或已变化'}</dd></div><div><dt>校验范围</dt><dd>本地全部 ${r.ledger.checked} 条记录</dd></div><div><dt>存证环境</dt><dd>本地演示 · 未连接联盟链</dd></div></dl><details class="record-details"><summary>查看完整文件指纹与记录哈希 <span>＋</span></summary><p>作品文件 SHA-256</p><div class="hash">${esc(w.content_hash)}</div><p>首次发布记录哈希</p><div class="hash">${esc(w.record_hash)}</div></details><p class="record-download"><button class="button outline small" data-certificate="${esc(w.id)}">下载本地存证 ↓</button><span>JSON 格式 · 留存本次作品记录</span></p><div class="detail-section-heading"><h3>记录时间线</h3><span>ARTWORK JOURNEY</span></div>${timeline(r.events)}</div>`;
    }catch(e){if(v===state.routeVersion&&sv===searchVersion)target.innerHTML=`<p class="error-message">${esc(e.message)}</p>`;}
  }
  $('#verify-form').onsubmit=e=>{e.preventDefault();lookup($('#verify-q').value.trim());};
  $('#verify-example').onclick=()=>{$('#verify-q').value='YL-001';lookup('YL-001');};
  const param=new URLSearchParams(location.hash.split('?')[1]||'').get('q');if(param){$('#verify-q').value=param;await lookup(param);}
}
async function creators(v) {
  const r=await api('/api/creators');if(v!==state.routeVersion)return;
  main.innerHTML=`<div class="container public-page creators-page">${heading('THE PEOPLE BEHIND THE ART','每一种想象，<br>都有自己的名字。','从山海意境到数字实验，遇见作品背后的创作者。')}<section class="creators-intro"><div><span class="public-kicker">CREATIVE COMMUNITY / 创作群像</span><p>看见不同的表达，<br>也发现与你共鸣的灵感。</p><a href="#create" class="button outline">加入创作行列 <span>↗</span></a></div><div class="public-metrics"><div><strong>${r.creators.length}<i>位</i></strong><span>在这里展示创作</span></div><div><strong>${r.creators.reduce((n,c)=>n+Number(c.works),0)}<i>件</i></strong><span>已发布艺术作品</span></div></div></section><div class="public-section-head"><h2>发现创作者 <span>THE CREATORS</span></h2><p>按演示收藏数排序 · 同数按作品数</p></div><section class="creator-list">${r.creators.length?r.creators.map((c,i)=>`<article class="creator-row"><span class="rank">${String(i+1).padStart(2,'0')}</span><div class="avatar">${esc(c.name[0])}</div><div class="creator-identity"><span class="public-kicker">${c.id.startsWith('artist-')?'FEATURED SAMPLE':'INDEPENDENT CREATOR'}</span><h3>${esc(c.name)}</h3><p>${c.id.startsWith('artist-')?'样例创作者':'本地创作者'} · 用作品分享自己的世界</p></div><div class="creator-stats"><div><strong>${c.works}</strong><small>发布作品</small></div><div><strong>${c.collections}</strong><small>演示收藏</small></div></div><button class="link creator-open" data-creator="${esc(c.name)}" aria-label="查看${esc(c.name)}的作品">查看作品 <span>↗</span></button></article>`).join(''):empty('第一位创作者，正在等待你','发布原创作品，让新的灵感在这里被看见。')}</section><div class="public-footnote"><span>关于这里的创作者</span><p>山海造物、林间工作室和浮光计划为内置样例创作者。你发布的作品也会展示在这里；所有统计来自当前本地演示数据。</p></div></div>`;
}
async function collection(v) {
  if(!state.user){main.innerHTML=`<div class="container public-page collection-page">${heading('YOUR PERSONAL ART SPACE','把喜欢，<br>留在自己的空间。','收藏是一次相遇，也是审美的独白。')}<section class="space-welcome"><div class="space-art" aria-hidden="true"><div class="space-frame"><img src="/assets/moon.svg" alt=""></div><span>YOUR TASTE. YOUR WORLD.</span></div><div class="space-welcome-copy"><span class="public-kicker">A SPACE OF YOUR OWN</span><h2>你的艺术故事，<br>从这里开始。</h2><p>收藏触动你的作品，发布独一无二的创作。在一个空间里，留存每一份热爱。</p><div class="public-actions"><button class="button dark" id="start-collection">开启我的空间 ↗</button><button class="button outline" id="open-account">注册 / 登录</button></div><small>浏览无需登录。快速体验依赖当前浏览器会话；注册本地账号后可退出并重新登录。</small></div></section><div class="space-benefits"><div><span>01</span><h3>收藏心动之作</h3><p>让喜欢的作品，成为个人空间的一部分。</p></div><div><span>02</span><h3>分享你的灵感</h3><p>发布原创作品，讲述创作背后的故事。</p></div><div><span>03</span><h3>回看每次相遇</h3><p>从订单到作品记录，随时找到收藏轨迹。</p></div></div></div>`;$('#start-collection').onclick=async()=>{try{await ensureUser();route(false);}catch(e){toast(e.message);}};$('#open-account').onclick=()=>auth();return;}
  const r=await api('/api/collection');if(v!==state.routeVersion)return;
  const ws=state.collectionTab==='published'?r.published:r.works;
  main.innerHTML=`<div class="container public-page collection-page">${heading('YOUR PERSONAL ART SPACE','你好，'+esc(state.user.name)+'。','每一件收藏，都是你与艺术的一次相遇。')}<section class="space-overview"><div class="space-profile"><div class="space-avatar">${esc(state.user.name[0])}</div><div><span class="public-kicker">MY ART JOURNEY</span><h2>我的艺术足迹</h2><p>${state.user.email?'本地账号':'体验身份'} · 记录创作，珍藏灵感</p></div></div><div class="public-metrics"><div><strong>${r.works.length}</strong><span>我的收藏</span></div><div><strong>${r.published.length}</strong><span>我的发布</span></div></div><a class="space-orders-link" href="#orders">查看订单 <span>↗</span></a></section><div class="tabs collection-tabs"><button class="tab ${state.collectionTab==='collected'?'active':''}" data-collection-tab="collected">我的收藏 <span>${r.works.length}</span></button><button class="tab ${state.collectionTab==='published'?'active':''}" data-collection-tab="published">我的发布 <span>${r.published.length}</span></button><a class="collection-create" href="#create">发布新作品 ↗</a></div><section class="grid section personal-works">${ws.length?ws.map(card).join(''):`<div class="public-empty"><span class="empty-art" aria-hidden="true">✳</span><span class="public-kicker">${state.collectionTab==='published'?'YOUR NEXT CREATION':'YOUR FIRST DISCOVERY'}</span><h2>${state.collectionTab==='published'?'这里，等待你的第一件作品。':'给第一份心动，留一个位置。'}</h2><p>${state.collectionTab==='published'?'把独特的灵感化为作品，让更多人看见你的表达。':'在多元的数字艺术中，找到与你共鸣的那一件。'}</p><a href="${state.collectionTab==='published'?'#create':'#explore'}" class="button dark">${state.collectionTab==='published'?'发布我的作品':'去发现作品'} ↗</a></div>`}</section>${ws.length?`<div class="public-bottom-action"><p>让艺术，继续发生。</p><a href="${state.collectionTab==='published'?'#create':'#explore'}" class="button outline">${state.collectionTab==='published'?'继续创作':'发现更多作品'} ↗</a></div>`:''}<div class="public-footnote"><span>你的空间</span><p>此处展示当前身份在本地保存的作品与演示收藏；不涉及实际扣款。${state.user.email?'账号仅保存在本机。':'体验身份依赖当前浏览器会话，请妥善保留。'}</p></div></div>`;
}
async function ordersPage(v) {
  if(!state.user){await collection(v);return;}
  const r=await api('/api/orders');if(v!==state.routeVersion)return;
  const labels={PENDING:'待确认',DEMO_PAID:'演示购买已完成',CANCELLED:'已取消'};
  main.innerHTML=`<div class="container public-page orders-page"><a href="#collection" class="public-back">← 返回个人空间</a>${heading('YOUR COLLECTION HISTORY','每一次心动，<br>都有迹可循。','在这里，回看作品订单与收藏进程。')}<div class="orders-summary"><div><span class="public-kicker">COLLECTION ACTIVITY</span><h2>我的订单 <span>${r.orders.length}</span></h2></div><p><span class="status-dot"></span>本地演示 · 无实际扣款</p></div><section class="orders-list section">${r.orders.length?r.orders.map(o=>`<article class="order-row panel"><img src="${esc(o.image)}" alt="${esc(o.title)}"><div class="order-info"><span class="badge order-status status-${esc(o.status.toLowerCase())}">${labels[o.status]}</span><h3>${esc(o.title)}</h3><p>订单编号 <span>${esc(o.id)}</span></p><small>${date(o.created)}</small></div><div class="order-value"><span>展示价格</span><strong>${money(o.price)}</strong></div><div class="order-actions">${o.status==='PENDING'?`<button class="button dark small" data-collect="${esc(o.work_id)}">继续确认 ↗</button><button class="link" data-cancel-order="${esc(o.id)}">取消订单</button>`:o.status==='DEMO_PAID'?`<button class="button outline small" data-verify="${esc(o.work_id)}">查看作品记录 ↗</button>`:`<button class="button outline small" data-detail="${esc(o.work_id)}">重新发现作品 ↗</button>`}</div></article>`).join(''):`<div class="public-empty"><span class="empty-art" aria-hidden="true">◇</span><span class="public-kicker">THE STORY STARTS HERE</span><h2>下一次相遇，值得期待。</h2><p>发现喜欢的作品并体验收藏后，<br>你的订单与收藏结果将在这里留存。</p><a href="#explore" class="button dark">发现数字艺术 ↗</a></div>`}</section><div class="public-footnote"><span>关于演示订单</span><p>当前订单用于体验收藏流程，不会扣款，不代表真实微信或支付宝支付成功。完成演示购买后，可前往个人空间查看收藏。</p></div></div>`;
}
function createPage() {
  main.innerHTML=`<div class="container studio-container"><div class="studio-breadcrumb"><a href="#home">艺链艺术空间</a><span>/</span><span>创作工作台</span></div><div class="studio-heading"><div><span class="section-label">CREATOR STUDIO / 创作工作台</span><h1>让灵感，有一个<span>新的开始。</span></h1><p>上传你的原创作品，向世界讲述属于它的故事。</p></div><div class="studio-steps" aria-label="发布进度"><div class="active" id="step-upload"><b>01</b><span>上传作品</span></div><i></i><div id="step-info"><b>02</b><span>完善信息</span></div><i></i><div id="step-publish"><b>03</b><span>发布珍藏</span></div></div></div><div class="form-layout studio-layout"><form id="create-form" class="panel studio-form"><div class="studio-grid"><div class="upload-column"><div class="form-section-title"><span class="section-number">01</span><div><h2>作品文件</h2><p>先给你的灵感一个形状。</p></div><span class="required-label">必填</span></div><label class="upload studio-upload" id="dropzone"><img id="upload-preview" alt="待发布作品预览" hidden><span id="upload-plus" class="upload-empty"><span class="upload-glyph">↥</span><strong>拖拽作品到这里</strong><span>或 <em>点击选择文件</em></span><small>PNG、JPG、WebP · 最大 4MB</small></span><input name="image" type="file" accept="image/png,image/jpeg,image/webp" required aria-label="选择作品图片"></label><div class="file-status"><span id="file-status">尚未选择作品文件</span><button type="button" id="clear-upload" hidden>重新选择</button></div><div class="upload-tips"><span>✳</span><div><strong>好的作品，值得清晰呈现。</strong><p>建议使用清晰的原图，避免水印遮挡主体。预览仅展示裁切效果，原始文件将完整保存。</p></div></div><div class="studio-origin"><span>ORIGINALITY MATTERS</span><p>每一次原创，<br>都值得被认真对待。</p></div></div><div class="fields-column"><div class="form-section-title"><span class="section-number">02</span><div><h2>作品信息</h2><p>让观众读懂你的创作。</p></div></div><label class="field"><span>作品名称 <span class="field-required">*</span></span><input name="title" minlength="2" maxlength="60" placeholder="例如：蓝色的第七种情绪" required><small class="field-assist"><span>一个好名字，是故事的开始。</span><span id="title-count">0 / 60</span></small></label><label class="field"><span>艺术分类 <span class="field-required">*</span></span><select name="category"><option>数字绘画</option><option>国风艺术</option><option>生成艺术</option><option>摄影艺术</option></select></label><label class="field"><span>创作故事 <span class="field-required">*</span></span><textarea name="description" minlength="10" maxlength="1500" placeholder="聊聊作品的灵感、表达与创作过程，让收藏者更了解它。" required></textarea><small class="field-assist"><span>至少 10 字</span><span id="description-count">0 / 1500</span></small></label><div class="field-row"><label class="field"><span>展示价格 <span class="field-unit">CNY</span></span><input name="price" type="number" min="0" max="100000" step="0.01" value="39.00" required><small>本地演示，无实际扣款</small></label><label class="field"><span>发行数量 <span class="field-unit">份</span></span><input name="supply" type="number" min="1" max="10000" step="1" value="99" required><small>每个身份限收藏一份</small></label></div></div></div><div class="studio-form-bottom"><label class="checkbox"><input type="checkbox" name="rights" required><span>我确认拥有作品的发布权利，内容为本人原创或已取得授权。</span></label><div class="publish-bar"><div><span class="status-dot"></span>作品发布后即可被发现<small>本地存证演示 · 未接入真实联盟链</small></div><button class="button dark" type="submit">发布我的作品 <span>↗</span></button></div><p class="error-message" id="create-error" role="alert"></p></div></form><aside class="preview-aside studio-preview"><div class="preview-label"><span>作品预览</span><span class="live-label"><span class="status-dot"></span>实时更新</span></div><div id="card-preview">${card({id:'待发布',title:'属于你的下一件作品',image:'/assets/studio-placeholder.svg',category:'数字绘画',creator:state.user?.name||'你的创作者身份',supply:99,price:3900})}</div><div class="preview-caption"><span>↖</span>你的作品将以这样的方式被看见。</div><div class="publish-guide"><h3>发布之后，会发生什么？</h3><div><b>01</b><p>作品进入艺术作品库<small>可以通过名称、分类搜索发现。</small></p></div><div><b>02</b><p>生成专属作品记录<small>留存文件摘要与发布时间。</small></p></div><div><b>03</b><p>开启收藏与交流<small>在个人空间查看发布和收藏。</small></p></div></div><a href="#verify" class="studio-help">了解作品记录 <span>↗</span></a></aside></div></div>`;
  const form=$('#create-form');let imageData='';let fileVersion=0;
  function preview(){const fd=new FormData(form);$('#card-preview').innerHTML=card({id:'待发布',title:fd.get('title')||'属于你的下一件作品',image:imageData||'/assets/studio-placeholder.svg',category:fd.get('category'),creator:state.user?.name||'你的创作者身份',supply:Number(fd.get('supply'))||1,price:Math.round(Number(fd.get('price'))*100)||0});}
  function updateProgress(){
    $('#title-count').textContent=form.elements.title.value.length+' / 60';
    $('#description-count').textContent=form.elements.description.value.length+' / 1500';
    $('#step-upload').classList.toggle('complete',!!imageData);
    $('#step-info').classList.toggle('active',!!imageData);
    $('#step-info').classList.toggle('complete',form.elements.title.value.trim().length>=2 && form.elements.description.value.trim().length>=10);
    $('#step-publish').classList.toggle('active',!!imageData && form.elements.title.value.trim().length>=2 && form.elements.description.value.trim().length>=10);
  }
  form.addEventListener('input',()=>{preview();updateProgress();});
  const dropzone=$('#dropzone');
  ['dragenter','dragover'].forEach(type=>dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.add('drag-over');}));
  ['dragleave','drop'].forEach(type=>dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.remove('drag-over');}));
  dropzone.addEventListener('drop',e=>{if(!e.dataTransfer.files.length)return;const files=new DataTransfer();files.items.add(e.dataTransfer.files[0]);form.elements.image.files=files.files;form.elements.image.dispatchEvent(new Event('change'));});
  $('#clear-upload').onclick=()=>form.elements.image.click();
  form.elements.image.addEventListener('change',()=>{
    const fv=++fileVersion;imageData='';$('#upload-preview').hidden=true;$('#upload-plus').hidden=false;
    const f=form.elements.image.files[0];$('#file-status').textContent=f?f.name+' · '+(f.size/1024).toFixed(0)+' KB':'尚未选择作品文件';$('#clear-upload').hidden=!f;if(!f){preview();updateProgress();return;}
    if(f.size>4*1024*1024||!['image/png','image/jpeg','image/webp'].includes(f.type)){form.elements.image.value='';$('#file-status').textContent='文件不符合要求，请重新选择';$('#clear-upload').hidden=true;$('#create-error').textContent='请选择4MB以内的 PNG、JPEG 或 WebP 图片。';preview();updateProgress();return;}
    const reader=new FileReader();reader.onload=()=>{if(fv!==fileVersion)return;imageData=reader.result;$('#upload-preview').src=imageData;$('#upload-preview').hidden=false;$('#upload-plus').hidden=true;$('#create-error').textContent='';preview();updateProgress();};reader.onerror=()=>$('#create-error').textContent='图片读取失败，请重新选择。';reader.readAsDataURL(f);
  });
  form.onsubmit=async e=>{
    e.preventDefault();if(!imageData){$('#create-error').textContent='请等待图片读取完成。';return;}
    const btn=$('button[type=submit]',form);btn.disabled=true;btn.textContent='正在发布并生成本地存证…';
    try {await ensureUser();const fd=new FormData(form);const result=await api('/api/works',{title:fd.get('title'),description:fd.get('description'),category:fd.get('category'),price:Math.round(Number(fd.get('price'))*100),supply:Number(fd.get('supply')),rights:fd.get('rights')==='on',image:imageData});
      form.innerHTML=`<div class="success-box"><div class="success-icon">✓</div><h2>你的作品，已被记录。</h2><p>作品编号：${esc(result.id)}</p><div class="hash">${esc(result.record_hash)}</div></div><p class="note">本地发布成功，可在作品列表与存证查询中查看。</p><p><button class="button dark" type="button" data-detail="${esc(result.id)}">查看作品 ↗</button> <a class="button outline" href="#verify?q=${encodeURIComponent(result.id)}">查询存证</a></p>`;
    }catch(err){$('#create-error').textContent=err.message;btn.disabled=false;btn.textContent='发布我的作品 ↗';}
  };
}
function about() {
  main.innerHTML=`<div class="container public-page about-page"><section class="brand-story"><div class="brand-story-copy"><span class="public-kicker">ABOUT YILIAN / 关于艺链</span><h1>艺术无界。<br>让热爱<span>有迹可循。</span></h1><p>在数字世界里，每一份想象都值得被看见，<br>每一次相遇都值得被珍藏。</p><a href="#explore" class="button dark">走进艺链 <span>↗</span></a></div><div class="brand-story-art"><img src="/assets/jade.svg" alt="展现东方意境的数字艺术作品"><div class="brand-art-caption"><span>ART CONNECTS US</span><strong>创作，让世界彼此连接。</strong></div><span class="brand-art-index">YILIAN / DIGITAL ART SPACE</span></div></section><section class="brand-manifesto"><span class="public-kicker">OUR BELIEF / 我们的出发点</span><h2>让创作被看见，<br>让收藏更有温度。</h2><p>艺链是一个探索数字艺术展示、作品信息存证与收藏追溯的空间。我们希望连接创作者与欣赏者，让作品不仅停留在屏幕上，也能以清晰的故事与记录，走进更多人的生活。</p></section><div class="public-section-head"><h2>在艺链，你可以 <span>EXPLORE THE POSSIBILITIES</span></h2></div><section class="brand-capabilities"><article><span class="capability-symbol" aria-hidden="true">✳</span><span class="public-kicker">01 / DISCOVER</span><h3>发现新的审美</h3><p>从国风意境到生成艺术，在分类、搜索与线上展厅中，遇见不同的创作语言。</p><a href="#gallery" class="link">进入艺术展厅 ↗</a></article><article><span class="capability-symbol" aria-hidden="true">↗</span><span class="public-kicker">02 / CREATE</span><h3>表达独特的你</h3><p>上传原创作品，讲述灵感与创作故事。让每一种认真表达，都有被发现的机会。</p><a href="#create" class="link">发布原创作品 ↗</a></article><article><span class="capability-symbol" aria-hidden="true">◇</span><span class="public-kicker">03 / COLLECT</span><h3>留存每次心动</h3><p>在个人空间整理喜爱的作品，通过作品编号与记录查询，回看发布和收藏轨迹。</p><a href="#collection" class="link">开启个人空间 ↗</a></article></section><section class="brand-journey"><div><span class="public-kicker">FROM INSPIRATION TO CONNECTION</span><h2>从一个灵感，<br>到一次相遇。</h2><p>清晰的路径，让艺术更近一步。</p></div><ol><li><span>01</span><div><h3>发布作品</h3><p>上传原创图片，补充作品信息与创作故事。</p></div></li><li><span>02</span><div><h3>留下作品记录</h3><p>保存文件摘要与发布时间，建立可查询的本地档案。</p></div></li><li><span>03</span><div><h3>与热爱相遇</h3><p>浏览、欣赏并体验收藏，在个人空间留存记录。</p></div></li></ol></section><section class="brand-transparency"><div><span class="public-kicker">BUILT WITH TRANSPARENCY</span><h2>认真表达，<br>也如实呈现。</h2></div><div><p>你正在体验艺链的本地演示版。作品发布、收藏订单与记录查询均可体验；演示购买无实际扣款。</p><p>项目规划的 FISCO BCOS 联盟链、WeBASE、智能合约及真实支付尚未接入。当前存证为本地记录，不代表真实上链或法律确权；作品记录本身也不自动证明版权归属。</p><a href="#verify" class="link">了解作品记录 ↗</a></div></section><section class="brand-closing"><span class="public-kicker">YOUR NEXT DISCOVERY AWAITS</span><h2>下一件打动你的作品，<br>也许就在这里。</h2><a href="#explore" class="button dark">去发现 <span>↗</span></a></section></div>`;
}
function auth(mode='guest') {
  if(state.user&&mode==='guest') {
    openModal(`<div class="auth-panel identity-panel"><span class="section-label">YOUR CREATIVE SPACE</span><div class="identity-avatar">${esc(state.user.name.slice(0,1))}</div><h2>${esc(state.user.name)}</h2><p>${state.user.email?esc(state.user.email):'体验身份 · 留住你与艺术相遇的瞬间'}</p><div class="identity-destinations"><a href="#collection" id="identity-space"><span>▧</span><div><strong>我的艺术空间</strong><small>收藏与发布的作品</small></div><b>↗</b></a><a href="#orders" id="identity-orders"><span>☷</span><div><strong>我的订单</strong><small>查看每一次收藏记录</small></div><b>↗</b></a></div><details class="record-details"><summary>关于当前身份 <span>＋</span></summary><p>${state.user.email?'此账号仅用于当前本地服务，暂不提供邮箱验证或密码找回。':'体验身份依赖当前浏览器会话，退出后无法通过密码找回。注册账号与体验身份的数据相互独立。'}</p><div class="hash">本地身份编号：${esc(state.user.id)}</div><p>作品与收藏保存在本地服务数据库。</p></details><button class="button outline wide" id="logout">退出当前身份</button>${!state.user.email?'<p class="auth-bottom"><button class="link" id="switch-register">使用注册账号 ↗</button></p>':''}</div>`);
    $('#identity-space').onclick=()=>{closeModal();if(location.hash==='#collection')route();};
    $('#identity-orders').onclick=()=>{closeModal();if(location.hash==='#orders')route();};
    $('#logout').onclick=async()=>{try{await api('/api/auth/logout',{});await syncSession();closeModal();route(false);toast('已退出当前身份');}catch(e){toast(e.message);}};
    if($('#switch-register'))$('#switch-register').onclick=()=>auth('register');return;
  }
  const register=mode==='register';
  openModal(`<div class="auth-panel"><div class="auth-mark" aria-hidden="true">艺<span>✳</span></div><span class="section-label">ART BEGINS WITH A CONNECTION</span><h2>${mode==='guest'?'与艺术，从这里相遇。':register?'为热爱，留一个位置。':'欢迎回来。'}</h2><p>浏览作品无需登录。开启个人空间，记录你的创作与收藏。</p><div class="tabs auth-tabs" role="group" aria-label="选择访问方式"><button class="tab ${mode==='guest'?'active':''}" data-auth="guest" aria-pressed="${mode==='guest'}">快速体验</button><button class="tab ${mode==='login'?'active':''}" data-auth="login" aria-pressed="${mode==='login'}">登录</button><button class="tab ${register?'active':''}" data-auth="register" aria-pressed="${register}">注册</button></div>${mode==='guest'?'<div class="guest-invitation"><span>✳</span><h3>先感受，再开始。</h3><p>无需填写资料，即可体验作品发布与收藏。</p><small>体验身份保存在当前会话，退出后无法找回。请保留浏览器会话以继续访问。</small></div><button id="guest-start" class="button dark wide">开启我的艺术空间 ↗</button>':`<form id="auth-form">${register?'<label class="field"><span>昵称</span><input name="name" placeholder="你希望被如何称呼" required maxlength="30" autocomplete="nickname"></label>':''}<label class="field"><span>邮箱</span><input name="email" type="email" placeholder="name@example.com" required autocomplete="username" maxlength="254"></label><label class="field"><span>密码</span><input name="password" type="password" placeholder="至少 8 位字符" minlength="8" maxlength="128" required autocomplete="${register?'new-password':'current-password'}"></label><p class="auth-local-note">本地账号仅用于当前服务，暂不提供邮箱验证或密码找回，请妥善保存密码。</p><p class="error-message" id="auth-error" role="alert"></p><button type="submit" class="button dark wide">${register?'创建我的账号':'进入艺术空间'} ↗</button></form>`}<p class="auth-bottom">创作与收藏，由每一份热爱开始。</p></div>`);
  if(mode==='guest')$('#guest-start').onclick=async()=>{try{await ensureUser();closeModal();toast('体验身份已开启');route(false);}catch(e){toast(e.message);}};
  else $('#auth-form').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget;const button=$('button[type=submit]',form);button.disabled=true;
    try{await api('/api/auth/'+mode,Object.fromEntries(new FormData(form)));await syncSession();closeModal();route(false);toast(register?'本地账号已创建':'登录成功');}catch(err){$('#auth-error').textContent=err.message;button.disabled=false;}
  };
}
async function route(scroll=true) {
  const v=++state.routeVersion;const page=location.hash.slice(1).split('?')[0]||'home';
  main.dataset.page=page;
  if(dialog.open)closeModal();
  document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.dataset.nav===page||(page==='gallery'&&a.dataset.nav==='explore');a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(scroll)window.scrollTo(0,0);
  main.innerHTML='<div class="loading">正在加载艺链…</div>';
  try {
    if(page==='home')await home(v);
    else if(page==='explore'||page==='gallery')await explore(v,page==='gallery');
    else if(page==='creators')await creators(v);
    else if(page==='verify')await verifyPage(v);
    else if(page==='collection')await collection(v);
    else if(page==='orders')await ordersPage(v);
    else if(page==='create')createPage();
    else if(page==='about')about();
    else if(page==='login'||page==='register'){await home(v);if(v===state.routeVersion)auth(page);}
    else if(page==='detail'){await explore(v);if(v===state.routeVersion)await detail(new URLSearchParams(location.hash.split('?')[1]||'').get('id')||'YL-002');}
    else main.innerHTML='<div class="container section"><h1>页面不存在</h1><a class="button dark" href="#home">返回首页</a></div>';
  }catch(e){if(v===state.routeVersion)main.innerHTML=`<div class="container section"><h1>页面暂时无法加载</h1><p>${esc(e.message)}</p><button class="button dark" id="retry">重新加载</button></div>`;if($('#retry'))$('#retry').onclick=()=>route();}
}
document.addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el)return;
  if(el.dataset.detail && el.dataset.detail!=='待发布')detail(el.dataset.detail);
  if(el.dataset.collect)collect(el.dataset.collect);
  if(el.dataset.certificate)certificate(el.dataset.certificate).catch(err=>toast(err.message));
  if(el.dataset.verify){closeModal();location.hash='#verify?q='+encodeURIComponent(el.dataset.verify);}
  if(el.dataset.category){state.category=el.dataset.category;route(false);}
  if(el.dataset.creator){state.q=el.dataset.creator;state.category='全部';location.hash='#explore';if(location.hash==='#explore')route();}
  if(el.dataset.collectionTab){state.collectionTab=el.dataset.collectionTab;route(false);}
  if(el.dataset.auth)auth(el.dataset.auth);
  if(el.dataset.cancelOrder)api('/api/orders/'+encodeURIComponent(el.dataset.cancelOrder)+'/cancel',{}).then(()=>{toast('订单已取消');route(false);}).catch(err=>toast(err.message));
  if(el.dataset.trend){state.category=el.dataset.trend;state.q='';location.hash='#explore';}
});
$('#identity').onclick=()=>auth();
function setTheme(light){document.body.classList.toggle('light-theme',light);$('#theme-toggle').setAttribute('aria-label',light?'切换深色模式':'切换浅色模式');}
try{setTheme(localStorage.getItem('yilian-theme')==='light');}catch{}
$('#theme-toggle').onclick=()=>{const light=!document.body.classList.contains('light-theme');setTheme(light);try{localStorage.setItem('yilian-theme',light?'light':'dark');}catch{}};
window.addEventListener('hashchange',()=>route());
syncSession().then(()=>route()).catch(e=>{main.innerHTML='<div class="loading">本地服务未连接，请使用启动脚本打开网站。</div>';toast(e.message);});
