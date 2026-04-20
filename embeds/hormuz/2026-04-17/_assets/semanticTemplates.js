(function attachSemanticTemplates(globalObj) {
  "use strict";

  const DEFAULT_TEMPLATE = {
    semanticType: "generic_structure",
    thingLabel: "the object",
    supportVerb: "supporting",
    pressureVerb: "pressuring",
    supportLabel: "Carrying support",
    pressureLabel: "Main pressure",
  };

  const LEGACY_TEMPLATES = {
    underwriting: {
      semanticType: "underwriting",
      thingLabel: "megacap sponsorship",
      supportVerb: "underwriting",
      pressureVerb: "resisting",
      supportLabel: "Underwriting side",
      pressureLabel: "Main drag",
    },
    transmission_routing: {
      semanticType: "transmission_routing",
      thingLabel: "the event",
      supportVerb: "routing",
      pressureVerb: "fighting transmission",
      supportLabel: "Support anchors",
      pressureLabel: "Stress channels",
    },
    broad_market_quality: {
      semanticType: "broad_market_quality",
      thingLabel: "broad internal market quality",
      supportVerb: "stabilizing",
      pressureVerb: "straining",
      supportLabel: "Broad support",
      pressureLabel: "Broad pressure",
    },
    reactive_premium_quality: {
      semanticType: "reactive_premium_quality",
      thingLabel: "defense accumulation quality",
      supportVerb: "stabilizing",
      pressureVerb: "reactively repricing",
      supportLabel: "Sponsorship quality",
      pressureLabel: "Reactive pressure",
    },
  };

  let registryState = {
    schemaVersion: "",
    entries: {},
    families: {},
    loaded: false,
  };

  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeKey(value) {
    return value == null ? "" : String(value).trim().toLowerCase();
  }

  function copyRecords(source) {
    const src = asRecord(source);
    const out = {};
    for (const [key, value] of Object.entries(src)) {
      if (value && typeof value === "object") {
        out[normalizeKey(key)] = value;
      }
    }
    return out;
  }

  function contextValue(value) {
    if (value == null) {
      return "";
    }
    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) => String(item == null ? "" : item).trim())
        .filter((item) => item.length > 0);
      if (cleaned.length === 0) {
        return "";
      }
      if (cleaned.length === 1) {
        return cleaned[0];
      }
      if (cleaned.length === 2) {
        return `${cleaned[0]} and ${cleaned[1]}`;
      }
      return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
    }
    return String(value).trim();
  }

  function formatTemplate(template, context) {
    const tpl = String(template == null ? "" : template);
    const ctx = asRecord(context);
    return tpl.replace(/\{([a-zA-Z0-9_]+)\}/g, function replaceField(_, key) {
      return contextValue(ctx[key]);
    }).trim();
  }

  function fallbackTemplate(semanticType) {
    const key = normalizeKey(semanticType);
    if (Object.prototype.hasOwnProperty.call(LEGACY_TEMPLATES, key)) {
      return LEGACY_TEMPLATES[key];
    }
    return DEFAULT_TEMPLATE;
  }

  function preferredVerb(entry, index, fallbackValue) {
    const verbs = Array.isArray(entry && entry.preferred_verbs) ? entry.preferred_verbs : [];
    const picked = verbs[index];
    const text = String(picked == null ? "" : picked).trim();
    return text || fallbackValue;
  }

  function labelFromRole(entry, side, fallbackValue) {
    const labels = asRecord(entry && entry.role_labels);
    const value = String(labels[side] == null ? "" : labels[side]).trim();
    return value || fallbackValue;
  }

  function templateFromEntry(entry, semanticType) {
    const fallback = fallbackTemplate(semanticType);
    return {
      semanticType: String(entry && entry.semantic_type ? entry.semantic_type : fallback.semanticType),
      thingLabel: fallback.thingLabel,
      supportVerb: preferredVerb(entry, 0, fallback.supportVerb),
      pressureVerb: preferredVerb(entry, 1, fallback.pressureVerb),
      supportLabel: labelFromRole(entry, "support", fallback.supportLabel),
      pressureLabel: labelFromRole(entry, "pressure", fallback.pressureLabel),
    };
  }

  function setSemanticRegistry(payload) {
    const data = asRecord(payload);
    const entries = copyRecords(data.entries);
    const families = copyRecords(data.families);
    registryState = {
      schemaVersion: String(data.schema_version == null ? "" : data.schema_version),
      entries,
      families,
      loaded: Object.keys(entries).length > 0 || Object.keys(families).length > 0,
    };
    globalObj.palSemanticRegistry = {
      schemaVersion: registryState.schemaVersion,
      entries: registryState.entries,
      families: registryState.families,
      loaded: registryState.loaded,
    };
    return registryState.loaded;
  }

  function getSemanticEntry(objectId, semanticType) {
    const objectKey = normalizeKey(objectId);
    if (objectKey && Object.prototype.hasOwnProperty.call(registryState.entries, objectKey)) {
      return registryState.entries[objectKey];
    }
    const semanticKey = normalizeKey(semanticType);
    if (semanticKey && Object.prototype.hasOwnProperty.call(registryState.families, semanticKey)) {
      return registryState.families[semanticKey];
    }
    return null;
  }

  function getSemanticTemplate(semanticType, objectId) {
    const entry = getSemanticEntry(objectId, semanticType);
    if (entry) {
      return templateFromEntry(entry, semanticType);
    }
    return fallbackTemplate(semanticType);
  }

  function renderRelationalSentenceFromTemplate(entry, context) {
    const primaryTemplate = String(entry && asRecord(entry.sentence_templates).primary || "").trim();
    if (!primaryTemplate) {
      return "";
    }
    const ctx = asRecord(context);
    const first = formatTemplate(primaryTemplate, ctx);
    if (!first) {
      return "";
    }
    const includeFollowOn = Boolean(ctx.include_follow_on);
    if (!includeFollowOn) {
      return first;
    }
    const followOnTemplate = String(entry && asRecord(entry.sentence_templates).follow_on || "").trim();
    if (!followOnTemplate) {
      return first;
    }
    const second = formatTemplate(followOnTemplate, ctx);
    if (!second) {
      return first;
    }
    return `${first} ${second}`.trim();
  }

  function publicShortChannelLabel(entry, label) {
    const raw = String(label == null ? "" : label).trim();
    if (!raw) {
      return "Channel";
    }
    const shortMap = asRecord(entry && entry.public_short_labels);
    if (Object.prototype.hasOwnProperty.call(shortMap, raw)) {
      return String(shortMap[raw]).trim() || raw;
    }

    let reduced = raw;
    const suffixes = [" (FRED)", " Response", " Anchor"];
    for (const suffix of suffixes) {
      if (reduced.endsWith(suffix)) {
        reduced = reduced.slice(0, -suffix.length).trim();
      }
    }
    if (reduced.startsWith("Broad Dollar Index")) {
      return "Dollar";
    }
    if (reduced.startsWith("High-Yield Spread")) {
      return "Credit";
    }
    if (reduced.startsWith("JETS Fuel-Cost Stress")) {
      return "JETS";
    }
    if (reduced.startsWith("Brent Crude")) {
      return "Brent";
    }
    if (reduced.startsWith("Henry Hub Gas")) {
      return "Henry Hub";
    }
    if (reduced.endsWith(" OBp")) {
      return reduced.slice(0, -4).trim();
    }
    return reduced;
  }

  globalObj.palSemanticTemplates = LEGACY_TEMPLATES;
  globalObj.getSemanticTemplate = getSemanticTemplate;
  globalObj.setSemanticRegistry = setSemanticRegistry;
  globalObj.getSemanticEntry = getSemanticEntry;
  globalObj.renderRelationalSentenceFromTemplate = renderRelationalSentenceFromTemplate;
  globalObj.publicShortChannelLabel = publicShortChannelLabel;
  globalObj.palSemanticRegistry = {
    schemaVersion: "",
    entries: {},
    families: {},
    loaded: false,
  };
})(typeof window !== "undefined" ? window : globalThis);
