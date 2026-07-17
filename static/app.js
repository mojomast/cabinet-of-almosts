"use strict";
const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => { const el=document.createElement(tag); if(text!==undefined) el.textContent=String(text); if(cls) el.className=cls; return el; };
function add(parent, ...children){ children.forEach(c=>parent.appendChild(c)); return parent; }
function scoreBlock(label, score, cls){ const box=node("div",undefined,"score "+(cls||"")); add(box,node("strong",score.value),node("small",label)); const ul=node("ul",undefined,"components"); score.components.forEach(c=>add(ul,node("li",`${c.name}: +${c.points} [${c.evidence_ids.join(", ")}]`))); add(box,ul); return box; }
function evidenceList(exhibit){ const ul=node("ul",undefined,"evidence"); exhibit.evidence.forEach(e=>{ const where=e.path ? `${e.path}${e.line ? ":"+e.line : ""} — ` : ""; add(ul,node("li",`[${e.id} · ${e.kind}] ${where}${e.detail}`)); }); return ul; }
function plaque(exhibit){
  const card=node("article",undefined,"plaque");
  add(card,node("span","Exhibit · "+exhibit.id,"kicker"),node("h3",exhibit.name),node("div",exhibit.source_root,"path"));
  const scores=node("div",undefined,"scores"); add(scores,scoreBlock("unfinishedness",exhibit.scores.unfinishedness),scoreBlock("reusability",exhibit.scores.reusability,"reuse")); add(card,scores);
  const tags=node("div",undefined,"tags"); Object.keys(exhibit.languages).forEach(x=>add(tags,node("span",x,"tag"))); add(card,tags);
  add(card,node("p",`${exhibit.file_count} text files · ${exhibit.fragments.length} shallow fragments`,"meta"));
  if(exhibit.truncated){ const t=exhibit.truncation||{}; add(card,node("p",`Scan truncated: ${(t.reasons||[]).join(", ")||"limit reached"}; ${t.evidence_omitted||0} evidence observations omitted`,"meta warning")); }
  const detail=node("details"); add(detail,node("summary","Evidence ledger"),evidenceList(exhibit)); add(card,detail); return card;
}
function render(data){
  $("summary").textContent=`${data.exhibits.length} exhibits · ${data.affinities.length} directional affinities`;
  const grid=$("gallery-grid"); if(!data.exhibits.length) add(grid,node("p","No Exhibits found in the supplied roots.","empty")); else data.exhibits.forEach(e=>add(grid,plaque(e)));
  const names=Object.fromEntries(data.exhibits.map(e=>[e.id,e.name])); const recipes=$("recipes");
  if(!data.resurrection_recipes.length) add(recipes,node("p","No evidence-supported recipe emerged. Add multiple complementary Exhibits to activate the Workbench.","empty"));
  data.resurrection_recipes.forEach((r,i)=>{ const card=node("article",undefined,"recipe"), body=node("div"); add(card,node("div",String(i+1).padStart(2,"0"),"number")); add(body,node("div",`${names[r.donor_exhibit_id]||r.donor_exhibit_id} → ${names[r.host_exhibit_id]||r.host_exhibit_id}`,"flow"),node("h3",r.title),node("p",r.rationale)); const files=node("ul",undefined,"evidence"); (r.source_file_provenance||[]).forEach(p=>add(files,node("li",`${p.path} ← ${p.evidence_ids.join(", ")}`))); add(body,node("p",`Affinity ${r.affinity_id}; evidence ${r.evidence_ids.join(", ")}`,"meta"),files); const ol=node("ol"); r.steps.forEach(s=>add(ol,node("li",s))); add(body,ol); add(card,body); add(recipes,card); });
  $("limits").textContent=JSON.stringify(data.limits,null,2); $("fingerprint").textContent=`Schema ${data.schema} · ${data.generator_version}`;
}
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{ document.querySelectorAll(".tab").forEach(t=>{t.classList.toggle("active",t===tab);t.setAttribute("aria-selected",String(t===tab));}); document.querySelectorAll(".view").forEach(v=>v.classList.toggle("hidden",v.id!==tab.dataset.view)); }));
fetch("/cabinet.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}).then(render).catch(err=>{$("summary").textContent="Could not open the Cabinet";add($("gallery-grid"),node("p",err.message,"empty"));});
