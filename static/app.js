"use strict";

const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  if (cls) element.className = cls;
  return element;
};
const add = (parent, ...children) => {
  children.forEach((child) => parent.appendChild(child));
  return parent;
};

const SCORE_EXPLANATIONS = {
  unfinishedness: "How much unfinished work was found",
  reusability: "How much reusable structure was found",
};

const COMPONENT_EXPLANATIONS = {
  "unfinished markers": (points) => `Unfinished notes, TODOs, or placeholders added ${points} points.`,
  "missing documentation": (points) => `No project overview was found, adding ${points} points.`,
  "missing tests": (points) => `Source code was found without tests, adding ${points} points.`,
  "recognizable source": (points) => `Recognizable source files contributed ${points} points.`,
  "named fragments": (points) => `Named functions, classes, or modules contributed ${points} points.`,
  "documented intent": (points) => `A project overview made the intent easier to recover, contributing ${points} points.`,
  "tested behavior": (points) => `Existing tests made the project easier to reuse, contributing ${points} points.`,
};

const EVIDENCE_LABELS = {
  "unfinished-marker": "Unfinished note",
  declaration: "Reusable code boundary",
  "missing-documentation": "Missing project overview",
  documentation: "Project overview",
  "missing-tests": "Missing tests",
  tests: "Existing tests",
  languages: "Languages found",
  "git-status": "Uncommitted work",
};

const titleCase = (value) => String(value || "")
  .replace(/^root-\d+:/, "")
  .replace(/[-_]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function componentList(score) {
  const list = node("ul", undefined, "components");
  score.components.forEach((component) => {
    const explain = COMPONENT_EXPLANATIONS[component.name];
    add(list, node("li", explain ? explain(component.points) : `${titleCase(component.name)} contributed ${component.points} points.`));
  });
  return list;
}

function scoreBlock(kind, score, cls) {
  const box = node("section", undefined, `score ${cls || ""}`);
  add(
    box,
    node("strong", `${score.value}/100`),
    node("small", titleCase(kind)),
    node("p", SCORE_EXPLANATIONS[kind], "score-help"),
    componentList(score),
  );
  return box;
}

function evidenceList(exhibit) {
  const wrap = node("div");
  const list = node("ul", undefined, "evidence");
  const visible = exhibit.evidence.slice(0, 48);
  visible.forEach((evidence) => {
    const item = node("li");
    const label = EVIDENCE_LABELS[evidence.kind] || titleCase(evidence.kind);
    add(item, node("strong", label));
    if (evidence.path) {
      add(item, node("span", ` — ${evidence.path}${evidence.line ? `, line ${evidence.line}` : ""}`, "evidence-location"));
    }
    add(item, node("p", evidence.detail));
    add(list, item);
  });
  add(wrap, list);
  if (exhibit.evidence.length > visible.length) {
    add(wrap, node("p", `Showing the first ${visible.length} of ${exhibit.evidence.length} observations.`, "meta"));
  }
  return wrap;
}

function projectFolder(exhibit) {
  return String(exhibit.source_root || exhibit.name).replace(/^root-\d+:/, "").split("/").pop();
}

function plaque(exhibit) {
  const card = node("article", undefined, "plaque");
  add(
    card,
    node("span", "One-commit autonomous GitHub repository", "kicker"),
    node("h3", titleCase(exhibit.name)),
    node("div", `Local project: ${projectFolder(exhibit)}`, "path"),
  );
  if (exhibit.repository?.url) {
    const link = node("a", `github.com/${exhibit.repository.owner}/${exhibit.repository.name}`, "repository-link");
    link.href = exhibit.repository.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    add(card, link, node("div", "Exactly 1 commit", "path"));
  }

  const scores = node("div", undefined, "scores");
  add(
    scores,
    scoreBlock("unfinishedness", exhibit.scores.unfinishedness),
    scoreBlock("reusability", exhibit.scores.reusability, "reuse"),
  );
  add(card, scores);

  const tags = node("div", undefined, "tags");
  Object.keys(exhibit.languages).forEach((language) => add(tags, node("span", titleCase(language), "tag")));
  add(card, tags);
  add(card, node("p", `${exhibit.file_count} readable files and ${exhibit.fragments.length} reusable code boundaries were catalogued.`, "meta"));

  if (exhibit.truncated) {
    const truncation = exhibit.truncation || {};
    add(card, node("p", `This project contained more evidence than the safety limits allow. ${truncation.evidence_omitted || 0} additional observations were intentionally omitted.`, "meta warning"));
  }

  const detail = node("details");
  add(detail, node("summary", `Why the Cabinet scored this project (${exhibit.evidence.length} observations)`), evidenceList(exhibit));
  add(card, detail);
  return card;
}

function recipeRationale(recipe) {
  const text = String(recipe.rationale || "");
  return text
    .replaceAll("implementation answers completion", "Reusable implementation may help complete unfinished work")
    .replaceAll("tests answers tests", "Existing test patterns may help add missing tests")
    .replaceAll("documentation answers documentation", "Existing documentation patterns may help explain the unfinished project");
}

function renderRecipe(recipe, names, index) {
  const card = node("article", undefined, "recipe");
  const body = node("div");
  add(card, node("div", String(index + 1).padStart(2, "0"), "number"));
  add(
    body,
    node("div", `${titleCase(names[recipe.donor_exhibit_id] || "Donor project")} could help ${titleCase(names[recipe.host_exhibit_id] || "unfinished project")}`, "flow"),
    node("h3", titleCase(recipe.title)),
    node("p", recipeRationale(recipe)),
  );

  if (recipe.source_file_provenance?.length) {
    add(body, node("h4", "Files worth studying"));
    const files = node("ul", undefined, "evidence");
    recipe.source_file_provenance.forEach((item) => add(files, node("li", item.path)));
    add(body, files);
  }

  add(body, node("h4", "A careful resurrection plan"));
  const steps = node("ol");
  recipe.steps.forEach((step) => add(steps, node("li", step)));
  add(body, steps, node("p", "This is a suggestion only. The Cabinet did not copy, execute, or change either project.", "meta warning"));
  add(card, body);
  return card;
}

function render(data) {
  $("summary").textContent = `${data.exhibits.length} one-commit GitHub repositories from the previous autonomous build cycle · ${data.resurrection_recipes.length} resurrection ideas`;
  const grid = $("gallery-grid");
  if (!data.exhibits.length) {
    add(grid, node("p", "No historical autonomous projects were found.", "empty"));
  } else {
    data.exhibits.forEach((exhibit) => add(grid, plaque(exhibit)));
  }

  const names = Object.fromEntries(data.exhibits.map((exhibit) => [exhibit.id, exhibit.name]));
  const recipes = $("recipes");
  if (!data.resurrection_recipes.length) {
    add(recipes, node("p", "No sufficiently strong, evidence-supported resurrection idea emerged from this cohort.", "empty"));
  }
  data.resurrection_recipes.forEach((recipe, index) => add(recipes, renderRecipe(recipe, names, index)));

  $("limits").textContent = JSON.stringify(data.limits, null, 2);
  $("fingerprint").textContent = `Dataset: ${data.collection?.project_count || data.exhibits.length} mojomast GitHub repositories · exactly one commit each`;
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((candidate) => {
    candidate.classList.toggle("active", candidate === tab);
    candidate.setAttribute("aria-selected", String(candidate === tab));
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("hidden", view.id !== tab.dataset.view));
}));

fetch("/cabinet.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`The Cabinet returned HTTP ${response.status}.`);
    return response.json();
  })
  .then(render)
  .catch((error) => {
    $("summary").textContent = "The historical collection could not be opened.";
    add($("gallery-grid"), node("p", error.message, "empty"));
  });
