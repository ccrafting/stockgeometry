(function attachRelationalReadout(globalObj) {
  "use strict";

  function toDisplay(value) {
    return value == null ? "" : String(value).trim();
  }

  function shortChannel(entry, label) {
    const raw = toDisplay(label);
    if (!raw) {
      return "";
    }
    if (typeof globalObj.publicShortChannelLabel === "function") {
      return globalObj.publicShortChannelLabel(entry, raw);
    }
    return raw;
  }

  function actorList(rows, maxCount, entry) {
    const out = [];
    if (!Array.isArray(rows)) {
      return out;
    }
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const label = shortChannel(entry, row.channel);
      if (!label) {
        continue;
      }
      out.push(label);
      if (out.length >= maxCount) {
        break;
      }
    }
    return out;
  }

  function joinActors(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return "";
    }
    if (values.length === 1) {
      return values[0];
    }
    if (values.length === 2) {
      return `${values[0]} and ${values[1]}`;
    }
    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
  }

  function beVerb(count) {
    return count === 1 ? "is" : "are";
  }

  function concentrationTag(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return "";
    }
    const total = rows.reduce((acc, row) => acc + (Number(row.value) || 0), 0);
    if (total <= 0) {
      return "";
    }
    const topTwo = rows.slice(0, 2).reduce((acc, row) => acc + (Number(row.value) || 0), 0);
    const share = topTwo / total;
    if (share >= 0.75) {
      return "concentrated";
    }
    if (share <= 0.5) {
      return "distributed";
    }
    return "mixed";
  }

  function regimeImplication(regime) {
    if (regime === "support_led") {
      return "Control is currently on the support side unless that carrying cluster thins.";
    }
    if (regime === "pressure_led") {
      return "Control is currently on the pressure side unless support broadens across more channels.";
    }
    return "Control is contested, with rotation likely unless one side establishes a cleaner lead.";
  }

  function readoutUnderwriting(snapshot, supportActors, pressureActors) {
    const supportText = supportActors.length > 0 ? joinActors(supportActors) : "no clear underwriting pocket";
    const pressureText = pressureActors.length > 0 ? joinActors(pressureActors) : "no clear resisting name";
    return `The market is underwriting megacap sponsorship through ${supportText}, while ${pressureText} is resisting that bid.`;
  }

  function readoutTransmission(snapshot, supportActors, pressureActors) {
    const supportText = supportActors.length > 0 ? joinActors(supportActors) : "no stable support anchor";
    if (pressureActors.length === 0) {
      return `The market is routing the event through ${supportText}, while no dominant stress cluster is fighting that transmission.`;
    }
    const pressureText = joinActors(pressureActors);
    return `The market is routing the event through ${supportText}, while ${pressureText} ${beVerb(pressureActors.length)} fighting that transmission.`;
  }

  function readoutBroadQuality(snapshot, supportActors, pressureActors) {
    if (supportActors.length === 0) {
      const pressureTextFallback = pressureActors.length > 0 ? joinActors(pressureActors) : "no dominant pressure cluster";
      return `The tape is being pressured by ${pressureTextFallback}, while no broad stabilizer has taken control.`;
    }
    const supportText = joinActors(supportActors);
    const pressureText = pressureActors.length > 0 ? joinActors(pressureActors) : "no dominant pressure cluster";
    return `The tape is being pressured by ${pressureText}, while ${supportText} ${beVerb(supportActors.length)} absorbing that strain.`;
  }

  function readoutReactivePremium(snapshot, supportActors, pressureActors) {
    if (supportActors.length === 0) {
      const pressureTextFallback = pressureActors.length > 0 ? joinActors(pressureActors) : "no active reactive channel";
      return `Defense is being traded through ${pressureTextFallback}, while no settled sponsorship pocket is turning that move into accumulation.`;
    }
    const supportText = joinActors(supportActors);
    const pressureText = pressureActors.length > 0 ? joinActors(pressureActors) : "no active reactive channel";
    return `Defense is being traded through ${pressureText}, while ${supportText} ${beVerb(supportActors.length)} trying to turn that move into settled sponsorship.`;
  }

  function readoutGeneric(snapshot, supportActors, pressureActors) {
    const supportText = supportActors.length > 0 ? joinActors(supportActors) : "no meaningful support pocket";
    const pressureText = pressureActors.length > 0 ? joinActors(pressureActors) : "no meaningful pressure pocket";
    return `Support is carried by ${supportText}, while pressure is carried by ${pressureText}.`;
  }

  function buildRegistryContext(snapshot, supportActors, pressureActors, supportShape, pressureShape) {
    return {
      support_actors: supportActors.length > 0 ? joinActors(supportActors) : "no meaningful support pocket",
      pressure_cluster: pressureActors.length > 0 ? joinActors(pressureActors) : "no meaningful pressure pocket",
      support_cluster: supportActors.length > 0 ? joinActors(supportActors) : "no broad stabilizer",
      support_anchor: supportActors.length > 0 ? supportActors[0] : "no stable support anchor",
      reactive_cluster: pressureActors.length > 0 ? joinActors(pressureActors) : "no reactive cluster",
      supportive_cluster: supportActors.length > 0 ? joinActors(supportActors) : "no sponsorship cluster",
      support_shape: supportShape || "mixed",
      pressure_shape: pressureShape || "mixed",
      quality_shape: supportShape || pressureShape || "mixed",
      structure_shape: supportShape || pressureShape || "mixed",
      include_follow_on: Boolean(
        (supportShape && supportShape !== "mixed") || (pressureShape && pressureShape !== "mixed")
      ),
    };
  }

  function generateRelationalReadout(snapshot) {
    const semanticType = toDisplay(snapshot && snapshot.objectSemanticType);
    const regime = toDisplay(snapshot && snapshot.regime);
    const supportRows = Array.isArray(snapshot && snapshot.supportRows) ? snapshot.supportRows : [];
    const pressureRows = Array.isArray(snapshot && snapshot.pressureRows) ? snapshot.pressureRows : [];
    const objectId = toDisplay(snapshot && (snapshot.objectId || snapshot.object_id));

    const entryResolver = globalObj.getSemanticEntry;
    const entry =
      typeof entryResolver === "function"
        ? entryResolver(objectId, semanticType)
        : null;

    const supportActors = actorList(supportRows, 3, entry);
    const pressureActors = actorList(pressureRows, 3, entry);

    if (supportActors.length === 0 && pressureActors.length === 0) {
      return "No meaningful support or pressure pocket is visible at this timestamp.";
    }

    const supportConcentration = concentrationTag(supportRows);
    const pressureConcentration = concentrationTag(pressureRows);

    const registryRenderer = globalObj.renderRelationalSentenceFromTemplate;
    if (entry && typeof registryRenderer === "function") {
      const context = buildRegistryContext(
        snapshot,
        supportActors,
        pressureActors,
        supportConcentration,
        pressureConcentration
      );
      const rendered = toDisplay(registryRenderer(entry, context));
      if (rendered) {
        return rendered;
      }
    }

    let sentenceOne = "";
    if (semanticType === "underwriting") {
      sentenceOne = readoutUnderwriting(snapshot, supportActors, pressureActors);
    } else if (semanticType === "transmission_routing") {
      sentenceOne = readoutTransmission(snapshot, supportActors, pressureActors);
    } else if (semanticType === "broad_market_quality") {
      sentenceOne = readoutBroadQuality(snapshot, supportActors, pressureActors);
    } else if (semanticType === "reactive_premium_quality") {
      sentenceOne = readoutReactivePremium(snapshot, supportActors, pressureActors);
    } else {
      sentenceOne = readoutGeneric(snapshot, supportActors, pressureActors);
    }

    let sentenceTwo = regimeImplication(regime);
    if (supportConcentration === "concentrated" && supportActors.length > 0) {
      sentenceTwo = `Support burden is concentrated in ${joinActors(supportActors.slice(0, 2))}. ${sentenceTwo}`;
    } else if (pressureConcentration === "concentrated" && pressureActors.length > 0) {
      sentenceTwo = `Pressure burden is concentrated in ${joinActors(pressureActors.slice(0, 2))}. ${sentenceTwo}`;
    } else if (supportConcentration === "distributed" && supportActors.length > 1) {
      sentenceTwo = `Support is distributed across multiple channels. ${sentenceTwo}`;
    } else if (pressureConcentration === "distributed" && pressureActors.length > 1) {
      sentenceTwo = `Pressure is distributed across multiple channels. ${sentenceTwo}`;
    }

    return `${sentenceOne} ${sentenceTwo}`.trim();
  }

  globalObj.generateRelationalReadout = generateRelationalReadout;
})(typeof window !== "undefined" ? window : globalThis);
