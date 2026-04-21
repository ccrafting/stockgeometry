(function attachRankingList(globalObj) {
  "use strict";

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function toRows(rows, maxRows) {
    if (!Array.isArray(rows)) {
      return [];
    }
    const out = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const channel = String(row.channel || "").trim();
      const value = Number(row.value);
      if (!channel || !Number.isFinite(value) || value <= 0) {
        continue;
      }
      out.push({
        channel,
        value,
        rank: Number.isFinite(Number(row.rank)) ? Number(row.rank) : out.length + 1,
      });
      if (out.length >= maxRows) {
        break;
      }
    }
    return out;
  }

  function renderRankingList(root, options) {
    if (!root) {
      return;
    }
    const cfg = options || {};
    const rows = toRows(cfg.rows, Number.isFinite(cfg.maxRows) ? Number(cfg.maxRows) : 4);
    const title = String(cfg.title || "Rankings");
    const emptyText = String(cfg.emptyText || "No meaningful contributors at this timestamp.");
    const dominant = String(cfg.dominantChannel || "").trim();
    clearNode(root);

    const block = document.createElement("section");
    block.className = "pf-legend-block";
    const heading = document.createElement("h3");
    heading.className = "pf-legend-block-title";
    heading.textContent = title;
    block.appendChild(heading);

    const list = document.createElement("ol");
    list.className = "pf-ranking-list";
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "pf-ranking-empty";
      empty.textContent = emptyText;
      block.appendChild(empty);
      root.appendChild(block);
      return;
    }

    const maxValue = Math.max(...rows.map((row) => row.value), 1e-9);
    for (const row of rows) {
      const item = document.createElement("li");
      item.className = "pf-ranking-item";

      const left = document.createElement("div");
      left.className = "pf-ranking-left";
      const rank = document.createElement("span");
      rank.className = "pf-ranking-rank";
      rank.textContent = `${row.rank}.`;
      left.appendChild(rank);
      const label = document.createElement("span");
      label.className = "pf-ranking-label";
      label.textContent = row.channel;
      if (dominant && row.channel === dominant) {
        label.classList.add("is-dominant");
      }
      left.appendChild(label);

      const right = document.createElement("div");
      right.className = "pf-ranking-right";
      const value = document.createElement("span");
      value.className = "pf-ranking-value";
      value.textContent = row.value.toFixed(3);
      right.appendChild(value);
      const bar = document.createElement("span");
      bar.className = "pf-ranking-bar";
      const fill = document.createElement("span");
      fill.className = "pf-ranking-bar-fill";
      fill.style.width = `${Math.max(8, Math.round((row.value / maxValue) * 100))}%`;
      bar.appendChild(fill);
      right.appendChild(bar);

      item.appendChild(left);
      item.appendChild(right);
      list.appendChild(item);
    }
    block.appendChild(list);
    root.appendChild(block);
  }

  globalObj.renderRankingList = renderRankingList;
})(typeof window !== "undefined" ? window : globalThis);

