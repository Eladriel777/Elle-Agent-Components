// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import guardEcho from "./rules/guard-echo.js";
import transcriptEcho from "./rules/transcript-echo.js";
import fallbackNotice from "./rules/fallback-notice.js";
import statusEcho from "./rules/openclaw-status-echo.js";
import toolError from "./rules/tool-error-notice.js";

export const defaultFilters = [guardEcho, transcriptEcho, fallbackNotice, statusEcho, toolError];

export function createFilterPipeline({ filters = defaultFilters, config = {}, logFile = null, includePreview = false, onEvent = null, failClosed = false } = {}) {
  const list = [...filters].filter(filter => filter?.name && typeof filter.apply === "function")
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  function record(filter, action, reason, text) {
    const event = { time: new Date().toISOString(), filter: filter.name, action, reason: String(reason ?? "") };
    if (includePreview) event.preview = String(text ?? "").slice(0, 100);
    if (logFile) {
      try { fs.mkdirSync(path.dirname(logFile), { recursive: true }); fs.appendFileSync(logFile, JSON.stringify(event) + "\n", "utf8"); } catch { /* Audit storage must not break delivery. */ }
    }
    try { onEvent?.(event); } catch { /* Observer errors do not change filtering. */ }
  }
  return async function runFilterPipeline(text, context = {}) {
    if (config.enabled === false) return text;
    let current = text;
    for (const filter of list) {
      const options = config.filters?.[filter.name] ?? {};
      if (options.enabled === false) continue;
      try {
        const result = await filter.apply(current, context, options);
        if (result?.action === "suppress") {
          record(filter, "suppress", result.reason, current);
          return null;
        }
        if (result?.action === "replace" && typeof result.text === "string") {
          record(filter, "replace", result.reason, current);
          current = result.text;
        }
      } catch (error) {
        record(filter, "error", error.message, current);
        if (failClosed) return null;
      }
    }
    return current;
  };
}

export async function loadFilterPipeline(directory, options = {}) {
  const files = fs.readdirSync(directory).filter(name => name.endsWith(".js") && !name.startsWith("_"));
  const filters = [];
  for (const name of files) {
    const module = await import(pathToFileURL(path.resolve(directory, name)).href);
    if (module.default) filters.push(module.default);
  }
  return createFilterPipeline({ ...options, filters });
}

export function getFilterStats(logFile) {
  const filters = {};
  let totalEvents = 0;
  let ignoredLines = 0;
  if (!fs.existsSync(logFile)) return { totalEvents, ignoredLines, filters };
  for (const line of fs.readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (!event.filter || !["suppress", "replace", "error"].includes(event.action)) { ignoredLines++; continue; }
      filters[event.filter] ??= { suppress: 0, replace: 0, error: 0 };
      filters[event.filter][event.action]++;
      totalEvents++;
    } catch { ignoredLines++; }
  }
  return { totalEvents, ignoredLines, filters };
}
