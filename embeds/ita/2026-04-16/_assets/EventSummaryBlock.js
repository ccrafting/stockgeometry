(function attachEventSummaryBlock(globalObj) {
  "use strict";

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function renderEventSummaryBlock(root, eventItem, options) {
    if (!root) {
      return;
    }
    clearNode(root);
    const cfg = options || {};
    const titleText = String(cfg.title || "Latest change");
    const emptyText = String(cfg.emptyText || "No recent structural change in this window.");

    const block = document.createElement("section");
    block.className = "pf-legend-block";
    const heading = document.createElement("h3");
    heading.className = "pf-legend-block-title";
    heading.textContent = titleText;
    block.appendChild(heading);

    if (!eventItem || typeof eventItem !== "object") {
      const empty = document.createElement("p");
      empty.className = "pf-event-empty";
      empty.textContent = emptyText;
      block.appendChild(empty);
      root.appendChild(block);
      return;
    }

    const label = String(eventItem.label || eventItem.short_label || "").trim();
    const sig = Number(eventItem.significance);
    const row = document.createElement("div");
    row.className = "pf-event-row";
    const eventLabel = document.createElement("p");
    eventLabel.className = "pf-event-label";
    eventLabel.textContent = label || "Structural event";
    row.appendChild(eventLabel);
    if (Number.isFinite(sig)) {
      const score = document.createElement("p");
      score.className = "pf-event-score";
      score.textContent = `Significance ${Math.round(sig * 100)}%`;
      row.appendChild(score);
    }
    block.appendChild(row);
    root.appendChild(block);
  }

  globalObj.renderEventSummaryBlock = renderEventSummaryBlock;
})(typeof window !== "undefined" ? window : globalThis);

