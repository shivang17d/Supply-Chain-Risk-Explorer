// ── Selectors ────────────────────────────────────────────────────
const docs     = document.querySelector('#docs');
const count    = document.querySelector('#count');
const status   = document.querySelector('#uploadStatus');
const messages = document.querySelector('#messages');
const graphEl  = document.querySelector('#graph');

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

// ── Entity type colour palette ───────────────────────────────────
const TYPE_COLORS = {
  Supplier:'#22c55e', Manufacturer:'#3b82f6', Company:'#8b5cf6',
  Component:'#f97316', Product:'#fb923c',     Facility:'#eab308',
  Region:'#06b6d4',   Country:'#10b981',      Port:'#d946ef',
  RiskEvent:'#ef4444',Regulation:'#64748b',   Person:'#f59e0b',
  Entity:'#94a3b8'
};
function typeColor(t){ return TYPE_COLORS[t] || '#94a3b8'; }

// ── Document list ────────────────────────────────────────────────
async function refreshDocs(){
  try{
    const r = await fetch('/api/documents'), a = await r.json();
    count.textContent = `${a.length} file${a.length===1?'':'s'}`;
    docs.innerHTML = a.map(d =>
      `<div class="doc">
        <span title="${esc(d.name)}">📄 ${esc(d.name)}</span>
        <button onclick="removeDoc('${d.id}')">×</button>
      </div>`
    ).join('');
  } catch(e) {
    status.textContent = 'Neo4j is not connected. Start with Docker Compose.';
  }
}
window.removeDoc = async id => {
  await fetch('/api/documents/'+id, {method:'DELETE'});
  refreshDocs(); refreshGraph();
};

// ── Graph (D3 force-directed) ────────────────────────────────────
let simulation = null;

async function refreshGraph(){
  try{
    const r = await fetch('/api/graph'), g = await r.json();
    draw(g.nodes||[], g.edges||[]);
  } catch(e) {
    graphEl.innerHTML = '<div class="graph-empty">Could not load graph.</div>';
  }
}

function draw(nodes, edges){
  document.querySelector('#graphCount').textContent =
    `${nodes.length} entities · ${edges.length} links`;

  if(!nodes.length){
    graphEl.innerHTML = '<div class="graph-empty">Upload a document to build your first graph.</div>';
    return;
  }

  // Stop previous simulation
  if(simulation){ simulation.stop(); simulation = null; }
  graphEl.innerHTML = '';

  const w = graphEl.clientWidth  || 600;
  const h = graphEl.clientHeight || 420;

  // Build valid links (D3 mutates source/target so clone first)
  const nodeMap   = new Map(nodes.map(n => [n.key, n]));
  const links     = edges
    .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map(e => ({ source: e.source, target: e.target, type: e.type }));

  // Node radius proportional to mentions
  const getR = n => Math.min(7 + Number(n.mentions||0) * 1.5, 22);

  // Top nodes that always show their label
  const topKeys = new Set(
    nodes.slice().sort((a,b) => b.mentions - a.mentions).slice(0,18).map(n => n.key)
  );

  // ── SVG root ──────────────────────────────────────────────────
  const svg = d3.select(graphEl)
    .append('svg')
      .attr('width','100%').attr('height','100%')
      .style('position','absolute').style('inset',0);

  // Arrow marker for edges
  svg.append('defs').append('marker')
    .attr('id','arrow').attr('viewBox','0 -4 8 8')
    .attr('refX',8).attr('refY',0)
    .attr('markerWidth',6).attr('markerHeight',6)
    .attr('orient','auto')
    .append('path').attr('d','M0,-4L8,0L0,4').attr('fill','#cbd5e1');

  const g = svg.append('g');

  // Zoom / Pan
  svg.call(
    d3.zoom().scaleExtent([0.1, 6])
      .on('zoom', ev => g.attr('transform', ev.transform))
  );

  // ── Force simulation ──────────────────────────────────────────
  simulation = d3.forceSimulation(nodes)
    .force('link',    d3.forceLink(links).id(d => d.key).distance(80).strength(0.35))
    .force('charge',  d3.forceManyBody().strength(-220))
    .force('center',  d3.forceCenter(w/2, h/2))
    .force('collide', d3.forceCollide().radius(d => getR(d) + 10));

  // ── Draw edges ────────────────────────────────────────────────
  const link = g.append('g').attr('class','edges')
    .selectAll('line').data(links).join('line')
      .attr('stroke','#cbd5e1')
      .attr('stroke-width', 1.2)
      .attr('stroke-opacity', 0.65)
      .attr('marker-end','url(#arrow)');

  // ── Draw nodes ────────────────────────────────────────────────
  const node = g.append('g').attr('class','nodes')
    .selectAll('g').data(nodes).join('g')
      .attr('class','gnode')
      .style('cursor','pointer')
      .call(
        d3.drag()
          .on('start', (ev,d) => { if(!ev.active) simulation.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
          .on('drag',  (ev,d) => { d.fx=ev.x; d.fy=ev.y; })
          .on('end',   (ev,d) => { if(!ev.active) simulation.alphaTarget(0); d.fx=null; d.fy=null; })
      );

  // Circle
  node.append('circle')
    .attr('r', d => getR(d))
    .attr('fill', d => typeColor(d.type))
    .attr('fill-opacity', 0.82)
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.8);

  // Label — always visible for top nodes only
  node.filter(d => topKeys.has(d.key))
    .append('text')
      .attr('dy', d => getR(d) + 11)
      .attr('text-anchor','middle')
      .attr('font-size', 10)
      .attr('fill', '#374151')
      .attr('pointer-events','none')
      .text(d => d.name.length > 16 ? d.name.slice(0,14)+'…' : d.name);

  // ── Tooltip ───────────────────────────────────────────────────
  let tip = document.getElementById('graph-tooltip');
  if(!tip){ tip = document.createElement('div'); tip.id='graph-tooltip'; document.body.appendChild(tip); }

  node
    .on('mousemove', (ev, d) => {
      const rels = (d.rels||[]).filter(x=>x.target).slice(0,5)
        .map(x => `<span class="tip-rel">${esc(x.type)}</span> → ${esc(x.target)}`).join('<br>');
      tip.style.display = 'block';
      tip.style.left    = (ev.clientX + 14) + 'px';
      tip.style.top     = (ev.clientY - 10) + 'px';
      tip.innerHTML = `<b>${esc(d.name)}</b><span class="tip-type">${esc(d.type)}</span>${rels ? '<div class="tip-rels">'+rels+'</div>' : ''}`;
    })
    .on('mouseleave', () => { tip.style.display = 'none'; });

  // Click → fill question
  node.on('click', (ev, d) => {
    const rels = (d.rels||[]).filter(x=>x.target).map(x=>x.type+' → '+x.target).join(', ');
    const q = document.querySelector('#question');
    q.value = `Tell me about ${d.name}${rels ? ' and its connections: '+rels : ''}`;
    autoGrow();
  });

  // ── Tick ──────────────────────────────────────────────────────
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

// ── Chat ─────────────────────────────────────────────────────────
document.querySelector('#ask').onsubmit = async e => {
  e.preventDefault();
  const q = document.querySelector('#question'), text = q.value.trim();
  if(!text) return;
  q.value = ''; q.style.height = 'auto';
  document.querySelector('.starter')?.remove();

  messages.insertAdjacentHTML('beforeend',
    `<div class="msg user">${esc(text)}</div>
     <div class="msg assistant loading">Traversing graph and gathering evidence…</div>`
  );
  const b = messages.lastElementChild;

  try{
    const r = await fetch('/api/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({question: text})
    });
    const x = await r.json();
    if(!r.ok) throw Error(x.detail || 'Request failed');

    b.classList.remove('loading');
    // ── Render markdown ──────────────────────────────────────
    b.innerHTML = typeof marked !== 'undefined'
      ? marked.parse(x.answer)
      : esc(x.answer).replace(/\n/g,'<br>');

    // Source citations
    if(x.sources?.length){
      const box = document.createElement('div');
      box.className = 'sources';
      box.innerHTML = x.sources.map((s,i) =>
        `<div class="source">
          <b>Source ${i+1} · ${esc(s.document)}</b>
          ${esc(s.text.slice(0,350))}${s.text.length>350?'…':''}
        </div>`
      ).join('');
      b.append(box);
    }
  } catch(err){
    b.classList.remove('loading');
    b.textContent = err.message;
  }
  messages.scrollTop = messages.scrollHeight;
};

// ── Upload ───────────────────────────────────────────────────────
document.querySelector('#file').onchange = async e => {
  const f = e.target.files[0]; if(!f) return;
  status.textContent = `Extracting entities from ${f.name}…`;
  const fd = new FormData(); fd.append('file', f);
  try{
    const r = await fetch('/api/documents', {method:'POST', body:fd});
    const x = await r.json();
    if(!r.ok) throw Error(x.detail || 'Upload failed');
    status.textContent = `Indexed ${x.chunks} passages and extracted their graph facts.`;
    await refreshDocs(); await refreshGraph();
  } catch(err){ status.textContent = err.message; }
  e.target.value = '';
};

// ── Auto-grow textarea ───────────────────────────────────────────
const textarea = document.querySelector('#question');
function autoGrow(){ textarea.style.height='auto'; textarea.style.height=Math.min(textarea.scrollHeight,140)+'px'; }
textarea.addEventListener('input', autoGrow);

document.querySelector('#question').onkeydown = e => {
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); document.querySelector('#ask').requestSubmit(); }
};

// ── Init ─────────────────────────────────────────────────────────
document.querySelector('#reload').onclick = refreshGraph;
window.addEventListener('resize', () => refreshGraph());
refreshDocs(); refreshGraph();
