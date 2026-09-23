/** Browser-side, bounded reader for the ASCII data section of LAS 2.0 files. */
export const LAS_LIMITS = { textCharacters: 5_000_000, rows: 250_000, curves: 256 } as const;

export type LogCurve = { mnemonic: string; unit: string; description: string };
export type LogDepthIssue = { row: number; kind: "duplicate" | "nonmonotonic" };
export type ParsedWellLog = {
  format: "LAS 2.0";
  curves: LogCurve[];
  depthCurve: LogCurve;
  depthUnit: string;
  /** LAS does not establish whether its depth is MD, TVD, or another reference. */
  depthReference: "unknown";
  verticalDatum: string | null;
  rows: Array<{ depth: number; values: Array<number | null> }>;
  depthIssues: LogDepthIssue[];
  nullSentinel: number;
};

export type LasParseResult = { ok: true; log: ParsedWellLog } | { ok: false; error: string };

const fail = (error: string): LasParseResult => ({ ok: false, error });
const depthNames = new Set(["DEPT", "DEPTH"]);

/** Parse a plain-text LAS 2.0 file. No file upload, storage, or network access occurs here. */
export function parseLas(text: string): LasParseResult {
  if (text.length > LAS_LIMITS.textCharacters) return fail("File exceeds the 5 MB text limit.");
  if (/\0/.test(text)) return fail("Binary content is not supported; provide an ASCII LAS 2.0 file.");

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let version: string | undefined;
  let section = "";
  let inAscii = false;
  let nullSentinel = -999.25;
  const curves: LogCurve[] = [];
  const data: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("~")) {
      const heading = line.slice(1).trim().toUpperCase();
      const head = heading.startsWith("ASCII") || heading === "A" ? "A" : heading[0] ?? "";
      section = head;
      inAscii = head === "A" || head === "ASCII";
      continue;
    }
    if (inAscii) {
      data.push(line);
      if (data.length > LAS_LIMITS.rows) return fail("File exceeds the 250,000 row limit.");
    } else if (section === "V") {
      const match = line.match(/^VERS\s*\.\s*([^\s:]+)/i);
      if (match) version = match[1];
    } else if (section === "W") {
      const match = line.match(/^NULL\s*\.\s*([^\s:]+)/i);
      if (match) {
        const parsed = Number(match[1]);
        if (!Number.isFinite(parsed)) return fail("LAS NULL value is invalid.");
        nullSentinel = parsed;
      }
    } else if (section === "C") {
      const match = line.match(/^([A-Za-z0-9_\-]+)\s*\.\s*([^\s:]*)\s*(?::\s*(.*))?$/);
      if (match) {
        curves.push({ mnemonic: match[1].toUpperCase(), unit: match[2], description: (match[3] ?? "").trim() });
        if (curves.length > LAS_LIMITS.curves) return fail("File exceeds the 256 curve limit.");
      }
    }
  }

  if (!version || !/^2(?:\.0)?$/i.test(version)) return fail("Only LAS 2.0 files are supported.");
  if (!data.length) return fail("LAS file has no ASCII data rows.");
  const depthCandidates = curves.filter((curve) => depthNames.has(curve.mnemonic));
  if (depthCandidates.length !== 1) return fail("A single explicit DEPT or DEPTH curve is required.");
  const depthCurve = depthCandidates[0]!;
  if (!depthCurve.unit) return fail("The depth curve must declare its unit.");
  if (curves.length < 2) return fail("LAS curve section must declare at least one curve besides depth.");

  const rows: ParsedWellLog["rows"] = [];
  const depthIssues: LogDepthIssue[] = [];
  let direction = 0;
  let previousDepth: number | undefined;
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const tokens = data[rowIndex]!.split(/\s+/);
    if (tokens.length !== curves.length) return fail(`Data row ${rowIndex + 1} has ${tokens.length} values; expected ${curves.length}.`);
    const parsedTokens = tokens.map((token) => {
      const value = Number(token);
      return Number.isFinite(value) ? value : Number.NaN;
    });
    const depthIndex = curves.indexOf(depthCurve);
    const depthValue = parsedTokens[depthIndex];
    if (depthValue === null || depthValue === undefined || depthValue === nullSentinel) {
      return fail(`Depth is missing at data row ${rowIndex + 1}.`);
    }
    if (parsedTokens.some((value) => Number.isNaN(value))) return fail(`Data row ${rowIndex + 1} contains a nonnumeric value.`);
    if (previousDepth !== undefined) {
      const delta = depthValue - previousDepth;
      if (delta === 0) depthIssues.push({ row: rowIndex + 1, kind: "duplicate" });
      else if (direction === 0) direction = Math.sign(delta);
      else if (Math.sign(delta) !== direction) depthIssues.push({ row: rowIndex + 1, kind: "nonmonotonic" });
    }
    previousDepth = depthValue;
    rows.push({ depth: depthValue, values: parsedTokens.map((value) => value === nullSentinel ? null : value) });
  }
  return {
    ok: true,
    log: {
      format: "LAS 2.0", curves, depthCurve, depthUnit: depthCurve.unit,
      depthReference: "unknown", verticalDatum: null, rows, depthIssues, nullSentinel,
    },
  };
}
