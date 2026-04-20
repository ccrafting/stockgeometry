(function attachPriceFirstStructuralChart(globalObj) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MARKET_TZ = "America/New_York";
  const AXIS_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const TOOLTIP_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const TOOLTIP_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  function isFiniteNum(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function parseTime(ts) {
    const dt = new Date(ts);
    if (Number.isNaN(dt.getTime())) {
      return null;
    }
    return dt;
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function fmtPrice(value, valueKind) {
    if (!isFiniteNum(value)) {
      return "n/a";
    }
    if (valueKind === "price") {
      return `$${value.toFixed(2)}`;
    }
    return value.toFixed(4);
  }

  function fmtMetric(value) {
    if (!isFiniteNum(value)) {
      return "n/a";
    }
    return value.toFixed(3);
  }

  function formatMarketTickTime(date) {
    try {
      return AXIS_TIME_FORMATTER.format(date);
    } catch (err) {
      return date.toISOString().slice(11, 16);
    }
  }

  function formatMarketTimestamp(date) {
    try {
      const datePart = TOOLTIP_DATE_FORMATTER.format(date).replace(/\//g, "-");
      const timePart = TOOLTIP_TIME_FORMATTER.format(date);
      return `${datePart} ${timePart} ET`;
    } catch (err) {
      return date.toISOString();
    }
  }

  function regimeName(regime) {
    if (regime === "support_led") {
      return "Support-led";
    }
    if (regime === "pressure_led") {
      return "Pressure-led";
    }
    if (regime === "mixed_rotating") {
      return "Mixed / rotating";
    }
    return "Unknown";
  }

  function extent(values) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (!isFiniteNum(v)) {
        continue;
      }
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!isFiniteNum(min) || !isFiniteNum(max)) {
      return [0, 1];
    }
    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.15);
      return [min - pad, max + pad];
    }
    return [min, max];
  }

  function makeLinearScale(domainMin, domainMax, rangeMin, rangeMax) {
    const den = domainMax - domainMin;
    if (Math.abs(den) < 1e-12) {
      return function constantScale() {
        return (rangeMin + rangeMax) / 2;
      };
    }
    const m = (rangeMax - rangeMin) / den;
    return function linearScale(v) {
      return rangeMin + (v - domainMin) * m;
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createSvgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, String(v));
      }
    }
    return node;
  }

  function appendText(parent, attrs, value) {
    const node = createSvgEl("text", attrs);
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }

  function pointsToPolyline(series, xFn, yFn, key) {
    const pts = [];
    for (const row of series) {
      const yValue = row[key];
      if (!isFiniteNum(yValue)) {
        continue;
      }
      const x = xFn(row._tm);
      const y = yFn(yValue);
      if (isFiniteNum(x) && isFiniteNum(y)) {
        pts.push(`${x},${y}`);
      }
    }
    return pts.join(" ");
  }

  function nearestIndexByTime(series, targetMs) {
    let lo = 0;
    let hi = series.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (series[mid]._tm < targetMs) lo = mid + 1;
      else hi = mid;
    }
    if (lo <= 0) return 0;
    const prev = series[lo - 1];
    const curr = series[lo];
    if (!curr) return lo - 1;
    return Math.abs(curr._tm - targetMs) < Math.abs(prev._tm - targetMs) ? lo : lo - 1;
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function makeTooltip(container) {
    const tip = document.createElement("div");
    tip.className = "pf-tooltip";
    tip.style.position = "absolute";
    tip.style.pointerEvents = "none";
    tip.style.opacity = "0";
    tip.setAttribute("role", "dialog");
    tip.setAttribute("aria-live", "polite");
    container.appendChild(tip);

    function setRows(rows) {
      clearNode(tip);
      for (const row of rows) {
        const rowNode = document.createElement("div");
        rowNode.className = "pf-tip-row";
        const key = document.createElement("span");
        key.className = "pf-tip-key";
        key.textContent = row.key;
        const value = document.createElement("span");
        value.className = "pf-tip-val";
        value.textContent = row.value;
        rowNode.appendChild(key);
        rowNode.appendChild(value);
        tip.appendChild(rowNode);
      }
      tip.style.opacity = "1";
    }

    function move(px, py) {
      const margin = 12;
      const rootRect = container.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      let left = px + margin;
      let top = py + margin;
      if (left + tipRect.width > rootRect.width - 6) {
        left = px - tipRect.width - margin;
      }
      if (top + tipRect.height > rootRect.height - 6) {
        top = py - tipRect.height - margin;
      }
      tip.style.left = `${Math.max(6, left)}px`;
      tip.style.top = `${Math.max(6, top)}px`;
    }

    function hide() {
      tip.style.opacity = "0";
    }

    return { setRows, move, hide };
  }

  function drawXAxis(group, width, yPos, ticks, formatTick) {
    const axis = createSvgEl("g", { class: "pf-axis pf-axis-x", transform: `translate(0,${yPos})` });
    const line = createSvgEl("line", {
      x1: 0,
      x2: width,
      y1: 0,
      y2: 0,
      stroke: "#9aa8bc",
      "stroke-width": 1,
    });
    axis.appendChild(line);
    for (const t of ticks) {
      const tick = createSvgEl("g", { transform: `translate(${t.x},0)` });
      tick.appendChild(createSvgEl("line", { x1: 0, x2: 0, y1: 0, y2: 5, stroke: "#9aa8bc", "stroke-width": 1 }));
      appendText(tick, { x: 0, y: 16, "text-anchor": "middle", class: "pf-axis-text" }, formatTick(t.value));
      axis.appendChild(tick);
    }
    group.appendChild(axis);
  }

  function drawYAxis(group, xPos, tickValues, yFn, formatter) {
    const axis = createSvgEl("g", { class: "pf-axis pf-axis-y", transform: `translate(${xPos},0)` });
    const yMin = yFn(tickValues[0]);
    const yMax = yFn(tickValues[tickValues.length - 1]);
    axis.appendChild(createSvgEl("line", { x1: 0, x2: 0, y1: yMax, y2: yMin, stroke: "#9aa8bc", "stroke-width": 1 }));
    for (const value of tickValues) {
      const y = yFn(value);
      const tick = createSvgEl("g", { transform: `translate(0,${y})` });
      tick.appendChild(createSvgEl("line", { x1: -5, x2: 0, y1: 0, y2: 0, stroke: "#9aa8bc", "stroke-width": 1 }));
      appendText(tick, { x: -8, y: 4, "text-anchor": "end", class: "pf-axis-text" }, formatter(value));
      axis.appendChild(tick);
    }
    group.appendChild(axis);
  }

  function linspace(min, max, count) {
    if (count <= 1) return [min];
    const step = (max - min) / (count - 1);
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(min + step * i);
    }
    return out;
  }

  function renderPriceFirstStructuralChart(root, model, options) {
    const cfg = options || {};
    clearNode(root);
    root.classList.add("pf-chart-instance");
    root.style.position = "relative";

    const source = Array.isArray(model.series) ? model.series : [];
    const series = source
      .map((row) => {
        const dt = parseTime(row.ts);
        if (!dt) return null;
        return {
          ...row,
          _t: dt,
          _tm: dt.getTime(),
          _price: isFiniteNum(row.value) ? row.value : null,
          _support: isFiniteNum(row.support_total) ? row.support_total : null,
          _pressure: isFiniteNum(row.pressure_total) ? row.pressure_total : null,
          _net: isFiniteNum(row.net_balance) ? row.net_balance : null,
        };
      })
      .filter((x) => x !== null);

    if (series.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pf-empty";
      empty.textContent = "No chart data available.";
      root.appendChild(empty);
      return;
    }

    const priceRows = series.filter((r) => isFiniteNum(r._price));
    if (priceRows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pf-empty";
      empty.textContent = "No price/performance values available for rendering.";
      root.appendChild(empty);
      return;
    }

    const width = Math.max(360, root.clientWidth || 980);
    const height = isFiniteNum(cfg.height) ? Number(cfg.height) : 520;
    const margin = { top: 16, right: 18, bottom: 34, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const panelGap = 16;
    const mainHeight = Math.max(200, Math.floor((innerHeight - panelGap) * 0.66));
    const balanceHeight = Math.max(120, innerHeight - panelGap - mainHeight);
    const totalPlotHeight = mainHeight + panelGap + balanceHeight;
    const showNetBalance = cfg.showNetBalance !== undefined
      ? Boolean(cfg.showNetBalance)
      : !model.balance_panel || model.balance_panel.show_net_balance !== false;

    const [tMin, tMax] = [series[0]._tm, series[series.length - 1]._tm];
    const xFn = makeLinearScale(tMin, tMax, 0, innerWidth);

    const [priceMin, priceMax] = extent(priceRows.map((r) => r._price));
    const yMain = makeLinearScale(priceMin, priceMax, mainHeight, 0);

    const balValues = [];
    for (const row of series) {
      if (isFiniteNum(row._support)) balValues.push(row._support);
      if (isFiniteNum(row._pressure)) balValues.push(row._pressure);
      if (showNetBalance && isFiniteNum(row._net)) balValues.push(row._net);
    }
    const balExt = extent(balValues);
    const balMin = Math.min(balExt[0], 0);
    const balMax = balExt[1];
    const yBal = makeLinearScale(balMin, balMax, balanceHeight, 0);

    const svg = createSvgEl("svg", {
      class: "pf-svg",
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: "xMidYMid meet",
    });
    root.appendChild(svg);

    const gRoot = createSvgEl("g", { transform: `translate(${margin.left},${margin.top})` });
    svg.appendChild(gRoot);
    const gMain = createSvgEl("g", { class: "pf-main-panel" });
    const gBalance = createSvgEl("g", { class: "pf-balance-panel", transform: `translate(0,${mainHeight + panelGap})` });
    gRoot.appendChild(gMain);
    gRoot.appendChild(gBalance);

    const regimes = Array.isArray(model.regime_segments) ? model.regime_segments : [];
    for (let i = 0; i < regimes.length; i++) {
      const seg = regimes[i];
      const st = parseTime(seg.start_ts);
      const et = parseTime(seg.end_ts);
      if (!st) continue;
      const x0 = xFn(st.getTime());
      let x1 = et ? xFn(et.getTime()) : innerWidth;
      if (!isFiniteNum(x1) || x1 <= x0) {
        x1 = i === regimes.length - 1 ? innerWidth : x0 + 2;
      }
      const rect = createSvgEl("rect", {
        x: x0,
        y: 0,
        width: Math.max(2, x1 - x0),
        height: mainHeight,
      });
      if (seg.regime === "support_led") rect.setAttribute("fill", "rgba(79, 201, 149, 0.08)");
      else if (seg.regime === "pressure_led") rect.setAttribute("fill", "rgba(234, 127, 127, 0.075)");
      else rect.setAttribute("fill", "rgba(141, 164, 200, 0.06)");
      gMain.appendChild(rect);
    }

    const priceLine = pointsToPolyline(series, xFn, yMain, "_price");
    const pricePolyline = createSvgEl("polyline", {
      points: priceLine,
      class: "pf-price-line",
      fill: "none",
      stroke: "var(--pf-price-line)",
      "stroke-width": 2.2,
      "vector-effect": "non-scaling-stroke",
    });
    gMain.appendChild(pricePolyline);

    const yTicksMain = linspace(priceMin, priceMax, 6);
    drawYAxis(gMain, 0, yTicksMain, yMain, (v) => (model.value_kind === "price" ? v.toFixed(2) : v.toFixed(3)));
    appendText(gMain, { class: "pf-y-label", x: -mainHeight / 2, y: -44, transform: "rotate(-90)" }, text(model.y_axis_label || "Price"));

    const supportPolyline = createSvgEl("polyline", {
      points: pointsToPolyline(series, xFn, yBal, "_support"),
      class: "pf-balance-line pf-balance-line-support",
    });
    const pressurePolyline = createSvgEl("polyline", {
      points: pointsToPolyline(series, xFn, yBal, "_pressure"),
      class: "pf-balance-line pf-balance-line-pressure",
    });
    gBalance.appendChild(supportPolyline);
    gBalance.appendChild(pressurePolyline);
    if (showNetBalance) {
      gBalance.appendChild(
        createSvgEl("polyline", {
          points: pointsToPolyline(series, xFn, yBal, "_net"),
          class: "pf-balance-line pf-balance-line-net",
        })
      );
    }

    const zeroY = yBal(0);
    if (isFiniteNum(zeroY) && zeroY >= 0 && zeroY <= balanceHeight) {
      gBalance.appendChild(
        createSvgEl("line", {
          class: "pf-balance-zero-line",
          x1: 0,
          x2: innerWidth,
          y1: zeroY,
          y2: zeroY,
        })
      );
    }
    const balTitle = cfg.balanceTitle || (model.balance_panel && model.balance_panel.title) || "Support vs Pressure";
    appendText(gBalance, { class: "pf-balance-panel-title", x: 2, y: 12 }, balTitle);

    const yTicksBal = linspace(balMin, balMax, 5);
    drawYAxis(gBalance, 0, yTicksBal, yBal, (v) => v.toFixed(2));
    appendText(gBalance, { class: "pf-y-label", x: -balanceHeight / 2, y: -44, transform: "rotate(-90)" }, "Support / Pressure");

    const xTicksRaw = linspace(0, series.length - 1, 8).map((i) => series[Math.round(i)]).filter(Boolean);
    const xTicks = xTicksRaw.map((row) => ({ x: xFn(row._tm), value: row._t }));
    drawXAxis(gBalance, innerWidth, balanceHeight, xTicks, (v) => formatMarketTickTime(v));

    const legendMain = createSvgEl("g", { class: "pf-regime-legend", transform: `translate(${Math.max(4, innerWidth - 250)},8)` });
    const mainLegend = [
      { label: "Support-led", cls: "pf-regime-swatch-support" },
      { label: "Pressure-led", cls: "pf-regime-swatch-pressure" },
      { label: "Mixed / rotating", cls: "pf-regime-swatch-mixed" },
    ];
    mainLegend.forEach((item, idx) => {
      const row = createSvgEl("g", { transform: `translate(${idx * 84},0)` });
      row.appendChild(createSvgEl("rect", { class: item.cls, x: 0, y: 0, width: 14, height: 14, rx: 2, ry: 2 }));
      appendText(row, { x: 18, y: 11 }, item.label);
      legendMain.appendChild(row);
    });
    gMain.appendChild(legendMain);

    const legendBal = createSvgEl("g", { class: "pf-balance-legend", transform: `translate(${Math.max(0, innerWidth - 220)},4)` });
    const balLegend = [
      { cls: "pf-balance-legend-support", label: "Support total" },
      { cls: "pf-balance-legend-pressure", label: "Pressure total" },
    ];
    if (showNetBalance) balLegend.push({ cls: "pf-balance-legend-net", label: "Net balance" });
    balLegend.forEach((item, idx) => {
      const row = createSvgEl("g", { transform: `translate(${idx * 74},0)` });
      row.appendChild(createSvgEl("line", { class: `pf-balance-legend-line ${item.cls}`, x1: 0, x2: 12, y1: 8, y2: 8 }));
      appendText(row, { x: 15, y: 11 }, item.label);
      legendBal.appendChild(row);
    });
    gBalance.appendChild(legendBal);

    const tooltip = makeTooltip(root);
    const eventsByTs = {};
    if (model.events_by_ts && typeof model.events_by_ts === "object") {
      Object.assign(eventsByTs, model.events_by_ts);
    }
    const supportFieldLabel = (model.role_labels && model.role_labels.support) || "Dominant support";
    const pressureFieldLabel = (model.role_labels && model.role_labels.pressure) || "Dominant pressure";

    const crosshair = createSvgEl("g", { class: "pf-crosshair", style: "display:none" });
    const crossV = createSvgEl("line", {
      class: "pf-crosshair-x",
      x1: 0,
      x2: 0,
      y1: 0,
      y2: totalPlotHeight,
      stroke: "rgba(24,31,43,0.42)",
      "stroke-dasharray": "3 3",
    });
    const crossMain = createSvgEl("line", {
      class: "pf-crosshair-y-main",
      x1: 0,
      x2: innerWidth,
      y1: 0,
      y2: 0,
      stroke: "rgba(24,31,43,0.22)",
      "stroke-dasharray": "3 3",
    });
    const crossBal = createSvgEl("line", {
      class: "pf-crosshair-y-balance",
      x1: 0,
      x2: innerWidth,
      y1: 0,
      y2: 0,
      stroke: "rgba(24,31,43,0.18)",
      "stroke-dasharray": "3 3",
    });
    crosshair.appendChild(crossV);
    crosshair.appendChild(crossMain);
    crosshair.appendChild(crossBal);
    gRoot.appendChild(crosshair);

    const dotPrice = createSvgEl("circle", { class: "pf-focus-dot pf-focus-dot-price", r: 3.5, style: "display:none" });
    const dotSup = createSvgEl("circle", { class: "pf-focus-dot pf-focus-dot-support", r: 3.0, style: "display:none" });
    const dotPres = createSvgEl("circle", { class: "pf-focus-dot pf-focus-dot-pressure", r: 3.0, style: "display:none" });
    const dotNet = createSvgEl("circle", { class: "pf-focus-dot pf-focus-dot-net", r: 2.8, style: "display:none" });
    gRoot.appendChild(dotPrice);
    gRoot.appendChild(dotSup);
    gRoot.appendChild(dotPres);
    gRoot.appendChild(dotNet);

    function hideInteractive() {
      crosshair.style.display = "none";
      dotPrice.style.display = "none";
      dotSup.style.display = "none";
      dotPres.style.display = "none";
      dotNet.style.display = "none";
      tooltip.hide();
      if (typeof cfg.onLeave === "function") {
        cfg.onLeave();
      }
    }

    function showTooltipForPoint(point, px, py, forcedEvent) {
      const ev = forcedEvent || eventsByTs[point.ts] || null;
      const rows = [
        { key: "Time", value: formatMarketTimestamp(point._t) },
        { key: text(model.y_axis_label || "Price"), value: fmtPrice(point._price, model.value_kind) },
        { key: "Regime", value: regimeName(point.regime) },
        { key: supportFieldLabel, value: text(point.dominant_support || "n/a") },
        { key: pressureFieldLabel, value: text(point.dominant_pressure || "n/a") },
        { key: "Support total", value: fmtMetric(point._support) },
        { key: "Pressure total", value: fmtMetric(point._pressure) },
        { key: "Net balance", value: fmtMetric(point._net) },
      ];
      if (ev && (ev.label || ev.short_label)) {
        rows.push({ key: "Event", value: text(ev.label || ev.short_label) });
      }
      tooltip.setRows(rows);
      tooltip.move(px, py);
    }

    function updateForPoint(point) {
      const cx = xFn(point._tm);
      crosshair.style.display = "";
      crossV.setAttribute("x1", cx);
      crossV.setAttribute("x2", cx);
      if (isFiniteNum(point._price)) {
        const y = yMain(point._price);
        crossMain.setAttribute("y1", y);
        crossMain.setAttribute("y2", y);
        crossMain.style.display = "";
        dotPrice.setAttribute("cx", cx);
        dotPrice.setAttribute("cy", y);
        dotPrice.style.display = "";
      } else {
        crossMain.style.display = "none";
        dotPrice.style.display = "none";
      }
      let balanceAnchor = null;
      if (isFiniteNum(point._net)) balanceAnchor = yBal(point._net);
      else if (isFiniteNum(point._support)) balanceAnchor = yBal(point._support);
      else if (isFiniteNum(point._pressure)) balanceAnchor = yBal(point._pressure);
      if (balanceAnchor != null) {
        const y = mainHeight + panelGap + balanceAnchor;
        crossBal.setAttribute("y1", y);
        crossBal.setAttribute("y2", y);
        crossBal.style.display = "";
      } else {
        crossBal.style.display = "none";
      }
      if (isFiniteNum(point._support)) {
        dotSup.setAttribute("cx", cx);
        dotSup.setAttribute("cy", mainHeight + panelGap + yBal(point._support));
        dotSup.style.display = "";
      } else {
        dotSup.style.display = "none";
      }
      if (isFiniteNum(point._pressure)) {
        dotPres.setAttribute("cx", cx);
        dotPres.setAttribute("cy", mainHeight + panelGap + yBal(point._pressure));
        dotPres.style.display = "";
      } else {
        dotPres.style.display = "none";
      }
      if (showNetBalance && isFiniteNum(point._net)) {
        dotNet.setAttribute("cx", cx);
        dotNet.setAttribute("cy", mainHeight + panelGap + yBal(point._net));
        dotNet.style.display = "";
      } else {
        dotNet.style.display = "none";
      }
    }

    const overlay = createSvgEl("rect", {
      class: "pf-overlay-hit",
      x: 0,
      y: 0,
      width: innerWidth,
      height: totalPlotHeight,
      fill: "transparent",
    });
    gRoot.appendChild(overlay);

    overlay.addEventListener("mousemove", (evt) => {
      const rect = svg.getBoundingClientRect();
      const localX = (evt.clientX - rect.left) * (width / Math.max(1, rect.width)) - margin.left;
      const clampedX = clamp(localX, 0, innerWidth);
      const t = tMin + (clampedX / innerWidth) * (tMax - tMin);
      const idx = nearestIndexByTime(series, t);
      const point = series[idx];
      updateForPoint(point);

      const rootRect = root.getBoundingClientRect();
      const px = evt.clientX - rootRect.left;
      const py = evt.clientY - rootRect.top;
      showTooltipForPoint(point, px, py, null);
      if (typeof cfg.onHoverPoint === "function") {
        cfg.onHoverPoint(point, { source: "crosshair", event: null });
      }
    });
    overlay.addEventListener("mouseleave", hideInteractive);
    overlay.addEventListener("click", (evt) => {
      const rect = svg.getBoundingClientRect();
      const localX = (evt.clientX - rect.left) * (width / Math.max(1, rect.width)) - margin.left;
      const clampedX = clamp(localX, 0, innerWidth);
      const t = tMin + (clampedX / innerWidth) * (tMax - tMin);
      const idx = nearestIndexByTime(series, t);
      const point = series[idx];
      updateForPoint(point);
      const rootRect = root.getBoundingClientRect();
      const px = evt.clientX - rootRect.left;
      const py = evt.clientY - rootRect.top;
      showTooltipForPoint(point, px, py, null);
      if (typeof cfg.onHoverPoint === "function") {
        cfg.onHoverPoint(point, { source: "click", event: null });
      }
    });

    const events = Array.isArray(model.events) ? model.events : [];
    const gEvents = createSvgEl("g", { class: "pf-event-layer" });
    gMain.appendChild(gEvents);
    const pointByTs = {};
    for (const row of series) {
      pointByTs[row.ts] = row;
    }
    for (const ev of events) {
      const dt = parseTime(ev.ts);
      if (!dt) continue;
      const x = xFn(dt.getTime());
      const g = createSvgEl("g", { class: "pf-event-mark", tabindex: "0", role: "button", transform: `translate(${x},0)` });
      g.appendChild(createSvgEl("line", {
        x1: 0,
        x2: 0,
        y1: 14,
        y2: mainHeight,
        stroke: "rgba(122, 144, 176, 0.22)",
        "stroke-width": 1,
        "stroke-dasharray": "2 4",
      }));
      const sig = isFiniteNum(ev.significance) ? ev.significance : 0.5;
      g.appendChild(createSvgEl("circle", {
        cx: 0,
        cy: 6,
        r: 2.1 + Math.min(1.5, sig * 1.3),
        fill: "rgba(24, 35, 52, 0.86)",
        stroke: "rgba(216, 228, 247, 0.84)",
        "stroke-width": 0.9,
      }));
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${text(ev.label || ev.short_label || "Event")} (${Math.round(sig * 100)}%)`;
      g.appendChild(title);

      const showEvent = (browserEvt) => {
        const point = pointByTs[ev.ts] || null;
        if (point) {
          updateForPoint(point);
          const rootRect = root.getBoundingClientRect();
          showTooltipForPoint(point, browserEvt.clientX - rootRect.left, browserEvt.clientY - rootRect.top, ev);
          if (typeof cfg.onHoverPoint === "function") {
            cfg.onHoverPoint(point, { source: "event", event: ev });
          }
        } else {
          tooltip.setRows([{ key: "Event", value: text(ev.label || ev.short_label || "Event") }]);
          const rootRect = root.getBoundingClientRect();
          tooltip.move(browserEvt.clientX - rootRect.left, browserEvt.clientY - rootRect.top);
        }
      };
      g.addEventListener("mouseenter", showEvent);
      g.addEventListener("focus", showEvent);
      g.addEventListener("mouseleave", () => {
        tooltip.hide();
        if (typeof cfg.onLeave === "function") {
          cfg.onLeave();
        }
      });
      g.addEventListener("blur", () => {
        tooltip.hide();
        if (typeof cfg.onLeave === "function") {
          cfg.onLeave();
        }
      });
      gEvents.appendChild(g);
    }
  }

  globalObj.renderPriceFirstStructuralChart = renderPriceFirstStructuralChart;
})(typeof window !== "undefined" ? window : globalThis);
