"use strict";

/* Deterministic, snapshot-only recombination engine. No source project is reopened. */
(function expose(factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.CabinetCupboard = api;
})(function cupboardEngine() {
  const GENERIC = new Set(["todo", "fixme", "pass", "test", "tests", "main", "src", "lib", "implementation", "complete", "completion", "project"]);

  function tokens(value) {
    const expanded = String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return new Set((expanded.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || []).filter((word) => !GENERIC.has(word)));
  }

  function intersection(left, right) {
    return [...left].filter((item) => right.has(item));
  }

  function codeLanguages(exhibit) {
    return new Set(Object.keys(exhibit.languages || {}).filter((language) => !["markdown", "html", "css"].includes(language)));
  }

  function buildIndexes(data) {
    const exhibits = new Map(data.exhibits.map((exhibit) => [exhibit.id, exhibit]));
    const evidence = new Map();
    const fragmentsByEvidence = new Map();
    const affinitiesByHost = new Map();
    data.exhibits.forEach((exhibit) => {
      evidence.set(exhibit.id, new Map(exhibit.evidence.map((item) => [item.id, item])));
      exhibit.fragments.forEach((fragment) => fragment.evidence_ids.forEach((id) => fragmentsByEvidence.set(id, fragment)));
    });
    data.affinities.forEach((affinity) => {
      const list = affinitiesByHost.get(affinity.to_exhibit_id) || [];
      list.push(affinity);
      affinitiesByHost.set(affinity.to_exhibit_id, list);
    });
    return { exhibits, evidence, fragmentsByEvidence, affinitiesByHost };
  }

  function detectedGoals(host) {
    return [...new Set((host.needs || []).map((need) => need.kind))].sort();
  }

  function candidateKey(candidate) {
    return [candidate.donorId, candidate.goal, candidate.sourceEvidenceId || candidate.path || candidate.label].join("|");
  }

  function makeCandidate({ data, indexes, host, donor, goal, hostEvidenceId, sourceEvidenceId, affinity, userDirected, focusTerms, preferred }) {
    const donorEvidence = indexes.evidence.get(donor.id).get(sourceEvidenceId);
    const hostEvidence = hostEvidenceId ? indexes.evidence.get(host.id).get(hostEvidenceId) : null;
    const fragment = indexes.fragmentsByEvidence.get(sourceEvidenceId) || null;
    const hostLanguages = codeLanguages(host);
    const donorLanguages = codeLanguages(donor);
    const sharedLanguages = intersection(hostLanguages, donorLanguages).sort();
    const hostWords = tokens(`${hostEvidence?.detail || ""} ${hostEvidence?.path || ""}`);
    const donorWords = tokens(`${donorEvidence?.detail || ""} ${donorEvidence?.path || ""} ${fragment?.name || ""}`);
    const sharedTerms = intersection(hostWords, donorWords).sort();
    const focusMatches = intersection(tokens(focusTerms.join(" ")), donorWords).sort();
    const factors = [];
    if (affinity) factors.push("Existing directional evidence match");
    if (sharedLanguages.length) factors.push(`Shared language: ${sharedLanguages.join(", ")}`);
    if (sharedTerms.length) factors.push(`Shared terms: ${sharedTerms.slice(0, 4).join(", ")}`);
    if (focusMatches.length) factors.push(`Matches your focus: ${focusMatches.slice(0, 4).join(", ")}`);
    if (goal === "tests") factors.push("Donor contains an existing test pattern");
    if (goal === "documentation") factors.push("Donor contains project documentation");

    const cautions = ["Only bounded snapshot evidence was inspected; build and API compatibility were not verified."];
    if (userDirected) cautions.push("This direction was added by you rather than detected as a host need.");
    if (host.truncated || donor.truncated) cautions.push("Some evidence was omitted by scanner safety limits.");
    if (!sharedLanguages.length && goal !== "documentation") cautions.push("No shared code language was observed.");
    if (!affinity && goal === "completion") cautions.push("No precomputed directional affinity supports this piece.");
    if (fragment) cautions.push("The available code boundary is a shallow declaration preview, not deep semantic analysis.");

    let risk = 0;
    if (host.truncated || donor.truncated) risk += 1;
    if (!sharedLanguages.length && goal !== "documentation") risk += 2;
    if (!affinity && goal === "completion") risk += 1;
    risk = Math.min(2, risk);

    let score = affinity ? 80 : (goal === "tests" ? 55 : 40);
    score += sharedLanguages.length ? 18 : 0;
    score += sharedTerms.length * 9;
    score += focusMatches.length * 14;
    score += preferred ? 24 : 0;

    const label = fragment?.name || donorEvidence?.path || (goal === "tests" ? "Test pattern" : "Documentation pattern");
    const path = donorEvidence?.path || fragment?.path || null;
    const action = goal === "tests"
      ? "Use this test structure as a validation pattern; adapt assertions and fixtures to the host behavior."
      : goal === "documentation"
        ? "Study this documentation structure and adapt only the sections that clarify the selected host direction."
        : sharedLanguages.length
          ? "Study this declaration boundary and adapt the smallest relevant behavior inside the host project."
          : "Use this as a design reference only; a deliberate port would be required.";

    const candidate = {
      hostId: host.id, donorId: donor.id, goal, hostEvidenceId, sourceEvidenceId,
      affinityId: affinity?.id || null, label, path, line: donorEvidence?.line || fragment?.line_start || null,
      preview: fragment?.preview || donorEvidence?.detail || "Evidence-backed project pattern",
      sharedLanguages, sharedTerms, focusMatches, factors, cautions, risk, score, action,
      userDirected: Boolean(userDirected), preferred: Boolean(preferred),
    };
    candidate.key = candidateKey(candidate);
    return candidate;
  }

  function buildCandidates(data, indexes, config) {
    const host = indexes.exhibits.get(config.hostId);
    if (!host) return [];
    const selectedGoals = new Set(config.goals || []);
    const detected = new Set(detectedGoals(host));
    const excluded = new Set(config.excludedDonors || []);
    const preferred = new Set(config.preferredDonors || []);
    const only = new Set(config.onlyDonors || []);
    const result = [];
    const seen = new Set();

    function accept(candidate) {
      if (excluded.has(candidate.donorId) || (only.size && !only.has(candidate.donorId))) return;
      const supported = Boolean(candidate.affinityId) || (candidate.goal === "tests" && candidate.sharedLanguages.length);
      if (config.compatibility === 0 && !supported) return;
      if (config.compatibility === 1 && !supported && !candidate.sharedLanguages.length) return;
      if (candidate.risk > config.riskTolerance) return;
      if (seen.has(candidate.key)) return;
      seen.add(candidate.key);
      const overlap = candidate.sharedTerms.length + candidate.focusMatches.length;
      if (config.novelty === 0) candidate.score += overlap * 5;
      if (config.novelty === 2) candidate.score += Math.max(0, 4 - overlap) * 5;
      result.push(candidate);
    }

    (indexes.affinitiesByHost.get(host.id) || []).forEach((affinity) => {
      const donor = indexes.exhibits.get(affinity.from_exhibit_id);
      affinity.matches.forEach((match) => {
        if (!selectedGoals.has(match.need)) return;
        match.source_evidence_ids.forEach((sourceId) => accept(makeCandidate({
          data, indexes, host, donor, goal: match.need,
          hostEvidenceId: match.target_evidence_ids[0], sourceEvidenceId: sourceId, affinity,
          userDirected: !detected.has(match.need), focusTerms: config.focusTerms || [], preferred: preferred.has(donor.id),
        })));
      });
    });

    if (selectedGoals.has("tests")) {
      data.exhibits.forEach((donor) => {
        if (donor.id === host.id) return;
        const provision = donor.provisions.find((item) => item.kind === "tests");
        if (!provision) return;
        provision.evidence_ids.slice(0, 1).forEach((sourceId) => accept(makeCandidate({
          data, indexes, host, donor, goal: "tests", hostEvidenceId: null, sourceEvidenceId: sourceId,
          affinity: null, userDirected: !detected.has("tests"), focusTerms: config.focusTerms || [], preferred: preferred.has(donor.id),
        })));
      });
    }

    if (selectedGoals.has("documentation")) {
      data.exhibits.forEach((donor) => {
        if (donor.id === host.id) return;
        const provision = donor.provisions.find((item) => item.kind === "documentation");
        if (!provision) return;
        provision.evidence_ids.slice(0, 1).forEach((sourceId) => accept(makeCandidate({
          data, indexes, host, donor, goal: "documentation", hostEvidenceId: null, sourceEvidenceId: sourceId,
          affinity: null, userDirected: !detected.has("documentation"), focusTerms: config.focusTerms || [], preferred: preferred.has(donor.id),
        })));
      });
    }

    return result.sort((a, b) => b.score - a.score || a.risk - b.risk || a.donorId.localeCompare(b.donorId) || a.key.localeCompare(b.key));
  }

  function assembleVariant(candidates, config, lockedKeys = [], offset = 0, forcedKeys = null) {
    const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
    const selected = [];
    const selectedKeys = new Set();
    const donors = new Set();
    const maxDonors = Math.max(1, Number(config.breadth || 1));
    const maxPieces = Math.min(8, maxDonors + 2);
    const locks = forcedKeys || lockedKeys;

    locks.forEach((key) => {
      const item = byKey.get(key);
      if (item && !selectedKeys.has(key)) {
        selected.push(item); selectedKeys.add(key); donors.add(item.donorId);
      }
    });

    const goals = [...new Set(config.goals || [])].sort();
    goals.forEach((goal, goalIndex) => {
      if (selected.some((item) => item.goal === goal)) return;
      const pool = candidates.filter((item) => item.goal === goal && !selectedKeys.has(item.key));
      if (!pool.length) return;
      const start = (offset + goalIndex) % pool.length;
      const ordered = pool.slice(start).concat(pool.slice(0, start));
      const item = ordered.find((candidate) => donors.has(candidate.donorId) || donors.size < maxDonors);
      if (item && selected.length < maxPieces) {
        selected.push(item); selectedKeys.add(item.key); donors.add(item.donorId);
      }
    });

    const rotated = candidates.length ? candidates.slice(offset % candidates.length).concat(candidates.slice(0, offset % candidates.length)) : [];
    for (const item of rotated) {
      if (selected.length >= maxPieces) break;
      if (selectedKeys.has(item.key)) continue;
      if (!donors.has(item.donorId) && donors.size >= maxDonors) continue;
      selected.push(item); selectedKeys.add(item.key); donors.add(item.donorId);
    }

    const covered = new Set(selected.map((item) => item.goal));
    return {
      pieces: selected,
      coveredGoals: goals.filter((goal) => covered.has(goal)),
      unresolvedGoals: goals.filter((goal) => !covered.has(goal)),
      donorIds: [...donors].sort(),
      risk: selected.reduce((maximum, item) => Math.max(maximum, item.risk), 0),
      score: selected.reduce((total, item) => total + item.score, 0),
    };
  }

  return { tokens, buildIndexes, detectedGoals, buildCandidates, assembleVariant, candidateKey };
});
