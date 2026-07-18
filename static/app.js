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
const compareText = (left, right) => String(left || "") < String(right || "") ? -1 : String(left || "") > String(right || "") ? 1 : 0;

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
  add(box, node("strong", `${score.value}/100`), node("small", `${titleCase(kind)} heuristic`), node("p", SCORE_EXPLANATIONS[kind], "score-help"));
  if (score.components.length) {
    const detail = node("details", undefined, "score-detail");
    add(detail, node("summary", "Observed score factors"), componentList(score)); add(box, detail);
  }
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
function safeRepositoryUrl(repository) {
  try {
    const url = new URL(repository?.url || "");
    return url.protocol === "https:" && url.hostname === "github.com" ? url.href : null;
  } catch (_error) { return null; }
}
function plaque(exhibit) {
  const card = node("article", undefined, "plaque"); card.dataset.exhibitId = exhibit.id;
  add(card, node("span", "One-commit autonomous GitHub repository", "kicker"), node("h3", titleCase(exhibit.name)), node("div", `Local project: ${projectFolder(exhibit)}`, "path"));
  const repositoryUrl = safeRepositoryUrl(exhibit.repository);
  if (repositoryUrl) {
    const link = node("a", `github.com/${exhibit.repository.owner}/${exhibit.repository.name}`, "repository-link");
    link.href = repositoryUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; add(card, link, node("div", "Exactly 1 commit", "path"));
  }
  const profile = workspace.capabilityIndexes?.byExhibitId.get(exhibit.id);
  if (profile) {
    const capability = node("section", undefined, "plaque-capability");
    add(capability, node("span", "Capability Profile", "kicker"), node("p", profile.description, "profile-description"));
    const capabilityTags = node("div", undefined, "tags");
    (profile.provides || []).forEach((item) => add(capabilityTags, node("span", item.capability, "tag success")));
    add(capability, capabilityTags);
    const declarations = node("dl", undefined, "profile-summary");
    const summaryRows = [["Accepts", profile.accepts], ["Produces", profile.produces], ["Mashup roles", (profile.mashup_roles || []).map((item) => item.role)]];
    summaryRows.forEach(([label, values]) => { if (!(values || []).length) return; add(declarations, node("dt", label), node("dd", values.map(capabilityValue).join(" · "))); });
    add(capability, declarations); add(card, capability);
  }
  add(card, add(node("div", undefined, "scores"), scoreBlock("unfinishedness", exhibit.scores.unfinishedness), scoreBlock("reusability", exhibit.scores.reusability, "reuse")));
  const tags = node("div", undefined, "tags"); Object.keys(exhibit.languages).forEach((language) => add(tags, node("span", titleCase(language), "tag"))); add(card, tags);
  add(card, node("p", `${exhibit.file_count} readable files and ${exhibit.fragments.length} reusable code boundaries were catalogued.`, "meta"));
  if (exhibit.truncated) add(card, node("p", `Evidence safety limits omitted ${exhibit.truncation?.evidence_omitted || 0} additional observations.`, "meta warning"));
  const detail = node("details"); add(detail, node("summary", `Why the Cabinet scored this project (${exhibit.evidence.length} observations)`));
  detail.addEventListener("toggle", () => { if (detail.open && detail.children.length === 1) add(detail, evidenceList(exhibit)); }); add(card, detail);
  return card;
}

function capabilityValue(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value || "");
  return value.name || value.type || value.capability || value.description || "Declared item";
}
function profileHaystack(profile) {
  return [profile.project, profile.display_name, profile.description, ...(profile.primary_users || []), ...(profile.inspected_paths || []), ...(profile.ecosystem && typeof profile.ecosystem === "object" ? Object.values(profile.ecosystem).flat() : [profile.ecosystem]),
    ...(profile.feature_descriptions || []).flatMap((item) => [item.name, item.description, ...(item.evidence || [])]),
    ...(profile.provides || []).flatMap((item) => [item.capability, item.description, ...(item.interfaces || []), ...(item.evidence || [])]),
    ...(profile.accepts || []).map(capabilityValue), ...(profile.produces || []).map(capabilityValue),
    ...(profile.mashup_roles || []).flatMap((item) => [item.role, item.why, ...(item.complements || []), ...(item.evidence || [])]),
  ].filter(Boolean).join(" ").toLowerCase();
}
function galleryHaystack(exhibit) {
  const profile = workspace.capabilityIndexes?.byExhibitId.get(exhibit.id);
  return [exhibit.name, exhibit.repository?.name, exhibit.repository?.owner, ...Object.keys(exhibit.languages || {}), profile ? profileHaystack(profile) : ""].filter(Boolean).join(" ").toLowerCase();
}
function renderGallery() {
  const total = workspace.data?.exhibits.length || 0;
  const query = $("gallery-search").value.trim().toLowerCase();
  const visible = (workspace.data?.exhibits || []).filter((exhibit) => !query || galleryHaystack(exhibit).includes(query));
  const grid = clear($("gallery-grid"));
  grid.setAttribute("aria-busy", "false");
  visible.forEach((exhibit) => add(grid, plaque(exhibit)));
  if (!visible.length) add(grid, node("p", `No Exhibits match “${$("gallery-search").value.trim()}”. Clear search to restore all ${total} Exhibits.`, "empty"));
  $("gallery-status").textContent = query
    ? `Showing ${visible.length} of ${total} Exhibits in this Cabinet. Search is active.`
    : `Showing all ${total} Exhibits in this Cabinet.`;
  $("clear-gallery-search").disabled = !query;
}

const workspace = {
  data: null, indexes: null, compatibility: null, capabilityMap: null, capabilityIndexes: null, snapshotSha256: null, hostId: null, goals: new Set(), focusTerms: [], preferred: new Set(), excluded: new Set(), selectedOnly: false,
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
  workspace.stale = true; $("stale-notice").classList.remove("hidden"); announce("Steering changed. The current arrangement is preserved until you rearrange.");
}
function hostHasNeeds(exhibit) { return (exhibit.needs || []).length > 0; }

function renderHosts() {
  const query = $("host-search").value.trim().toLowerCase(); const showAll = $("show-all-hosts").checked; const wrap = clear($("host-options"));
  const eligible = workspace.data.exhibits.filter(hostHasNeeds);
  const scope = showAll ? workspace.data.exhibits : eligible;
  const choices = scope.filter((exhibit) => titleCase(exhibit.name).toLowerCase().includes(query));
  choices.forEach((exhibit) => {
    const label = node("label", undefined, "choice-row"); const radio = node("input"); radio.type = "radio"; radio.name = "host"; radio.value = exhibit.id; radio.checked = workspace.hostId === exhibit.id;
    radio.addEventListener("change", () => selectHost(exhibit.id));
    const text = node("span"); add(text, node("strong", titleCase(exhibit.name)), node("small", CabinetCupboard.detectedGoals(exhibit).map((goal) => GOAL_LABELS[goal] || titleCase(goal)).join(" · ") || "No detected need"));
    add(label, radio, text); add(wrap, label);
  });
  if (!choices.length) add(wrap, node("p", `No Host Exhibits match this search${showAll ? "." : " within projects with detected Needs."}`, "empty compact"));
  $("host-status").textContent = query
    ? `Showing ${choices.length} search result${choices.length === 1 ? "" : "s"} from ${scope.length} available Host Exhibits.`
    : showAll
      ? `Showing all ${workspace.data.exhibits.length} Exhibits. ${eligible.length} have detected Needs.`
      : `Showing all ${eligible.length} Exhibits with detected Needs (${workspace.data.exhibits.length} total Exhibits).`;
  $("clear-host-search").disabled = !query;
}

function selectHost(id) {
  workspace.hostId = id; workspace.variants = []; workspace.current = -1; workspace.compare.clear(); workspace.locked.clear(); workspace.offset = 0; workspace.stale = false;
  const host = workspace.indexes.exhibits.get(id); workspace.goals = new Set(CabinetCupboard.detectedGoals(host)); workspace.preferred.clear(); workspace.excluded.clear(); workspace.selectedOnly = false;
  ["goal-fieldset", "donor-fieldset", "dial-fieldset"].forEach((key) => $(key).disabled = false); $("focus-terms").disabled = false; $("arrange").disabled = false; $("start-over").disabled = false; $("selected-only").checked = false;
  $("stale-notice").classList.add("hidden"); $("variant-workspace").classList.add("hidden"); $("comparison").classList.add("hidden");
  clear($("arrangement-empty")); add($("arrangement-empty"), node("h4", `${titleCase(host.name)} is ready to arrange.`), node("p", "Choose goals and steering controls, then arrange evidence-backed pieces.")); $("arrangement-empty").classList.remove("hidden");
  syncCompareButton(); renderGoals(); renderDonors(); renderHosts(); announce(`${titleCase(host.name)} selected. ${workspace.goals.size} detected direction${workspace.goals.size === 1 ? "" : "s"}.`);
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
  const total = workspace.data.exhibits.length - 1;
  const donors = workspace.data.exhibits.filter((item) => item.id !== workspace.hostId && titleCase(item.name).toLowerCase().includes(query)).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || compareText(a.name, b.name));
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
  if (!donors.length) add(wrap, node("p", "No potential donor Exhibits match this search. Clear it to restore the full donor scope.", "empty compact"));
  $("donor-status").textContent = query ? `Showing ${donors.length} of ${total} potential donor Exhibits. Search is active.` : `Showing all ${total} potential donor Exhibits.`;
  $("clear-donor-search").disabled = !query;
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
  $("arrangement-heading").focus();
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
  renderComparison(); syncCompareButton();
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
  $("evidence-heading").focus(); announce(`Evidence chain opened for ${piece.label} from ${titleCase(donor.name)}.`);
}

function syncCompareButton() {
  const variant = workspace.variants[workspace.current]; const selected = Boolean(variant && workspace.compare.has(variant.id));
  $("add-compare").setAttribute("aria-pressed", String(selected)); $("add-compare").textContent = selected ? "Remove from compare" : "Add to compare";
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
  workspace.selectedOnly = false; workspace.controls = { breadth: 2, novelty: 1, compatibility: 1, riskTolerance: 1 };
  ["goal-fieldset", "donor-fieldset", "dial-fieldset"].forEach((key) => $(key).disabled = true); $("focus-terms").disabled = true; $("arrange").disabled = true; $("start-over").disabled = true;
  $("host-search").value = ""; $("donor-search").value = ""; $("focus-terms").value = ""; $("show-all-hosts").checked = false; $("selected-only").checked = false;
  [["breadth", 2], ["novelty", 1], ["compatibility", 1], ["risk", 1]].forEach(([id, value]) => { $(id).value = value; });
  $("breadth-output").value = "2 donors · up to 4 pieces"; $("novelty-output").value = "Balanced"; $("compatibility-output").value = "Balanced"; $("risk-output").value = "Considered";
  clear($("arrangement-empty")); add($("arrangement-empty"), node("h4", "Choose the project you want to advance."), node("p", "The Cupboard will use only bounded observations already present in this snapshot.")); $("arrangement-empty").classList.remove("hidden"); $("variant-workspace").classList.add("hidden"); $("comparison").classList.add("hidden"); $("stale-notice").classList.add("hidden"); clear($("evidence-chain")).appendChild(node("p", "Select a proposed piece to inspect exactly why it was suggested.")); $("donor-status").textContent = "Choose a Host Exhibit to browse potential donors."; syncCompareButton(); renderHosts(); renderGoals(); renderDonors(); announce("Cupboard Steering reset. Showing all Exhibits with detected Needs.");
}

function wireControls() {
  $("host-search").addEventListener("input", renderHosts); $("show-all-hosts").addEventListener("change", renderHosts); $("donor-search").addEventListener("input", renderDonors);
  $("clear-host-search").addEventListener("click", () => { $("host-search").value = ""; renderHosts(); $("host-search").focus(); });
  $("clear-donor-search").addEventListener("click", () => { $("donor-search").value = ""; renderDonors(); $("donor-search").focus(); });
  $("gallery-search").addEventListener("input", renderGallery);
  $("clear-gallery-search").addEventListener("click", () => { $("gallery-search").value = ""; renderGallery(); $("gallery-search").focus(); });
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
  $("add-compare").addEventListener("click", () => { const variant = workspace.variants[workspace.current]; if (!variant) return; if (workspace.compare.has(variant.id)) workspace.compare.delete(variant.id); else if (workspace.compare.size < 3) workspace.compare.add(variant.id); else announce("Comparison is limited to three variants."); renderComparison(); syncCompareButton(); });
  $("clear-comparison").addEventListener("click", () => { workspace.compare.clear(); renderComparison(); syncCompareButton(); });
}

const graphWorkspace = { hostId: null, graph: null, activeDonorId: null, selected: new Map() };
const svgNode = (tag, attributes = {}, text) => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text !== undefined) element.textContent = String(text);
  return element;
};

function graphHostChoices() {
  return workspace.data.exhibits.map((host) => ({ host, graph: CabinetCupboard.graphForHost(workspace.data, workspace.indexes, host.id, workspace.compatibility) }))
    .filter((item) => item.graph.relationships.length)
    .sort((a, b) => {
      const aCompletion = CabinetCupboard.detectedGoals(a.host).includes("completion"); const bCompletion = CabinetCupboard.detectedGoals(b.host).includes("completion");
      return Number(bCompletion) - Number(aCompletion) || b.graph.relationships.length - a.graph.relationships.length || compareText(a.host.name, b.host.name);
    });
}

function initializeGraph(preserveState = false) {
  const previousHost = graphWorkspace.hostId;
  const select = clear($("graph-host")); const choices = graphHostChoices();
  choices.forEach(({ host, graph }) => {
    const detected = CabinetCupboard.detectedGoals(host).map((goal) => GOAL_LABELS[goal] || titleCase(goal));
    const profile = workspace.compatibility?.profiles?.find((item) => item.exhibit_id === host.id);
    const directions = detected.length ? detected.join(", ") : `${profile?.host_needs?.length || 0} static/policy Needs`;
    const option = node("option", `${titleCase(host.name)} — ${directions} · ${graph.relationships.length} donors`); option.value = host.id; add(select, option);
  });
  select.disabled = !choices.length; $("graph-search").disabled = !choices.length;
  if (!choices.length) { $("graph-status").textContent = "No Hosts with directional Affinities or static compatibility observations were found."; return; }
  const canPreserve = preserveState && choices.some(({ host }) => host.id === previousHost);
  graphWorkspace.hostId = canPreserve ? previousHost : choices[0].host.id; select.value = graphWorkspace.hostId; renderAffinityGraph(!canPreserve);
  if (canPreserve) {
    const available = new Set(graphWorkspace.graph.relationships.flatMap((relationship) => relationship.pieces.map((piece) => piece.key)));
    [...graphWorkspace.selected.keys()].forEach((key) => { if (!available.has(key)) graphWorkspace.selected.delete(key); });
    renderSelectionTray(); updateBrief();
  }
}

function graphRelationships() {
  const query = $("graph-search").value.trim().toLowerCase();
  return (graphWorkspace.graph?.relationships || []).filter((relationship) => titleCase(workspace.indexes.exhibits.get(relationship.donorId)?.name).toLowerCase().includes(query));
}

function activateGraphDonor(donorId) {
  graphWorkspace.activeDonorId = donorId; renderAffinityGraph(false); renderPieceOptions();
  const donor = workspace.indexes.exhibits.get(donorId); $("piece-picker-heading").focus?.();
  $("brief-status").textContent = `Inspecting Contribution Pieces from ${titleCase(donor?.name)}. Select only the elements you want in the Brief.`;
}

function renderGraphSvg(relationships) {
  const svg = clear($("affinity-graph"));
  add(svg, svgNode("title", { id: "graph-svg-title" }, "Host-centered directional Affinity graph"), svgNode("desc", { id: "graph-svg-desc" }, `Donor Exhibits point toward Host ${exhibitName(graphWorkspace.hostId)}. The map shows ${Math.min(24, relationships.length)} of ${relationships.length} filtered donors.`));
  const defs = svgNode("defs"); const marker = svgNode("marker", { id: "graph-arrow", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto", markerUnits: "strokeWidth" }); add(marker, svgNode("path", { d: "M0,0 L8,4 L0,8 z", class: "graph-arrowhead" })); add(defs, marker); add(svg, defs);
  const center = { x: 450, y: 280 }; const visible = relationships.slice(0, 24); const radius = visible.length < 9 ? 200 : 225;
  visible.forEach((relationship, index) => {
    const angle = (-Math.PI / 2) + (Math.PI * 2 * index / Math.max(1, visible.length)); const x = center.x + Math.cos(angle) * radius; const y = center.y + Math.sin(angle) * radius;
    add(svg, svgNode("line", { x1: x, y1: y, x2: center.x, y2: center.y, class: `graph-edge${relationship.recipeId ? " recipe-edge" : ""}${relationship.compatibilityEdgeIds?.length ? " compatibility-edge" : ""}`, "marker-end": "url(#graph-arrow)" }));
    const group = svgNode("g", { class: `graph-node donor-node${graphWorkspace.activeDonorId === relationship.donorId ? " active" : ""}${relationship.recipeId ? " recipe-node" : ""}`, tabindex: 0, role: "button", "aria-label": `${exhibitName(relationship.donorId)}, ${relationship.pieces.length} Contribution Pieces${relationship.recipeId ? ", recipe-backed" : ""}` });
    add(group, svgNode("circle", { cx: x, cy: y, r: 30 }), svgNode("text", { x, y: y + 4, "text-anchor": "middle" }, exhibitName(relationship.donorId).slice(0, 11)));
    group.addEventListener("click", () => activateGraphDonor(relationship.donorId)); group.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); activateGraphDonor(relationship.donorId); } }); add(svg, group);
  });
  const hostGroup = svgNode("g", { class: "graph-node host-node", role: "img", "aria-label": `Host ${exhibitName(graphWorkspace.hostId)}` }); add(hostGroup, svgNode("circle", { cx: center.x, cy: center.y, r: 54 }), svgNode("text", { x: center.x, y: center.y + 5, "text-anchor": "middle" }, exhibitName(graphWorkspace.hostId).slice(0, 16))); add(svg, hostGroup);
}

function renderAffinityGraph(resetDonor = false) {
  graphWorkspace.graph = CabinetCupboard.graphForHost(workspace.data, workspace.indexes, graphWorkspace.hostId, workspace.compatibility);
  if (resetDonor) { graphWorkspace.activeDonorId = null; graphWorkspace.selected.clear(); renderSelectionTray(); }
  const relationships = graphRelationships(); const list = clear($("graph-donor-list"));
  relationships.forEach((relationship, index) => {
    const donor = workspace.indexes.exhibits.get(relationship.donorId); const button = node("button", undefined, `graph-donor${graphWorkspace.activeDonorId === donor.id ? " active" : ""}`); button.type = "button"; button.dataset.donorId = donor.id;
    const labels = node("span"); add(labels, node("strong", titleCase(donor.name)), node("small", `${relationship.pieces.length} Piece${relationship.pieces.length === 1 ? "" : "s"} · ${relationship.need} ← ${relationship.provision}${relationship.sharedLanguages.length ? ` · shared ${relationship.sharedLanguages.join(", ")}` : ""}`));
    const relationshipLabel = relationship.affinityId && relationship.compatibilityEdgeIds?.length ? `${relationship.recipeId ? "Recipe-backed Affinity" : "Affinity"} + static` : relationship.recipeId ? "Recipe-backed" : relationship.affinityId ? "Affinity" : "Static observations";
    add(button, node("b", String(index + 1).padStart(2, "0")), labels, node("em", relationshipLabel)); button.addEventListener("click", () => activateGraphDonor(donor.id)); add(list, button);
  });
  if (!relationships.length) add(list, node("p", "No evidence-linked donors match this search. Clear it to restore the Host graph.", "empty compact"));
  const query = $("graph-search").value.trim(); $("clear-graph-search").disabled = !query;
  const staticCount = graphWorkspace.graph.relationships.reduce((total, relationship) => total + (relationship.compatibilityEdgeIds?.length || 0), 0);
  $("graph-status").textContent = `${exhibitName(graphWorkspace.hostId)} has ${graphWorkspace.graph.relationships.length} bounded donor leads${staticCount ? `, including ${staticCount} static compatibility observations or policy hypotheses` : ""}. Showing ${relationships.length}${query ? " filtered" : ""}; the visual map displays ${Math.min(24, relationships.length)}.`;
  renderGraphSvg(relationships);
  if (graphWorkspace.activeDonorId && !relationships.some((item) => item.donorId === graphWorkspace.activeDonorId)) { graphWorkspace.activeDonorId = null; }
  renderPieceOptions();
}

function toggleGraphPiece(piece, checked) {
  if (checked) {
    const donors = new Set([...graphWorkspace.selected.values()].map((item) => item.donorId)); donors.add(piece.donorId);
    if (graphWorkspace.selected.size >= 8 || donors.size > 4) { $("brief-status").textContent = "Selection limit reached: choose up to 8 Pieces from up to 4 donors."; renderPieceOptions(); return; }
    graphWorkspace.selected.set(piece.key, piece);
  } else graphWorkspace.selected.delete(piece.key);
  renderPieceOptions(); renderSelectionTray(); updateBrief();
}

function renderPieceOptions() {
  const wrap = clear($("piece-options")); const relationship = graphWorkspace.graph?.relationships.find((item) => item.donorId === graphWorkspace.activeDonorId);
  if (!relationship) { wrap.className = "workspace-empty"; add(wrap, node("p", "Select a donor node or list item to inspect its Contribution Pieces.")); return; }
  wrap.className = "piece-options"; const donor = workspace.indexes.exhibits.get(relationship.donorId);
  const relationshipKind = relationship.affinityId && relationship.compatibilityEdgeIds?.length ? `${relationship.recipeId ? "Recipe-backed Affinity" : "Directional Affinity"} + static observations` : relationship.recipeId ? "Recipe-backed Affinity" : relationship.affinityId ? "Directional Affinity" : "Static compatibility observations";
  add(wrap, node("span", relationshipKind, "kicker"), node("h4", `${titleCase(donor.name)} → ${exhibitName(graphWorkspace.hostId)}`), node("p", "Each Piece names its evidence level and unresolved checks. Static matches are integration leads, not verified runtime compatibility.", "control-help"));
  relationship.pieces.forEach((piece) => {
    const label = node("label", undefined, "graph-piece"); const input = node("input"); input.type = "checkbox"; input.dataset.pieceKey = piece.key; input.checked = graphWorkspace.selected.has(piece.key); input.addEventListener("change", () => toggleGraphPiece(piece, input.checked));
    const text = node("span"); add(text, node("strong", piece.label), node("small", `${piece.compatibilityEdgeId ? "Static observation · " : "Cabinet Evidence · "}${piece.path || "Project observation"}${piece.line ? `, line ${piece.line}` : ""}`), node("small", piece.factors.join(" · "))); add(label, input, text); add(wrap, label);
  });
}

function renderSelectionTray() {
  const tray = clear($("selection-tray")); const pieces = [...graphWorkspace.selected.values()];
  if (!pieces.length) add(tray, node("p", "No Pieces selected. Choose up to 8 Pieces from up to 4 donors.", "empty compact"));
  pieces.forEach((piece) => { const row = node("div", undefined, "selected-piece"); const text = node("span"); add(text, node("strong", piece.label), node("small", `${exhibitName(piece.donorId)} · ${piece.path || "Project observation"}`)); const remove = node("button", "Remove", "quiet"); remove.type = "button"; remove.addEventListener("click", () => toggleGraphPiece(piece, false)); add(row, text, remove); add(tray, row); });
  $("clear-graph-selection").disabled = !pieces.length; $("intent-note").disabled = !pieces.length;
}

function updateBrief() {
  const intent = $("intent-note").value; $("intent-count").textContent = `${[...intent].length.toLocaleString()} / 2,000 characters`;
  if (!graphWorkspace.selected.size) { $("brief-preview").value = ""; $("brief-size").textContent = "0 bytes"; $("copy-brief").disabled = true; $("brief-status").textContent = "Choose at least one Contribution Piece to generate a Brief."; return; }
  try {
    const brief = CabinetCupboard.buildRecombinationBrief(workspace.data, workspace.indexes, { hostId: graphWorkspace.hostId, pieceKeys: [...graphWorkspace.selected.keys()] }, intent, workspace.compatibility);
    $("brief-preview").value = brief; $("brief-size").textContent = `${new TextEncoder().encode(brief).length.toLocaleString()} UTF-8 bytes · ${graphWorkspace.selected.size} Pieces`; $("copy-brief").disabled = false; $("brief-status").textContent = "Brief ready. Review the exact Evidence Packets before copying.";
  } catch (error) { $("brief-preview").value = ""; $("copy-brief").disabled = true; $("brief-status").textContent = error.message; }
}

async function copyBrief() {
  const brief = $("brief-preview").value; if (!brief) return;
  try { await navigator.clipboard.writeText(brief); $("brief-status").textContent = "Copied the Recombination Brief for this Arrangement."; }
  catch (_error) { $("brief-preview").focus(); $("brief-preview").select(); $("brief-status").textContent = "Automatic copy was unavailable. Press Ctrl+C or Command+C to copy the selected Brief."; }
}

function wireGraphControls() {
  $("graph-host").addEventListener("change", (event) => { graphWorkspace.hostId = event.target.value; $("graph-search").value = ""; $("intent-note").value = ""; renderAffinityGraph(true); updateBrief(); });
  $("graph-search").addEventListener("input", () => renderAffinityGraph(false));
  $("clear-graph-search").addEventListener("click", () => { $("graph-search").value = ""; renderAffinityGraph(false); $("graph-search").focus(); });
  $("clear-graph-selection").addEventListener("click", () => { graphWorkspace.selected.clear(); renderPieceOptions(); renderSelectionTray(); updateBrief(); });
  $("intent-note").addEventListener("input", updateBrief); $("copy-brief").addEventListener("click", copyBrief);
}

const capabilityWorkspace = { selectedId: null, mashupIds: new Set() };

function validateCapabilityMap(map) {
  const profiles = map?.projects;
  const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
  const topKeys = ["schema", "cabinet_binding", "projects"];
  const bindingKeys = ["canonical_sha256", "exhibit_count"];
  if (!exactKeys(map, topKeys) || map.schema !== "cabinet-project-capability-map/v1" || !exactKeys(map.cabinet_binding, bindingKeys) || !Array.isArray(profiles)) throw new Error("The Capability Map has an unsupported shape.");
  const binding = map.cabinet_binding;
  const boundHash = binding.canonical_sha256;
  const boundCount = binding.exhibit_count;
  if (boundHash !== workspace.snapshotSha256 || boundCount !== workspace.data.exhibits.length || profiles.length !== workspace.data.exhibits.length) throw new Error("The Capability Map is not hash- and count-bound to this Cabinet Snapshot.");
  const exhibits = new Map(workspace.data.exhibits.map((item) => [item.id, item])); const seen = new Set();
  const profileKeys = ["project", "display_name", "description", "primary_users", "provides", "accepts", "produces", "ecosystem", "maturity_signals", "feature_descriptions", "mashup_roles", "inspected_paths", "confidence", "exhibit_id", "source_fingerprint"];
  const ecosystemKeys = ["frameworks", "languages", "protocols", "storage"];
  const maturityKeys = ["docs", "tests", "working_entrypoints"];
  const interfaces = new Set(["cli", "data", "file", "library", "protocol", "web"]);
  const evidenceShape = (item, keys) => exactKeys(item, keys) && strings(item.evidence);
  profiles.forEach((profile) => {
    const exhibit = exhibits.get(profile?.exhibit_id);
    if (!exhibit || seen.has(profile.exhibit_id) || profile.project !== exhibit.name || profile.source_fingerprint !== exhibit.source_fingerprint) throw new Error("A Capability Profile identity, exact name, or source fingerprint does not match the Cabinet.");
    if (!exactKeys(profile, profileKeys) || ["project", "exhibit_id", "source_fingerprint", "display_name", "description"].some((field) => typeof profile[field] !== "string") || !strings(profile.primary_users) || !strings(profile.accepts) || !strings(profile.produces) || !strings(profile.inspected_paths) || !exactKeys(profile.ecosystem, ecosystemKeys) || ecosystemKeys.some((key) => !strings(profile.ecosystem[key])) || !exactKeys(profile.maturity_signals, maturityKeys) || typeof profile.maturity_signals.docs !== "boolean" || typeof profile.maturity_signals.tests !== "boolean" || !strings(profile.maturity_signals.working_entrypoints) || !Array.isArray(profile.feature_descriptions) || !Array.isArray(profile.provides) || !Array.isArray(profile.mashup_roles) || !["low", "medium", "high"].includes(profile.confidence)) throw new Error("A Capability Profile is malformed.");
    if (profile.feature_descriptions.some((item) => !evidenceShape(item, ["name", "description", "evidence"]) || typeof item.name !== "string" || typeof item.description !== "string") || profile.provides.some((item) => !evidenceShape(item, ["capability", "description", "evidence", "interfaces"]) || typeof item.capability !== "string" || typeof item.description !== "string" || !strings(item.interfaces) || item.interfaces.some((value) => !interfaces.has(value))) || profile.mashup_roles.some((item) => !evidenceShape(item, ["role", "why", "evidence", "complements"]) || typeof item.role !== "string" || typeof item.why !== "string" || !strings(item.complements))) throw new Error("A Capability Profile declaration is malformed.");
    seen.add(profile.exhibit_id);
  });
  if (seen.size !== exhibits.size) throw new Error("The Capability Map does not cover the exact Exhibit corpus.");
  return map;
}

function addProfileSection(parent, heading, items, describe) {
  if (!(items || []).length) return;
  add(parent, node("h4", heading)); const list = node("ul", undefined, "profile-declarations");
  items.forEach((item) => { const row = node("li"); const value = describe(item); add(row, node("strong", value.label), value.detail ? node("p", value.detail) : null); if ((item.evidence || []).length) { const evidence = node("details"); add(evidence, node("summary", `Source evidence (${item.evidence.length})`)); const paths = node("ul"); item.evidence.forEach((entry) => add(paths, node("li", entry))); add(evidence, paths); add(row, evidence); } add(list, row); }); add(parent, list);
}

function renderProfileSvg(graph, svgId, titleId, descId, title, description) {
  const svg = clear($(svgId)); add(svg, svgNode("title", { id: titleId }, title), svgNode("desc", { id: descId }, description));
  if (!graph.nodes.length) return;
  const locations = new Map(); const projects = graph.nodes.filter((item) => item.kind === "project"); const others = graph.nodes.filter((item) => item.kind !== "project");
  const graphHeight = Math.max(540, 220 + Math.floor(Math.max(0, others.length - 1) / 6) * 125 + 62); svg.setAttribute("viewBox", `0 0 900 ${graphHeight}`);
  projects.forEach((item, index) => locations.set(item.id, { x: projects.length === 1 ? 450 : 110 + index * (680 / Math.max(1, projects.length - 1)), y: 85 }));
  others.forEach((item, index) => locations.set(item.id, { x: 75 + (index % 6) * 150, y: 220 + Math.floor(index / 6) * 125 }));
  graph.edges.forEach((edge) => { const from = locations.get(edge.from); const to = locations.get(edge.to); if (from && to) add(svg, svgNode("line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: `capability-edge edge-${edge.relationship}` })); });
  graph.nodes.forEach((item) => { const point = locations.get(item.id); const group = svgNode("g", { class: `capability-node node-${item.kind}`, role: "img", "aria-label": `${item.kind}: ${item.label}` }); add(group, svgNode("circle", { cx: point.x, cy: point.y, r: item.kind === "project" ? 42 : 31 }), svgNode("text", { x: point.x, y: point.y + 4, "text-anchor": "middle" }, item.label.slice(0, item.kind === "project" ? 18 : 12))); add(svg, group); });
}

function renderCapabilityList() {
  if (!workspace.capabilityIndexes) return; const query = $("capability-search").value.trim().toLowerCase(); const list = clear($("capability-list"));
  const profiles = workspace.capabilityIndexes.profiles.filter((profile) => !query || profileHaystack(profile).includes(query)).sort((a, b) => compareText(a.display_name, b.display_name) || compareText(a.exhibit_id, b.exhibit_id));
  profiles.forEach((profile) => { const button = node("button", undefined, `capability-choice${profile.exhibit_id === capabilityWorkspace.selectedId ? " active" : ""}`); button.type = "button"; button.setAttribute("aria-pressed", String(profile.exhibit_id === capabilityWorkspace.selectedId)); add(button, node("strong", profile.display_name), node("small", `${profile.provides.length} capabilities · ${profile.mashup_roles.length} roles`)); button.addEventListener("click", () => selectCapabilityProfile(profile.exhibit_id, true)); add(list, button); });
  if (!profiles.length) add(list, node("p", "No profiles match this search.", "empty compact"));
  $("capability-list-status").textContent = `Showing ${profiles.length} of ${workspace.capabilityIndexes.profiles.length} complete profiles${query ? "; search is active" : ""}.`;
  $("clear-capability-search").disabled = !query;
}

function selectCapabilityProfile(id, focus = false) {
  const profile = workspace.capabilityIndexes?.byExhibitId.get(id); if (!profile) return; capabilityWorkspace.selectedId = id; renderCapabilityList();
  const body = clear($("capability-detail-body")); body.className = "capability-profile";
  add(body, node("span", `${profile.project} · ${profile.confidence} confidence`, "kicker"), node("h3", profile.display_name), node("p", profile.description, "profile-description"));
  addProfileSection(body, "Primary users", profile.primary_users, (item) => ({ label: item }));
  addProfileSection(body, "Features", profile.feature_descriptions, (item) => ({ label: item.name, detail: item.description }));
  addProfileSection(body, "Provides", profile.provides, (item) => ({ label: item.capability, detail: `${item.description}${item.interfaces.length ? ` Interfaces: ${item.interfaces.join(", ")}.` : ""}` }));
  addProfileSection(body, "Accepts", profile.accepts, (item) => ({ label: capabilityValue(item) })); addProfileSection(body, "Produces", profile.produces, (item) => ({ label: capabilityValue(item) }));
  addProfileSection(body, "Mashup roles", profile.mashup_roles, (item) => ({ label: item.role, detail: `${item.why}${item.complements.length ? ` Declared complements: ${item.complements.join(", ")}.` : ""}` }));
  add(body, node("h4", "Ecosystem and maturity"), node("p", `${typeof profile.ecosystem === "object" ? JSON.stringify(profile.ecosystem) : profile.ecosystem} · ${Array.isArray(profile.maturity_signals) ? profile.maturity_signals.join(" · ") : typeof profile.maturity_signals === "object" ? JSON.stringify(profile.maturity_signals) : profile.maturity_signals}`), node("h4", "Inspected paths")); const paths = node("ul", undefined, "inspected-paths"); profile.inspected_paths.forEach((path) => add(paths, node("li", path))); add(body, paths);
  const graph = CabinetCupboard.capabilityGraphForProject(workspace.capabilityIndexes, id, 18); renderProfileSvg(graph, "capability-graph", "capability-svg-title", "capability-svg-desc", `${profile.display_name} declared relationships`, `${graph.nodes.length} source-declared nodes. ${graph.truncated ? "The visual is bounded; the profile detail is complete." : "The visual contains all declared nodes."}`);
  $("add-capability-mashup").disabled = capabilityWorkspace.mashupIds.has(id); $("add-capability-mashup").textContent = capabilityWorkspace.mashupIds.has(id) ? "Profile is in Conceptual Mashup" : "Add profile to Conceptual Mashup"; if (focus) $("capability-detail-heading").focus();
}

function renderMashup() {
  const tray = clear($("mashup-tray")); const ids = [...capabilityWorkspace.mashupIds];
  if (!ids.length) add(tray, node("p", "No profiles selected. Add up to 4 profiles.", "empty compact"));
  ids.forEach((id) => { const profile = workspace.capabilityIndexes.byExhibitId.get(id); const item = node("div", undefined, "mashup-item"); add(item, node("strong", profile.display_name)); const remove = node("button", "Remove", "quiet"); remove.type = "button"; remove.addEventListener("click", () => { capabilityWorkspace.mashupIds.delete(id); renderMashup(); selectCapabilityProfile(capabilityWorkspace.selectedId); }); add(item, remove); add(tray, item); });
  $("clear-mashup").disabled = !ids.length; const graph = CabinetCupboard.conceptualMashupGraph(workspace.capabilityIndexes, ids, 18);
  renderProfileSvg(graph, "mashup-graph", "mashup-svg-title", "mashup-svg-desc", `Conceptual Mashup of ${ids.length} profiles`, `${graph.nodes.length} source-declared role and feature nodes. No runtime compatibility is inferred.`);
}

function wireCapabilityControls() {
  $("capability-search").addEventListener("input", renderCapabilityList); $("clear-capability-search").addEventListener("click", () => { $("capability-search").value = ""; renderCapabilityList(); $("capability-search").focus(); });
  $("add-capability-mashup").addEventListener("click", () => { const id = capabilityWorkspace.selectedId; if (!id || capabilityWorkspace.mashupIds.has(id)) return; if (capabilityWorkspace.mashupIds.size >= 4) { $("capability-status").textContent = "Conceptual Mashup is limited to 4 profiles."; return; } capabilityWorkspace.mashupIds.add(id); renderMashup(); selectCapabilityProfile(id); });
  $("clear-mashup").addEventListener("click", () => { capabilityWorkspace.mashupIds.clear(); renderMashup(); if (capabilityWorkspace.selectedId) selectCapabilityProfile(capabilityWorkspace.selectedId); });
}

function rejectCapabilityMap(reason = "") {
  workspace.capabilityMap = null; workspace.capabilityIndexes = null; capabilityWorkspace.selectedId = null; capabilityWorkspace.mashupIds.clear();
  $("capability-search").value = ""; $("capability-search").disabled = true; $("capability-workbench").classList.add("hidden");
  if (reason) console.warn(`Capability Map rejected: ${reason}`);
}

function loadCapabilityMap() {
  rejectCapabilityMap();
  fetch("/capability-map.json", { cache: "no-store" }).then((response) => { if (response.status === 204 || response.status === 404) return null; if (!response.ok) throw new Error(`Capability Map returned HTTP ${response.status}.`); return response.json(); }).then((map) => {
    if (!map) { rejectCapabilityMap(); return; }
    const valid = validateCapabilityMap(map); const indexes = CabinetCupboard.buildCapabilityIndexes(valid); workspace.capabilityMap = valid; workspace.capabilityIndexes = indexes;
    capabilityWorkspace.selectedId = indexes.profiles.slice().sort((a, b) => compareText(a.display_name, b.display_name) || compareText(a.exhibit_id, b.exhibit_id))[0]?.exhibit_id || null; capabilityWorkspace.mashupIds.clear(); $("capability-workbench").classList.remove("hidden"); $("capability-search").disabled = false;
    $("capability-status").textContent = `${indexes.profiles.length} exact-corpus Capability Profiles loaded. All relationships below are source-declared; runtime compatibility is not inferred.`; renderCapabilityList(); if (capabilityWorkspace.selectedId) selectCapabilityProfile(capabilityWorkspace.selectedId); renderMashup(); renderGallery();
  }).catch((error) => { rejectCapabilityMap(error.message); renderGallery(); });
}

function wireTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  function activate(tab) { tabs.forEach((item) => { const active = item === tab; item.classList.toggle("active", active); item.setAttribute("aria-selected", String(active)); item.tabIndex = active ? 0 : -1; }); document.querySelectorAll(".view").forEach((view) => view.classList.toggle("hidden", view.id !== tab.dataset.view)); }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); let next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; tabs[next].focus(); activate(tabs[next]); });
  });
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text); const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateCompatibilitySidecar(sidecar) {
  const exact = (value, keys, optional = []) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => optional.includes(key) || Object.hasOwn(value, key));
  const strings = (value, max, size = 1024) => Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string" && item.length <= size && !/[\x00-\x1f\x7f-\x9f]/.test(item));
  const TOP = ["schema", "generator_version", "cabinet_binding", "scan_policy", "limits", "profiles", "compatibility_edges"];
  if (!exact(sidecar, TOP) || sidecar.schema !== "cabinet-compatibility-observations/v1" || sidecar.generator_version !== "1.0.0" || !Array.isArray(sidecar.profiles) || !Array.isArray(sidecar.compatibility_edges)) throw new Error("The compatibility sidecar has an unsupported shape.");
  const policy = sidecar.scan_policy; const requiredPolicy = { static_only: true, project_code_executed: false, package_managers_executed: false, dependencies_installed: false, network_used: false, secret_values_recorded: false };
  if (!exact(policy, Object.keys(requiredPolicy)) || Object.entries(requiredPolicy).some(([key, value]) => policy[key] !== value)) throw new Error("The compatibility sidecar does not attest to the required static-only scan policy.");
  if (!exact(sidecar.cabinet_binding, ["schema", "canonical_sha256", "exhibit_count"]) || sidecar.cabinet_binding.schema !== workspace.data.schema || sidecar.cabinet_binding.canonical_sha256 !== workspace.snapshotSha256 || sidecar.cabinet_binding.exhibit_count !== workspace.data.exhibits.length) throw new Error("The compatibility sidecar is not SHA-256-bound to this Cabinet Snapshot.");
  if (!exact(sidecar.limits, ["max_interfaces_per_exhibit", "max_edges_per_need", "max_total_edges"]) || sidecar.limits.max_interfaces_per_exhibit !== 64 || sidecar.limits.max_edges_per_need !== 8 || sidecar.limits.max_total_edges !== 6000 || sidecar.compatibility_edges.length > 6000) throw new Error("The compatibility sidecar exceeds or changes supported bounds.");
  const exhibits = new Map(workspace.data.exhibits.map((exhibit) => [exhibit.id, exhibit])); const seen = new Set(); const recordsByProfile = new Map(); const needsByProfile = new Map(); const observationsByProfile = new Map(); const blockersByProfile = new Map(); const allRecordIds = new Set();
  const PROFILE = ["exhibit_id", "name", "source_fingerprint", "root_resolved", "ecosystems", "manifests", "licenses", "signals", "interfaces", "observations", "provisions", "host_needs", "compatibility_blockers", "truncation"];
  const shapes = {
    manifests: [["id", "path", "file_sha256", "kind", "ecosystem", "evidence_level", "parse_status", "package_name", "dependencies", "runtime_constraints", "has_cli_entrypoint", "script_names"], ["script_names"]],
    licenses: [["id", "path", "file_sha256", "status", "evidence_level", "limitations"], []],
    interfaces: [["id", "fragment_id", "name", "path", "line", "kind", "evidence_level", "limitations"], []],
    observations: [["id", "kind", "present", "cabinet_evidence_ids", "evidence_level", "execution_status"], []],
    provisions: [["id", "kind", "support_ids", "evidence_level"], []],
    host_needs: [["id", "kind", "origin", "cabinet_evidence_ids", "observation_ids", "evidence_level", "status"], []],
  };
  sidecar.profiles.forEach((profile) => {
    const exhibit = exhibits.get(profile?.exhibit_id); const recordFields = [...Object.keys(shapes), "compatibility_blockers"];
    if (!exact(profile, PROFILE) || !exhibit || seen.has(profile.exhibit_id) || profile.name !== exhibit.name || profile.source_fingerprint !== exhibit.source_fingerprint || typeof profile.root_resolved !== "boolean" || !strings(profile.ecosystems, 32, 80) || !strings(profile.signals, 16, 80) || !exact(profile.truncation, ["reasons", "records_omitted"]) || !strings(profile.truncation.reasons, 16, 120) || !Number.isInteger(profile.truncation.records_omitted) || profile.truncation.records_omitted < 0 || recordFields.some((field) => !Array.isArray(profile[field]) || profile[field].length > (field === "interfaces" ? 64 : 512)) || profile.compatibility_blockers.length) throw new Error("A compatibility profile does not match the loaded Exhibit corpus.");
    seen.add(profile.exhibit_id); const profileIds = new Set(); const files = new Map((exhibit.files || []).map((file) => [file.path, file])); const fragments = new Map((exhibit.fragments || []).map((fragment) => [fragment.id, fragment])); const evidence = new Set((exhibit.evidence || []).map((item) => item.id));
    Object.entries(shapes).forEach(([field, [keys, optional]]) => profile[field].forEach((record) => { if (!exact(record, keys, optional) || typeof record.id !== "string" || allRecordIds.has(record.id)) throw new Error("A compatibility profile has duplicate, malformed, or extra record fields."); allRecordIds.add(record.id); if (!["host_needs"].includes(field)) profileIds.add(record.id); }));
    [...profile.manifests, ...profile.licenses].forEach((record) => { if (!files.has(record.path) || files.get(record.path).sha256 !== record.file_sha256) throw new Error("A compatibility file observation does not match Cabinet Evidence."); });
    profile.interfaces.forEach((record) => { const fragment = fragments.get(record.fragment_id); if (!fragment || record.path !== fragment.path || record.line !== fragment.line_start || record.name !== fragment.name) throw new Error("A compatibility interface does not match a Cabinet Fragment."); });
    const observationIds = new Set(profile.observations.map((item) => item.id));
    if (profile.observations.some((item) => !strings(item.cabinet_evidence_ids, 512) || item.cabinet_evidence_ids.some((id) => !evidence.has(id))) || profile.host_needs.some((item) => !strings(item.cabinet_evidence_ids, 512) || !strings(item.observation_ids, 64) || item.cabinet_evidence_ids.some((id) => !evidence.has(id)) || item.observation_ids.some((id) => !observationIds.has(id))) || profile.provisions.some((item) => !strings(item.support_ids, 512) || item.support_ids.some((id) => !profileIds.has(id)))) throw new Error("A compatibility profile has broken or foreign nested references.");
    recordsByProfile.set(profile.exhibit_id, profileIds); needsByProfile.set(profile.exhibit_id, new Set(profile.host_needs.map((need) => need.id))); observationsByProfile.set(profile.exhibit_id, observationIds); blockersByProfile.set(profile.exhibit_id, new Set());
  });
  if (seen.size !== exhibits.size) throw new Error("The compatibility sidecar does not cover the exact Exhibit corpus.");
  const EDGE = ["id", "kind", "from_exhibit_id", "to_exhibit_id", "host_need_id", "support_ids", "blocker_ids", "static_assessment", "runtime_assessment", "evidence_level", "checks_performed", "unassessed_dimensions", "rank_factors"]; const edgeIds = new Set(); const counts = new Map();
  sidecar.compatibility_edges.forEach((edge) => {
    const allowedBlockers = new Set([...(blockersByProfile.get(edge?.from_exhibit_id) || []), ...(blockersByProfile.get(edge?.to_exhibit_id) || [])]);
    if (!exact(edge, EDGE) || typeof edge.id !== "string" || edgeIds.has(edge.id) || edge.kind !== "compatibility_observation" || !exhibits.has(edge.from_exhibit_id) || !exhibits.has(edge.to_exhibit_id) || edge.from_exhibit_id === edge.to_exhibit_id || !needsByProfile.get(edge.to_exhibit_id)?.has(edge.host_need_id) || edge.runtime_assessment !== "not_run" || edge.static_assessment !== "matched_observations" || edge.evidence_level !== "observed" || !strings(edge.support_ids, 512) || edge.support_ids.some((id) => !recordsByProfile.get(edge.from_exhibit_id)?.has(id)) || !strings(edge.blocker_ids, 128) || edge.blocker_ids.some((id) => !allowedBlockers.has(id)) || !strings(edge.checks_performed, 16, 80) || !strings(edge.unassessed_dimensions, 16, 80) || !exact(edge.rank_factors, ["matched_dimension_count", "deterministic_points"]) || Object.values(edge.rank_factors).some((value) => !Number.isInteger(value) || value < 0 || value > 10000)) throw new Error("A compatibility observation has broken references, malformed checks, or overstates verification.");
    edgeIds.add(edge.id); const count = (counts.get(edge.host_need_id) || 0) + 1; counts.set(edge.host_need_id, count); if (count > 8) throw new Error("A compatibility Host Need exceeds its bounded donor leads.");
  });
  return sidecar;
}

function loadCompatibility() {
  fetch("/compatibility.json", { cache: "no-store" }).then((response) => {
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) throw new Error(`Compatibility observations returned HTTP ${response.status}.`);
    return response.json();
  }).then((sidecar) => {
    if (!sidecar) { $("compatibility-status").textContent = "No optional compatibility sidecar is mounted. The canonical Affinity graph remains available."; return; }
    workspace.compatibility = validateCompatibilitySidecar(sidecar); initializeGraph(true);
    const hosts = sidecar.profiles.filter((profile) => profile.host_needs?.length).length;
    $("compatibility-status").textContent = `${sidecar.profiles.length} exact-corpus profiles loaded · ${hosts} eligible Hosts · ${sidecar.compatibility_edges.length} static donor observations. Runtime, build, license, behavior, and security remain unverified.`;
    $("summary").textContent = `${workspace.data.exhibits.length} Exhibits · ${workspace.data.affinities.length} directional Affinities · ${sidecar.compatibility_edges.length} static compatibility observations`;
  }).catch((error) => { workspace.compatibility = null; $("compatibility-status").textContent = `Compatibility sidecar rejected: ${error.message} The canonical Affinity graph remains available.`; });
}

function render(data, snapshotSha256) {
  workspace.data = data; workspace.snapshotSha256 = snapshotSha256; workspace.indexes = CabinetCupboard.buildIndexes(data);
  $("summary").textContent = `${data.exhibits.length} Exhibits · ${data.affinities.length} directional Affinities · ${data.resurrection_recipes.length} Resurrection Recipes`;
  $("gallery-search").disabled = false;
  $("limits").textContent = JSON.stringify(data.limits, null, 2); $("fingerprint").textContent = `Cabinet Snapshot: ${data.collection?.project_count || data.exhibits.length} one-commit mojomast GitHub repositories`;
  renderGallery(); renderHosts(); wireControls(); wireGraphControls(); wireCapabilityControls(); initializeGraph(); loadCompatibility(); loadCapabilityMap();
}

function renderLoadError(error) {
  $("summary").textContent = "The Cabinet Snapshot could not be opened.";
  $("gallery-status").textContent = "Nothing was filtered or removed. Reload the page to try opening the complete Cabinet again.";
  $("gallery-grid").setAttribute("aria-busy", "false");
  add(clear($("gallery-grid")), node("p", error.message, "empty"));
  $("host-status").textContent = "Host Exhibits are unavailable because the Cabinet Snapshot did not load.";
  add(clear($("host-options")), node("p", "The Cupboard is unavailable until the complete snapshot loads.", "empty compact"));
}

wireTabs();
fetch("/cabinet.json", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(`The Cabinet returned HTTP ${response.status}.`); const text = await response.text(); return { data: JSON.parse(text), snapshotSha256: await sha256Hex(text) }; }).then(({ data, snapshotSha256 }) => render(data, snapshotSha256)).catch(renderLoadError);
