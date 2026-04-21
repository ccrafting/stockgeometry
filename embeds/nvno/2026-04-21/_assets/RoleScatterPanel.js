(function attachRoleScatterPanel(globalObj) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MARKET_TZ = "America/New_York";
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
    const raw = toDisplay(label);
    if (!raw) {
      return "";
    }
    if (typeof globalObj.publicShortChannelLabel === "function") {
      return globalObj.publicShortChannelLabel(entry, raw);
    }
    return raw;
  }

  function parseTime(ts) {
    const dt = new Date(ts);
    if (Number.isNaN(dt.getTime())) {
      return null;
    }
    return dt;
  }

  function formatTimestamp(ts) {
    const dt = parseTime(ts);
    if (!dt) {
      return "n/a";
    }
    try {
      return `${DATE_TIME_FORMATTER.format(dt).replace(",", "")} ET`;
    } catch (err) {
      return dt.toISOString();
    }
  }

  function renderRoleScatterPanel(root, model, options) {
    if (!root) {
      return;
    }
    const cfg = options || {};
    clearNode(root);
    root.classList.add("pf-scatter-root");
    root.style.position = "relative";

    const roleMap = model && typeof model.channel_roles_by_ts === "object" ? model.channel_roles_by_ts : {};
    const series = Array.isArray(model && model.series) ? model.series : [];
    const latest = series.length > 0 ? series[series.length - 1] : null;
    const latestTs = latest ? toDisplay(latest.ts) : "";
    const channels = latestTs && roleMap[latestTs] && typeof roleMap[latestTs] === "object" ? roleMap[latestTs] : null;
    if (!channels) {
      const empty = document.createElement("div");
      empty.className = "pf-empty";
      empty.textContent = "Scatter preview unavailable for this session.";
      root.appendChild(empty);
      return;
    }

    const objectId = toDisplay(model && model.object_id);
    const semanticType = toDisplay(model && model.object_semantic_type);
    const entry =
      typeof globalObj.getSemanticEntry === "function"
        ? globalObj.getSemanticEntry(objectId, semanticType)
        : null;

    const points = [];
    for (const [channel, raw] of Object.entries(channels)) {
      const value = Number(raw);
      if (!isFiniteNum(value)) {
        continue;
      }
      const support = value < 0 ? Math.abs(value) : 0;
      const pressure = value > 0 ? value : 0;
      points.push({
        channel,
        short: shortLabel(entry, channel),
        support,
        pressure,
        weight: Math.abs(value),
      });
    }
    if (points.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pf-empty";
      empty.textContent = "No channel values available for scatter projection.";
      root.appendChild(empty);
      return;
    }

    const width = Math.max(320, root.clientWidth || 920);
    const height = Math.max(220, Number.isFinite(cfg.height) ? Number(cfg.height) : 280);
    const margin = { top: 18, right: 18, bottom: 36, left: 48 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    let xMax = 0;
    let yMax = 0;
    let wMax = 0;
    for (const point of points) {
      xMax = Math.max(xMax, point.pressure);
      yMax = Math.max(yMax, point.support);
      wMax = Math.max(wMax, point.weight);
    }
    xMax = xMax > 0 ? xMax : 1;
    yMax = yMax > 0 ? yMax : 1;
    wMax = wMax > 0 ? wMax : 1;

    function xScale(value) {
      return margin.left + (value / xMax) * innerWidth;
    }

    function yScale(value) {
      return margin.top + innerHeight - (value / yMax) * innerHeight;
    }

    function rScale(value) {
      return 3 + (value / wMax) * 7;
    }

    const svg = createSvgEl("svg", {
      class: "pf-scatter-svg",
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: "xMidYMid meet",
    });
    root.appendChild(svg);

    const tip = document.createElement("div");
    tip.className = "pf-tooltip";
    tip.style.position = "absolute";
    tip.style.pointerEvents = "none";
    tip.style.opacity = "0";
    root.appendChild(tip);

    function showTip(point, clientX, clientY) {
      clearNode(tip);
      const rows = [
        { key: "Time", value: formatTimestamp(latestTs) },
        { key: "Channel", value: point.channel },
        { key: "Support magnitude", value: point.support.toFixed(3) },
        { key: "Pressure magnitude", value: point.pressure.toFixed(3) },
      ];
      for (const item of rows) {
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

    const plotBg = createSvgEl("rect", {
      x: margin.left,
      y: margin.top,
      width: innerWidth,
      height: innerHeight,
      class: "pf-scatter-bg",
    });
    svg.appendChild(plotBg);

    const axisX = createSvgEl("line", {
      x1: margin.left,
      x2: margin.left + innerWidth,
      y1: margin.top + innerHeight,
      y2: margin.top + innerHeight,
      class: "pf-scatter-axis",
    });
    const axisY = createSvgEl("line", {
      x1: margin.left,
      x2: margin.left,
      y1: margin.top,
      y2: margin.top + innerHeight,
      class: "pf-scatter-axis",
    });
    svg.appendChild(axisX);
    svg.appendChild(axisY);

    const xLabel = createSvgEl("text", {
      class: "pf-scatter-axis-label",
      x: margin.left + innerWidth,
      y: margin.top + innerHeight + 26,
      "text-anchor": "end",
    });
    xLabel.textContent = "Pressure magnitude";
    svg.appendChild(xLabel);

    const yLabel = createSvgEl("text", {
      class: "pf-scatter-axis-label",
      x: margin.left - 34,
      y: margin.top + 10,
      transform: `rotate(-90 ${margin.left - 34} ${margin.top + 10})`,
      "text-anchor": "end",
    });
    yLabel.textContent = "Support magnitude";
    svg.appendChild(yLabel);

    for (const point of points) {
      const cx = xScale(point.pressure);
      const cy = yScale(point.support);
      const circle = createSvgEl("circle", {
        cx,
        cy,
        r: rScale(point.weight),
        class: "pf-scatter-point",
      });
      circle.addEventListener("mouseenter", function onEnter(evt) {
        showTip(point, evt.clientX, evt.clientY);
      });
      circle.addEventListener("mousemove", function onMove(evt) {
        showTip(point, evt.clientX, evt.clientY);
      });
      circle.addEventListener("mouseleave", hideTip);
      svg.appendChild(circle);

      const label = createSvgEl("text", {
        class: "pf-scatter-point-label",
        x: cx + 6,
        y: cy - 6,
        "text-anchor": "start",
      });
      label.textContent = point.short || point.channel;
      svg.appendChild(label);
    }
  }

  globalObj.renderRoleScatterPanel = renderRoleScatterPanel;
})(typeof window !== "undefined" ? window : globalThis);
