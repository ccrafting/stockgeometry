(function attachRoleHeatmapPanel(globalObj) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MARKET_TZ = "America/New_York";
  const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  function isFiniteNum(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function toDisplay(value) {
    return value == null ? "" : String(value).trim();
  }

  function parseTime(ts) {
    const dt = new Date(ts);
    if (Number.isNaN(dt.getTime())) {
      return null;
    }
    return dt;
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function createSvgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs && typeof attrs === "object") {
      for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, String(value));
      }
    }
    return node;
  }

  function shortLabel(entry, label) {
    if (!label) {
      return "";
    }
    if (typeof globalObj.publicShortChannelLabel === "function") {
      return globalObj.publicShortChannelLabel(entry, label);
    }
    return String(label);
  }

  function formatTick(date) {
    try {
      return TIME_FORMATTER.format(date);
    } catch (err) {
      return date.toISOString().slice(11, 16);
    }
  }

  function formatTimestamp(date) {
    try {
      return `${DATE_TIME_FORMATTER.format(date).replace(",", "")} ET`;
    } catch (err) {
      return date.toISOString();
    }
  }

  function roleFromValue(value) {
    if (!isFiniteNum(value)) {
      return "n/a";
    }
    if (value < 0) {
      return "support";
    }
    if (value > 0) {
      return "pressure";
    }
    return "neutral";
  }

  function colorForValue(value, maxAbs) {
    if (!isFiniteNum(value)) {
      return "rgba(88, 104, 130, 0.14)";
    }
    const scale = maxAbs > 1e-9 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
    if (value < 0) {
      return `rgba(79, 201, 149, ${0.16 + 0.58 * scale})`;
    }
    if (value > 0) {
      return `rgba(234, 127, 127, ${0.16 + 0.58 * scale})`;
    }
    return "rgba(136, 154, 182, 0.18)";
  }

  function renderRoleHeatmapPanel(root, model, options) {
    if (!root) {
      return;
    }
    const cfg = options || {};
    clearNode(root);
    root.classList.add("pf-heatmap-root");
    root.style.position = "relative";

    const series = Array.isArray(model && model.series) ? model.series : [];
    const roleMap = model && typeof model.channel_roles_by_ts === "object" ? model.channel_roles_by_ts : {};
    const objectMetadata = model && typeof model.object_metadata === "object" ? model.object_metadata : {};
    const objectId = toDisplay(model && model.object_id);
    const semanticType = toDisplay(model && model.object_semantic_type);
    const entry =
      typeof globalObj.getSemanticEntry === "function"
        ? globalObj.getSemanticEntry(objectId, semanticType)
        : null;

    const timeline = [];
    for (const row of series) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const ts = toDisplay(row.ts);
      const dt = parseTime(ts);
      if (!ts || !dt) {
        continue;
      }
      timeline.push({ ts, dt });
    }

    if (timeline.length === 0 || !roleMap || Object.keys(roleMap).length === 0) {
      const empty = document.createElement("div");
      empty.className = "pf-empty";
      empty.textContent = "Heat map unavailable for this session.";
      root.appendChild(empty);
      return;
    }

    let channels = [];
    const fromMetadata = Array.isArray(objectMetadata.channel_labels)
      ? objectMetadata.channel_labels.map((label) => toDisplay(label)).filter(Boolean)
      : [];
    if (fromMetadata.length > 0) {
      channels = fromMetadata;
    } else {
      const keyset = new Set();
      for (const tsItem of timeline) {
        const row = roleMap[tsItem.ts];
        if (!row || typeof row !== "object") {
          continue;
        }
        for (const key of Object.keys(row)) {
          if (toDisplay(key)) {
            keyset.add(toDisplay(key));
          }
        }
      }
      channels = Array.from(keyset);
    }

    if (channels.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pf-empty";
      empty.textContent = "No channel-role values were found.";
      root.appendChild(empty);
      return;
    }

    let maxAbs = 0;
    for (const tsItem of timeline) {
      const row = roleMap[tsItem.ts];
      if (!row || typeof row !== "object") {
        continue;
      }
      for (const channel of channels) {
        const value = Number(row[channel]);
        if (isFiniteNum(value)) {
          maxAbs = Math.max(maxAbs, Math.abs(value));
        }
      }
    }
    if (maxAbs <= 1e-9) {
      maxAbs = 1;
    }

    const hostWidth = Math.max(360, root.clientWidth || 920);
    const leftPad = 132;
    const topPad = 20;
    const bottomPad = 34;
    const rightPad = 12;
    const cellHeight = Math.max(18, Number.isFinite(cfg.cellHeight) ? Number(cfg.cellHeight) : 24);
    const innerAvailable = Math.max(220, hostWidth - leftPad - rightPad);
    const autoCellWidth = Math.floor(innerAvailable / Math.max(1, timeline.length));
    const cellWidth = Math.max(14, Math.min(34, autoCellWidth));
    const heatmapWidth = timeline.length * cellWidth;
    const svgWidth = leftPad + heatmapWidth + rightPad;
    const svgHeight = topPad + channels.length * cellHeight + bottomPad;

    const scrollWrap = document.createElement("div");
    scrollWrap.className = "pf-heatmap-scroll";
    root.appendChild(scrollWrap);

    const svg = createSvgEl("svg", {
      class: "pf-heatmap-svg",
      width: svgWidth,
      height: svgHeight,
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      preserveAspectRatio: "xMinYMin meet",
    });
    scrollWrap.appendChild(svg);

    const tip = document.createElement("div");
    tip.className = "pf-tooltip";
    tip.style.position = "absolute";
    tip.style.pointerEvents = "none";
    tip.style.opacity = "0";
    root.appendChild(tip);

    function showTip(items, clientX, clientY) {
      clearNode(tip);
      for (const item of items) {
        const row = document.createElement("div");
        row.className = "pf-tip-row";
        const key = document.createElement("span");
        key.className = "pf-tip-key";
        key.textContent = item.key;
        const val = document.createElement("span");
        val.className = "pf-tip-val";
        val.textContent = item.value;
        row.appendChild(key);
        row.appendChild(val);
        tip.appendChild(row);
      }
      tip.style.opacity = "1";
      const rootRect = root.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      let left = clientX - rootRect.left + 10;
      let top = clientY - rootRect.top + 10;
      if (left + tipRect.width > rootRect.width - 8) {
        left = clientX - rootRect.left - tipRect.width - 10;
      }
      if (top + tipRect.height > rootRect.height - 8) {
        top = clientY - rootRect.top - tipRect.height - 10;
      }
      tip.style.left = `${Math.max(6, left)}px`;
      tip.style.top = `${Math.max(6, top)}px`;
    }

    function hideTip() {
      tip.style.opacity = "0";
    }

    for (let rowIdx = 0; rowIdx < channels.length; rowIdx++) {
      const channel = channels[rowIdx];
      const y = topPad + rowIdx * cellHeight;
      const fullLabel = toDisplay(channel);
      const short = shortLabel(entry, fullLabel);
      const label = createSvgEl("text", {
        class: "pf-heatmap-label",
        x: leftPad - 8,
        y: y + cellHeight * 0.66,
        "text-anchor": "end",
      });
      label.textContent = short;
      if (short !== fullLabel && fullLabel) {
        const title = document.createElementNS(SVG_NS, "title");
        title.textContent = fullLabel;
        label.appendChild(title);
      }
      svg.appendChild(label);

      for (let colIdx = 0; colIdx < timeline.length; colIdx++) {
        const tsItem = timeline[colIdx];
        const row = roleMap[tsItem.ts];
        const raw = row && typeof row === "object" ? Number(row[channel]) : NaN;
        const value = isFiniteNum(raw) ? raw : null;
        const x = leftPad + colIdx * cellWidth;
        const rect = createSvgEl("rect", {
          class: "pf-heatmap-cell",
          x: x + 0.6,
          y: y + 0.6,
          width: Math.max(1, cellWidth - 1.2),
          height: Math.max(1, cellHeight - 1.2),
          rx: 2,
          ry: 2,
          fill: colorForValue(value, maxAbs),
          stroke: "rgba(24, 35, 52, 0.35)",
          "stroke-width": 0.6,
        });
        rect.addEventListener("mouseenter", function onEnter(evt) {
          showTip(
            [
              { key: "Time", value: formatTimestamp(tsItem.dt) },
              { key: "Channel", value: fullLabel || short },
              { key: "Role", value: roleFromValue(value) },
              { key: "Value", value: isFiniteNum(value) ? value.toFixed(3) : "n/a" },
            ],
            evt.clientX,
            evt.clientY
          );
        });
        rect.addEventListener("mousemove", function onMove(evt) {
          showTip(
            [
              { key: "Time", value: formatTimestamp(tsItem.dt) },
              { key: "Channel", value: fullLabel || short },
              { key: "Role", value: roleFromValue(value) },
              { key: "Value", value: isFiniteNum(value) ? value.toFixed(3) : "n/a" },
            ],
            evt.clientX,
            evt.clientY
          );
        });
        rect.addEventListener("mouseleave", hideTip);
        svg.appendChild(rect);
      }
    }

    const tickStep = Math.max(1, Math.ceil(timeline.length / 8));
    for (let i = 0; i < timeline.length; i += tickStep) {
      const tsItem = timeline[i];
      const x = leftPad + i * cellWidth + Math.floor(cellWidth / 2);
      const tick = createSvgEl("text", {
        class: "pf-heatmap-time",
        x,
        y: topPad + channels.length * cellHeight + 16,
        "text-anchor": "middle",
      });
      tick.textContent = formatTick(tsItem.dt);
      svg.appendChild(tick);
    }

    const legendY = topPad - 8;
    const supportLegend = createSvgEl("text", {
      class: "pf-heatmap-legend pf-heatmap-legend-support",
      x: leftPad + 2,
      y: legendY,
      "text-anchor": "start",
    });
    supportLegend.textContent = "Support";
    svg.appendChild(supportLegend);

    const pressureLegend = createSvgEl("text", {
      class: "pf-heatmap-legend pf-heatmap-legend-pressure",
      x: leftPad + heatmapWidth - 2,
      y: legendY,
      "text-anchor": "end",
    });
    pressureLegend.textContent = "Pressure";
    svg.appendChild(pressureLegend);
  }

  globalObj.renderRoleHeatmapPanel = renderRoleHeatmapPanel;
})(typeof window !== "undefined" ? window : globalThis);
