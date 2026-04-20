(function attachSnapshotLegend(globalObj) {
  "use strict";

  const MARKET_TZ = "America/New_York";
  const TS_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const TS_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
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

  function formatTimestamp(ts) {
    const dt = parseTime(ts);
    if (!dt) {
      return "n/a";
    }
    try {
      const datePart = TS_DATE_FORMATTER.format(dt).replace(/\//g, "-");
      const timePart = TS_TIME_FORMATTER.format(dt);
      return `${datePart} ${timePart} ET`;
    } catch (err) {
      return dt.toISOString();
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

  function rowsFromChannels(channels, side, maxRows) {
    if (!channels || typeof channels !== "object") {
      return [];
    }
    const rows = [];
    for (const [channel, rawValue] of Object.entries(channels)) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        continue;
      }
      if (side === "support" && value < 0) {
        rows.push({ channel, value: Math.abs(value) });
      } else if (side === "pressure" && value > 0) {
        rows.push({ channel, value });
      }
    }
    rows.sort((a, b) => b.value - a.value || a.channel.localeCompare(b.channel));
    return rows.slice(0, maxRows).map((row, idx) => ({
      channel: row.channel,
      value: row.value,
      rank: idx + 1,
    }));
  }

  function rowsFromSnapshot(snapshot, side, maxRows) {
    if (!snapshot || typeof snapshot !== "object") {
      return [];
    }
    const rows = snapshot[side];
    if (!Array.isArray(rows)) {
      return [];
    }
    const out = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const channel = toDisplay(row.channel);
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

  function renderFallbackRanking(root, options) {
    clearNode(root);
    const title = toDisplay(options && options.title) || "Rankings";
    const rows = Array.isArray(options && options.rows) ? options.rows : [];
    const block = document.createElement("section");
    block.className = "pf-legend-block";
    const heading = document.createElement("h3");
    heading.className = "pf-legend-block-title";
    heading.textContent = title;
    block.appendChild(heading);
    const text = document.createElement("p");
    text.className = "pf-ranking-empty";
    if (rows.length === 0) {
      text.textContent = "No meaningful contributors at this timestamp.";
      block.appendChild(text);
      root.appendChild(block);
      return;
    }
    text.textContent = rows.map((row) => `${row.rank}. ${row.channel} ${Number(row.value).toFixed(3)}`).join(" | ");
    block.appendChild(text);
    root.appendChild(block);
  }

  function renderFallbackReadout(root, snapshot) {
    clearNode(root);
    const block = document.createElement("section");
    block.className = "pf-legend-block";
    const heading = document.createElement("h3");
    heading.className = "pf-legend-block-title";
    heading.textContent = "Relational readout";
    block.appendChild(heading);
    const body = document.createElement("p");
    body.className = "pf-relational-text";
    const supportLead = snapshot && snapshot.supportRows && snapshot.supportRows[0] ? snapshot.supportRows[0].channel : "no support pocket";
    const pressureLead = snapshot && snapshot.pressureRows && snapshot.pressureRows[0] ? snapshot.pressureRows[0].channel : "no pressure pocket";
    body.textContent = `Support is led by ${supportLead}, while pressure is led by ${pressureLead}.`;
    block.appendChild(body);
    root.appendChild(block);
  }

  function renderFallbackEvent(root, eventItem) {
    clearNode(root);
    const block = document.createElement("section");
    block.className = "pf-legend-block";
    const heading = document.createElement("h3");
    heading.className = "pf-legend-block-title";
    heading.textContent = "Latest change";
    block.appendChild(heading);
    const body = document.createElement("p");
    body.className = "pf-event-empty";
    body.textContent = eventItem && eventItem.label ? eventItem.label : "No recent structural change in this window.";
    block.appendChild(body);
    root.appendChild(block);
  }

  function renderSnapshotLegend(root, model, options) {
    if (!root) {
      return {
        update: function noop() {},
        clearHover: function noopClear() {},
      };
    }
    clearNode(root);

    const cfg = options || {};
    const maxRowsPerSide = Number.isFinite(Number(cfg.maxRowsPerSide)) ? Number(cfg.maxRowsPerSide) : 4;
    const eventLookbackBars = Number.isFinite(Number(cfg.eventLookbackBars)) ? Number(cfg.eventLookbackBars) : 4;

    const series = Array.isArray(model && model.series) ? model.series : [];
    if (series.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pf-empty";
      empty.textContent = "No legend data available.";
      root.appendChild(empty);
      return {
        update: function noop() {},
        clearHover: function noopClear() {},
      };
    }

    const objectLabel = toDisplay(model.object_label) || toDisplay(model.object_id) || "Object";
    const objectQuestion = toDisplay(model.object_question);
    const semanticType = toDisplay(model.object_semantic_type);
    const roleLabels = model && typeof model.role_labels === "object" ? model.role_labels : {};
    const supportTitle = toDisplay(roleLabels.support) || "Carrying support";
    const pressureTitle = toDisplay(roleLabels.pressure) || "Main drag";
    const channelRolesByTs = model && typeof model.channel_roles_by_ts === "object" ? model.channel_roles_by_ts : {};
    const snapshotRankings = model && typeof model.snapshot_rankings === "object" ? model.snapshot_rankings : {};
    const eventsByTs = model && typeof model.events_by_ts === "object" ? model.events_by_ts : {};

    const pointByTs = {};
    const orderedTs = [];
    for (const row of series) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const ts = toDisplay(row.ts);
      if (!ts) {
        continue;
      }
      pointByTs[ts] = row;
      orderedTs.push(ts);
    }
    const tsToIndex = {};
    orderedTs.forEach((ts, idx) => {
      tsToIndex[ts] = idx;
    });
    const latestTs = orderedTs[orderedTs.length - 1];

    const wrapper = document.createElement("div");
    wrapper.className = "pf-legend-root";

    const header = document.createElement("section");
    header.className = "pf-legend-header";
    const titleNode = document.createElement("h2");
    titleNode.className = "pf-legend-title";
    titleNode.textContent = objectLabel;
    header.appendChild(titleNode);
    const questionNode = document.createElement("p");
    questionNode.className = "pf-legend-question";
    questionNode.textContent = objectQuestion || "Object question unavailable.";
    header.appendChild(questionNode);
    const metaRow = document.createElement("div");
    metaRow.className = "pf-legend-meta";
    const tsNode = document.createElement("span");
    tsNode.className = "pf-legend-ts";
    metaRow.appendChild(tsNode);
    const postureNode = document.createElement("span");
    postureNode.className = "pf-legend-posture";
    metaRow.appendChild(postureNode);
    header.appendChild(metaRow);

    const dominantRow = document.createElement("div");
    dominantRow.className = "pf-dominant-row";
    const dominantSupportCard = document.createElement("div");
    dominantSupportCard.className = "pf-dominant-card is-support";
    const dominantSupportLabel = document.createElement("span");
    dominantSupportLabel.className = "pf-dominant-label";
    dominantSupportLabel.textContent = supportTitle;
    dominantSupportCard.appendChild(dominantSupportLabel);
    const dominantSupportValue = document.createElement("strong");
    dominantSupportValue.className = "pf-dominant-value";
    dominantSupportCard.appendChild(dominantSupportValue);
    dominantRow.appendChild(dominantSupportCard);
    const dominantPressureCard = document.createElement("div");
    dominantPressureCard.className = "pf-dominant-card is-pressure";
    const dominantPressureLabel = document.createElement("span");
    dominantPressureLabel.className = "pf-dominant-label";
    dominantPressureLabel.textContent = pressureTitle;
    dominantPressureCard.appendChild(dominantPressureLabel);
    const dominantPressureValue = document.createElement("strong");
    dominantPressureValue.className = "pf-dominant-value";
    dominantPressureCard.appendChild(dominantPressureValue);
    dominantRow.appendChild(dominantPressureCard);
    header.appendChild(dominantRow);

    const supportMount = document.createElement("div");
    supportMount.className = "pf-legend-mount";
    const pressureMount = document.createElement("div");
    pressureMount.className = "pf-legend-mount";
    const readoutMount = document.createElement("div");
    readoutMount.className = "pf-legend-mount";
    const eventMount = document.createElement("div");
    eventMount.className = "pf-legend-mount";

    wrapper.appendChild(header);
    wrapper.appendChild(supportMount);
    wrapper.appendChild(pressureMount);
    wrapper.appendChild(readoutMount);
    wrapper.appendChild(eventMount);
    root.appendChild(wrapper);

    const rankingRenderer = typeof globalObj.renderRankingList === "function" ? globalObj.renderRankingList : renderFallbackRanking;
    const readoutRenderer = typeof globalObj.renderRelationalReadoutBlock === "function"
      ? globalObj.renderRelationalReadoutBlock
      : renderFallbackReadout;
    const eventRenderer = typeof globalObj.renderEventSummaryBlock === "function"
      ? globalObj.renderEventSummaryBlock
      : renderFallbackEvent;

    function relevantEvent(ts, forcedEvent) {
      if (forcedEvent && typeof forcedEvent === "object") {
        return forcedEvent;
      }
      if (eventsByTs[ts]) {
        return eventsByTs[ts];
      }
      const idx = Number.isFinite(tsToIndex[ts]) ? tsToIndex[ts] : -1;
      if (idx < 0) {
        return null;
      }
      const minIdx = Math.max(0, idx - eventLookbackBars);
      for (let i = idx - 1; i >= minIdx; i--) {
        const priorTs = orderedTs[i];
        if (eventsByTs[priorTs]) {
          return eventsByTs[priorTs];
        }
      }
      return null;
    }

    function snapshotForTs(ts, forcedEvent) {
      const point = pointByTs[ts] || pointByTs[latestTs];
      const pointTs = point && point.ts ? point.ts : latestTs;
      const channels = channelRolesByTs[pointTs];
      let supportRows = rowsFromChannels(channels, "support", maxRowsPerSide);
      let pressureRows = rowsFromChannels(channels, "pressure", maxRowsPerSide);
      if (supportRows.length === 0 && pressureRows.length === 0) {
        supportRows = rowsFromSnapshot(snapshotRankings, "support", maxRowsPerSide);
        pressureRows = rowsFromSnapshot(snapshotRankings, "pressure", maxRowsPerSide);
      }

      const dominantSupport = toDisplay(point.dominant_support) || (supportRows[0] ? supportRows[0].channel : "None");
      const dominantPressure = toDisplay(point.dominant_pressure) || (pressureRows[0] ? pressureRows[0].channel : "None");

      return {
        ts: pointTs,
        objectId: toDisplay(model.object_id),
        regime: toDisplay(point.regime),
        regimeLabel: toDisplay(point.regime_label) || regimeName(point.regime),
        supportRows,
        pressureRows,
        dominantSupport,
        dominantPressure,
        supportTotal: Number(point.support_total),
        pressureTotal: Number(point.pressure_total),
        netBalance: Number(point.net_balance),
        objectSemanticType: semanticType,
        objectQuestion,
        event: relevantEvent(pointTs, forcedEvent),
      };
    }

    function renderSnapshot(snapshot) {
      tsNode.textContent = formatTimestamp(snapshot.ts);
      postureNode.textContent = snapshot.regimeLabel || regimeName(snapshot.regime);
      dominantSupportValue.textContent = snapshot.dominantSupport || "None";
      dominantPressureValue.textContent = snapshot.dominantPressure || "None";

      rankingRenderer(supportMount, {
        title: supportTitle,
        rows: snapshot.supportRows,
        maxRows: maxRowsPerSide,
        dominantChannel: snapshot.dominantSupport,
      });
      rankingRenderer(pressureMount, {
        title: pressureTitle,
        rows: snapshot.pressureRows,
        maxRows: maxRowsPerSide,
        dominantChannel: snapshot.dominantPressure,
      });
      readoutRenderer(readoutMount, {
        objectSemanticType: snapshot.objectSemanticType,
        objectQuestion: snapshot.objectQuestion,
        regime: snapshot.regime,
        supportRows: snapshot.supportRows,
        pressureRows: snapshot.pressureRows,
        dominantSupport: snapshot.dominantSupport,
        dominantPressure: snapshot.dominantPressure,
        supportTotal: snapshot.supportTotal,
        pressureTotal: snapshot.pressureTotal,
        netBalance: snapshot.netBalance,
        event: snapshot.event,
      });
      eventRenderer(eventMount, snapshot.event, {});
      root.setAttribute("data-active-ts", snapshot.ts);
    }

    const state = {
      hoveredTs: null,
      hoveredEvent: null,
    };

    function renderActive() {
      const activeTs = state.hoveredTs && pointByTs[state.hoveredTs] ? state.hoveredTs : latestTs;
      renderSnapshot(snapshotForTs(activeTs, state.hoveredEvent));
    }

    function update(hoveredTimestamp, eventItem) {
      const ts = toDisplay(hoveredTimestamp);
      state.hoveredTs = ts && pointByTs[ts] ? ts : null;
      state.hoveredEvent = eventItem && typeof eventItem === "object" ? eventItem : null;
      renderActive();
    }

    function clearHover() {
      state.hoveredTs = null;
      state.hoveredEvent = null;
      renderActive();
    }

    renderActive();
    return {
      update,
      clearHover,
      getActiveTimestamp: function getActiveTimestamp() {
        return root.getAttribute("data-active-ts");
      },
    };
  }

  globalObj.renderSnapshotLegend = renderSnapshotLegend;
})(typeof window !== "undefined" ? window : globalThis);
