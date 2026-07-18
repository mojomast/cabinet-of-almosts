"use strict";

const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  if (cls) element.className = cls;
  return element;
};
const add = (parent, ...children) => { children.filter(Boolean).forEach((child) => parent.appendChild(child)); return parent; };
const clear = (element) => { while (element.firstChild) element.removeChild(element.firstChild); return element; };
const titleCase = (value) => String(value || "").replace(/^root-\d+:/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const SCORE_EXPLANATIONS = { unfinishedness: "How much unfinished work was found", reusability: "How much reusable structure was found" };
const COMPONENT_EXPLANATIONS = {
  "unfinished markers": (points) => `Unfinished notes, TODOs, or placeholders added ${points} points.`,
  "missing documentation": (points) => `No project overview was found, adding ${points} points.`,
  "missing tests": (points) => `Source code was found without tests, adding ${points} points.`,
  "recognizable source": (points) => `Recognizable source files contributed ${points} points.`,
  "named fragments": (points) => `Named functions, classes, or modules contributed ${points} points.`,
  "documented intent": (points) => `A project overview contributed ${points} points.`,
  "tested behavior": (points) => `Existing tests contributed ${points} points.`,
};
const EVIDENCE_LABELS = { "unfinished-marker": "Unfinished note", declaration: "Reusable code boundary", "missing-documentation": "Missing project overview", documentation: "Project overview", "missing-tests": "Missing tests", tests: "Existing tests", languages: "Languages found", "git-status": "Uncommitted work" };
const GOAL_LABELS = { completion: "Complete unfinished behavior", tests: "Add or adapt tests", documentation: "Clarify documentation" };
const RISK_LABELS = ["Low", "Medium", "Higher"];

function componentList(score) {
  const list = node("ul", undefined, "components");
  score.components.forEach((component) => add(list, node("li", COMPONENT_EXPLANATIONS[component.name]?.(component.points) || `${titleCase(component.name)} contributed ${component.points} points.`)));
  return list;
}
function scoreBlock(kind, score, cls = "") {
  const box = node("section", undefined, `score ${cls}`);
  add(box, node("strong", `${score.value}/100`), node("small", titleCase(kind)), node("p", SCORE_EXPLANATIONS[kind], "score-help"), componentList(score));
  return box;
}
function evidenceList(exhibit) {
  const wrap = node("div"); const list = node("ul", undefined, "evidence"); const visible = exhibit.evidence.slice(0, 48);
  visible.forEach((evidence) => {
    const item = node("li"); add(item, node("strong", EVIDENCE_LABELS[evidence.kind] || titleCase(evidence.kind)));
    if (evidence.path) add(item, node("span", ` — ${evidence.path}${evidence.line ? `, line ${evidence.line}` : ""}`, "evidence-location"));
    add(item, node("p", evidence.detail)); add(list, item);
  });
  add(wrap, list);
  if (exhibit.evidence.length > visible.length) add(wrap, node("p", `Showing the first ${visible.length} of ${exhibit.evidence.length} observations.`, "meta"));
  return wrap;
}
function projectFolder(exhibit) { return String(exhibit.source_root || exhibit.name).replace(/^root-\d+:/, "").split("/").pop(); }
function plaque(exhibit) {
  const card = node("article", undefined, "plaque");
  add(card, node("span", "One-commit autonomous GitHub repository", "kicker"), node("h3", titleCase(exhibit.name)), node("div", `Local project: ${projectFolder(exhibit)}`, "path"));
  if (exhibit.repository?.url) {
    const link = node("a", `github.com/${exhibit.repository.owner}/${exhibit.repository.name}`, "repository-link");
    link.href = exhibit.repository.url; link.target = "_blank"; link.rel = "noopener noreferrer"; add(card, link, node("div", "Exactly 1 commit", "path"));
  }
  add(card, add(node("div", undefined, "scores"), scoreBlock("unfinishedness", exhibit.scores.unfinishedness), scoreBlock("reusability", exhibit.scores.reusability, "reuse")));
  const tags = node("div", undefined, "tags"); Object.keys(exhibit.languages).forEach((language) => add(tags, node("span", titleCase(language), "tag"))); add(card, tags);
  add(card, node("p", `${exhibit.file_count} readable files and ${exhibit.fragments.length} reusable code boundaries were catalogued.`, "meta"));
  if (exhibit.truncated) add(card, node("p", `Evidence safety limits omitted ${exhibit.truncation?.evidence_omitted || 0} additional observations.`, "meta warning"));
  const detail = node("details"); add(detail, node("summary", `Why the Cabinet scored this project (${exhibit.evidence.length} observations)`), evidenceList(exhibit)); add(card, detail);
  return card;
}

const workspace = {
  data: null, indexes: null, hostId: null, goals: new Set(), focusTerms: [], preferred: new Set(), excluded: new Set(), selectedOnly: false,
  controls: { breadth: 2, novelty: 1, compatibility: 1, riskTolerance: 1 },
  variants: [], current: -1, compare: new Set(), locked: new Set(), offset: 0, stale: false,
};

function announce(message) { $("cupboard-status").textContent = message; }
function exhibitName(id) { return titleCase(workspace.indexes.exhibits.get(id)?.name || "Unknown project"); }
function currentConfig() {
  return { hostId: workspace.hostId, goals: [...workspace.goals], focusTerms: workspace.focusTerms, preferredDonors: [...workspace.preferred], excludedDonors: [...workspace.excluded], onlyDonors: workspace.selectedOnly ? [...workspace.preferred] : [], ...workspace.controls };
}
function markStale() {
  if (!workspace.variants.length) return;
  workspace.stale = true; $("stale-notice").classList.remove("hidden");
}
function hostHasNeeds(exhibit) { return (exhibit.needs || []).length > 0; }

function renderHosts() {
  const query = $("host-search").value.trim().toLowerCase(); const showAll = $("show-all-hosts").checked; const wrap = clear($("host-options"));
  const choices = workspace.data.exhibits.filter((exhibit) => (showAll || hostHasNeeds(exhibit)) && titleCase(exhibit.name).toLowerCase().includes(query)).slice(0, 50);
  choices.forEach((exhibit) => {
    const label = node("label", undefined, "choice-row"); const radio = node("input"); radio.type = "radio"; radio.name = "host"; radio.value = exhibit.id; radio.checked = workspace.hostId === exhibit.id;
    radio.addEventListener("change", () => selectHost(exhibit.id));
    const text = node("span"); add(text, node("strong", titleCase(exhibit.name)), node("small", CabinetCupboard.detectedGoals(exhibit).map((goal) => GOAL_LABELS[goal] || titleCase(goal)).join(" · ") || "No detected need"));
    add(label, radio, text); add(wrap, label);
  });
  if (!choices.length) add(wrap, node("p", "No matching host projects.", "empty compact"));
}

function selectHost(id) {
  workspace.hostId = id; workspace.variants = []; workspace.current = -1; workspace.compare.clear(); workspace.locked.clear(); workspace.offset = 0; workspace.stale = false;
  const host = workspace.indexes.exhibits.get(id); workspace.goals = new Set(CabinetCupboard.detectedGoals(host)); workspace.preferred.clear(); workspace.excluded.clear(); workspace.selectedOnly = false;
  ["goal-fieldset", "donor-fieldset", "dial-fieldset"].forEach((key) => $(key).disabled = false); $("focus-terms").disabled = false; $("arrange").disabled = false; $("start-over").disabled = false; $("selected-only").checked = false;
  $("stale-notice").classList.add("hidden"); $("variant-workspace").classList.add("hidden"); $("comparison").classList.add("hidden");
  clear($("arrangement-empty")); add($("arrangement-empty"), node("h4", `${titleCase(host.name)} is ready to arrange.`), node("p", "Choose goals and steering controls, then arrange evidence-backed pieces.")); $("arrangement-empty").classList.remove("hidden");
  renderGoals(); renderDonors(); renderHosts(); announce(`${titleCase(host.name)} selected. ${workspace.goals.size} detected direction${workspace.goals.size === 1 ? "" : "s"}.`);
}

function renderGoals() {
  const wrap = clear($("goal-options")); if (!workspace.hostId) return;
  const host = workspace.indexes.exhibits.get(workspace.hostId); const detected = new Set(CabinetCupboard.detectedGoals(host));
  ["completion", "tests", "documentation"].forEach((goal) => {
    const label = node("label", undefined, "goal-row"); const input = node("input"); input.type = "checkbox"; input.checked = workspace.goals.has(goal);
    input.addEventListener("change", () => { input.checked ? workspace.goals.add(goal) : workspace.goals.delete(goal); markStale(); renderDonors(); });
    const text = node("span"); add(text, node("strong", GOAL_LABELS[goal]), node("small", detected.has(goal) ? "Detected from host evidence" : "Your direction")); add(label, input, text); add(wrap, label);
  });
}

function donorCounts() {
  const counts = new Map();
  (workspace.indexes.affinitiesByHost.get(workspace.hostId) || []).forEach((affinity) => counts.set(affinity.from_exhibit_id, (counts.get(affinity.from_exhibit_id) || 0) + affinity.matches.length));
  return counts;
}
function renderDonors() {
  const wrap = clear($("donor-options")); if (!workspace.hostId) return;
  const query = $("donor-search").value.trim().toLowerCase(); const counts = donorCounts();
  const donors = workspace.data.exhibits.filter((item) => item.id !== workspace.hostId && titleCase(item.name).toLowerCase().includes(query)).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.name.localeCompare(b.name)).slice(0, 32);
  donors.forEach((donor) => {
    const state = workspace.preferred.has(donor.id) ? "Prefer" : workspace.excluded.has(donor.id) ? "Exclude" : "Available";
    const button = node("button", undefined, `donor-row state-${state.toLowerCase()}`); button.type = "button";
    const text = node("span"); add(text, node("strong", titleCase(donor.name)), node("small", `${counts.get(donor.id) || 0} direct matches · ${Object.keys(donor.languages).map(titleCase).join(", ") || "No code language"}`));
    add(button, text, node("b", state)); button.setAttribute("aria-label", `${titleCase(donor.name)}: ${state}. Activate to change.`);
    button.addEventListener("click", () => {
      if (workspace.locked.size && workspace.variants[workspace.current]?.pieces.some((piece) => piece.donorId === donor.id) && state === "Prefer") { announce(`Unlock pieces from ${titleCase(donor.name)} before excluding it.`); return; }
      workspace.preferred.delete(donor.id); workspace.excluded.delete(donor.id);
      if (state === "Available") workspace.preferred.add(donor.id); else if (state === "Prefer") workspace.excluded.add(donor.id);
      markStale(); renderDonors();
    });
    add(wrap, button);
  });
}

function configCandidates() { return CabinetCupboard.buildCandidates(workspace.data, workspace.indexes, currentConfig()); }
function newVariant(forcedKeys = null) {
  const candidates = configCandidates();
  if (!candidates.length) { announce("No eligible pieces under these settings. Widen compatibility or risk, choose another goal, or clear donor exclusions."); return; }
  const result = CabinetCupboard.assembleVariant(candidates, currentConfig(), [...workspace.locked], workspace.offset, forcedKeys);
  const signature = result.pieces.map((piece) => piece.key).sort().join(";");
  if (!result.pieces.length || workspace.variants.some((variant) => variant.signature === signature)) {
    workspace.offset += 1;
    const retry = CabinetCupboard.assembleVariant(candidates, currentConfig(), [...workspace.locked], workspace.offset, forcedKeys);
    result.pieces = retry.pieces; result.coveredGoals = retry.coveredGoals; result.unresolvedGoals = retry.unresolvedGoals; result.donorIds = retry.donorIds; result.risk = retry.risk; result.score = retry.score;
  }
  result.id = `variant-${workspace.variants.length + 1}`; result.signature = result.pieces.map((piece) => piece.key).sort().join(";"); result.settings = currentConfig();
  workspace.variants.push(result); workspace.current = workspace.variants.length - 1; workspace.offset += 1; workspace.stale = false;
  $("stale-notice").classList.add("hidden"); renderVariant();
  announce(`Variant ${workspace.current + 1} arranged with ${result.pieces.length} pieces from ${result.donorIds.length} donors.`);
}

function renderVariant() {
  const variant = workspace.variants[workspace.current]; if (!variant) return;
  $("arrangement-empty").classList.add("hidden"); $("variant-workspace").classList.remove("hidden");
  $("variant-label").textContent = `Variant ${workspace.current + 1} of ${workspace.variants.length}`;
  $("previous-variant").disabled = workspace.current <= 0; $("next-variant").disabled = workspace.current >= workspace.variants.length - 1;
  const summary = clear($("variant-summary"));
  add(summary, node("h4", `${exhibitName(workspace.hostId)} + ${variant.donorIds.length} donor${variant.donorIds.length === 1 ? "" : "s"}`));
  const tags = node("div", undefined, "tags"); variant.coveredGoals.forEach((goal) => add(tags, node("span", `Covered: ${GOAL_LABELS[goal] || titleCase(goal)}`, "tag success"))); variant.unresolvedGoals.forEach((goal) => add(tags, node("span", `Unresolved: ${GOAL_LABELS[goal] || titleCase(goal)}`, "tag warning-tag"))); add(tags, node("span", `${RISK_LABELS[variant.risk]} estimated adaptation risk`, "tag")); add(summary, tags);

  const list = clear($("piece-list")); const fit = clear($("fit-map"));
  variant.pieces.forEach((piece) => {
    const card = node("article", undefined, "piece-card"); const locked = workspace.locked.has(piece.key);
    add(card, node("span", `${exhibitName(piece.donorId)} · ${GOAL_LABELS[piece.goal] || titleCase(piece.goal)}`, "kicker"), node("h4", piece.label), node("div", piece.path ? `${piece.path}${piece.line ? `, line ${piece.line}` : ""}` : "Project-level observation", "path"), node("p", piece.action));
    const why = node("ul", undefined, "factor-list"); piece.factors.slice(0, 4).forEach((factor) => add(why, node("li", factor))); add(card, why);
    const actions = node("div", undefined, "piece-actions");
    const explain = node("button", "Show evidence chain"); explain.addEventListener("click", () => renderEvidence(piece));
    const lock = node("button", locked ? "Unlock piece" : "Lock piece"); lock.setAttribute("aria-pressed", String(locked)); lock.addEventListener("click", () => { locked ? workspace.locked.delete(piece.key) : workspace.locked.add(piece.key); renderVariant(); announce(`${piece.label} ${locked ? "unlocked" : "locked"}.`); });
    const replace = node("button", "Replace this piece"); replace.addEventListener("click", () => { const retained = variant.pieces.filter((item) => item.key !== piece.key).map((item) => item.key); workspace.offset += 1; newVariant(retained); });
    add(actions, explain, lock, replace); add(card, actions); add(list, card);

    const row = node("button", undefined, "fit-row"); add(row, node("span", GOAL_LABELS[piece.goal] || titleCase(piece.goal)), node("b", "→"), node("span", `${exhibitName(piece.donorId)} · ${piece.label}`)); row.addEventListener("click", () => renderEvidence(piece)); add(fit, row);
  });
  renderComparison();
}

function renderEvidence(piece) {
  const wrap = clear($("evidence-chain")); const host = workspace.indexes.exhibits.get(piece.hostId); const donor = workspace.indexes.exhibits.get(piece.donorId);
  const hostEvidence = piece.hostEvidenceId ? workspace.indexes.evidence.get(piece.hostId).get(piece.hostEvidenceId) : null;
  const donorEvidence = workspace.indexes.evidence.get(piece.donorId).get(piece.sourceEvidenceId);
  add(wrap, node("span", "Host observation", "kicker"), node("h4", titleCase(host.name)), node("p", hostEvidence ? `${hostEvidence.path || "Project"}${hostEvidence.line ? `, line ${hostEvidence.line}` : ""}: ${hostEvidence.detail}` : `“${GOAL_LABELS[piece.goal]}” was selected by you.`));
  add(wrap, node("span", "Matching rule", "kicker"), node("h4", `${GOAL_LABELS[piece.goal] || titleCase(piece.goal)} → ${piece.goal === "completion" ? "implementation" : piece.goal} provision`));
  const factors = node("ul", undefined, "factor-list"); piece.factors.forEach((factor) => add(factors, node("li", factor))); add(wrap, factors);
  add(wrap, node("span", "Donor evidence", "kicker"), node("h4", `${titleCase(donor.name)} · ${piece.label}`), node("p", `${donorEvidence?.path || "Project"}${donorEvidence?.line ? `, line ${donorEvidence.line}` : ""}: ${donorEvidence?.detail || piece.preview}`));
  add(wrap, node("span", "Intended use", "kicker"), node("p", piece.action));
  add(wrap, node("span", "Limits and cautions", "kicker")); const cautions = node("ul", undefined, "caution-list"); piece.cautions.forEach((caution) => add(cautions, node("li", caution))); add(wrap, cautions);
}

function renderComparison() {
  const selected = workspace.variants.filter((variant) => workspace.compare.has(variant.id)); const section = $("comparison");
  if (!selected.length) { section.classList.add("hidden"); return; } section.classList.remove("hidden");
  const head = clear($("comparison-head")); const headRow = node("tr"); add(headRow, node("th", "Attribute")); selected.forEach((variant) => add(headRow, node("th", `Variant ${workspace.variants.indexOf(variant) + 1}`))); add(head, headRow);
  const body = clear($("comparison-body"));
  const rows = [
    ["Goal coverage", (v) => v.coveredGoals.map((goal) => GOAL_LABELS[goal]).join("; ") || "None"],
    ["Unresolved", (v) => v.unresolvedGoals.map((goal) => GOAL_LABELS[goal]).join("; ") || "None"],
    ["Donors", (v) => v.donorIds.map(exhibitName).join("; ")],
    ["Pieces", (v) => v.pieces.map((piece) => `${exhibitName(piece.donorId)}: ${piece.label}`).join("; ")],
    ["Estimated risk", (v) => RISK_LABELS[v.risk]],
  ];
  rows.forEach(([label, value]) => { const row = node("tr"); add(row, node("th", label)); selected.forEach((variant) => add(row, node("td", value(variant)))); add(body, row); });
}

function resetWorkspace() {
  workspace.hostId = null; workspace.goals.clear(); workspace.focusTerms = []; workspace.preferred.clear(); workspace.excluded.clear(); workspace.variants = []; workspace.current = -1; workspace.compare.clear(); workspace.locked.clear(); workspace.offset = 0; workspace.stale = false;
  ["goal-fieldset", "donor-fieldset", "dial-fieldset"].forEach((key) => $(key).disabled = true); $("focus-terms").disabled = true; $("arrange").disabled = true; $("start-over").disabled = true; $("host-search").value = ""; $("focus-terms").value = "";
  clear($("arrangement-empty")); add($("arrangement-empty"), node("h4", "Choose the project you want to advance."), node("p", "The Cupboard will use only bounded observations already present in this snapshot.")); $("arrangement-empty").classList.remove("hidden"); $("variant-workspace").classList.add("hidden"); $("comparison").classList.add("hidden"); $("stale-notice").classList.add("hidden"); clear($("evidence-chain")).appendChild(node("p", "Select a proposed piece to inspect exactly why it fits.")); renderHosts(); renderGoals(); renderDonors();
}

function wireControls() {
  $("host-search").addEventListener("input", renderHosts); $("show-all-hosts").addEventListener("change", renderHosts); $("donor-search").addEventListener("input", renderDonors);
  $("selected-only").addEventListener("change", (event) => { workspace.selectedOnly = event.target.checked; markStale(); });
  $("focus-terms").addEventListener("change", (event) => { workspace.focusTerms = event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12); markStale(); });
  const dialData = {
    breadth: { key: "breadth", labels: null }, novelty: { key: "novelty", labels: ["Familiar", "Balanced", "Surprising"] },
    compatibility: { key: "compatibility", labels: ["Strict", "Balanced", "Exploratory"] }, risk: { key: "riskTolerance", labels: ["Cautious", "Considered", "Speculative"] },
  };
  Object.entries(dialData).forEach(([id, setting]) => $(id).addEventListener("input", (event) => {
    const value = Number(event.target.value); workspace.controls[setting.key] = value; $(`${id}-output`).value = setting.labels ? setting.labels[value] : `${value} donor${value === 1 ? "" : "s"} · up to ${value + 2} pieces`; markStale();
  }));
  $("arrange").addEventListener("click", () => newVariant()); $("rearrange").addEventListener("click", () => newVariant()); $("try-another").addEventListener("click", () => newVariant()); $("start-over").addEventListener("click", resetWorkspace);
  $("previous-variant").addEventListener("click", () => { if (workspace.current > 0) { workspace.current -= 1; renderVariant(); } });
  $("next-variant").addEventListener("click", () => { if (workspace.current < workspace.variants.length - 1) { workspace.current += 1; renderVariant(); } });
  $("add-compare").addEventListener("click", () => { const variant = workspace.variants[workspace.current]; if (!variant) return; if (workspace.compare.has(variant.id)) workspace.compare.delete(variant.id); else if (workspace.compare.size < 3) workspace.compare.add(variant.id); else announce("Comparison is limited to three variants."); renderComparison(); });
  $("clear-comparison").addEventListener("click", () => { workspace.compare.clear(); renderComparison(); });
}

function wireTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  function activate(tab) { tabs.forEach((item) => { const active = item === tab; item.classList.toggle("active", active); item.setAttribute("aria-selected", String(active)); item.tabIndex = active ? 0 : -1; }); document.querySelectorAll(".view").forEach((view) => view.classList.toggle("hidden", view.id !== tab.dataset.view)); }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); let next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; tabs[next].focus(); activate(tabs[next]); });
  });
}

function render(data) {
  workspace.data = data; workspace.indexes = CabinetCupboard.buildIndexes(data);
  $("summary").textContent = `${data.exhibits.length} one-commit GitHub repositories · ${data.affinities.length} directional evidence matches`;
  const grid = $("gallery-grid"); if (!data.exhibits.length) add(grid, node("p", "No historical autonomous projects were found.", "empty")); else data.exhibits.forEach((exhibit) => add(grid, plaque(exhibit)));
  $("limits").textContent = JSON.stringify(data.limits, null, 2); $("fingerprint").textContent = `Dataset: ${data.collection?.project_count || data.exhibits.length} mojomast GitHub repositories · exactly one commit each`;
  renderHosts(); wireControls();
}

wireTabs();
fetch("/cabinet.json", { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error(`The Cabinet returned HTTP ${response.status}.`); return response.json(); }).then(render).catch((error) => { $("summary").textContent = "The historical collection could not be opened."; add($("gallery-grid"), node("p", error.message, "empty")); });
