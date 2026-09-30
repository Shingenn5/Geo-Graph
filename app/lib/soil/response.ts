/** Accept only the requested SDA table shape; a broken response is not no coverage. */
export function parseSoilTable(value: unknown): Record<string, string | null>[] {
  if (!value || typeof value !== "object" || !("Table" in value) || !Array.isArray(value.Table)) {
    throw new Error("Missing soil table");
  }
  const [headers, ...rows] = value.Table;
  // The query is anchored by COUNT(*), so even no coverage has a typed row.
  // SDA's otherwise ambiguous empty {} response must not become a negative finding.
  if (!Array.isArray(headers) || !headers.length ||
      !headers.every(column => typeof column === "string" && column.length > 0) ||
      new Set(headers).size !== headers.length ||
      !["mukey", "muname", "chkey", "floodingfrequency", "pondingfrequency", "surveymatchcount"].every(column => headers.includes(column)) || !rows.length) {
    throw new Error("Invalid soil columns");
  }
  return rows.map(row => {
    if (!Array.isArray(row) || row.length !== headers.length ||
        !row.every(cell => cell === null || typeof cell === "string")) {
      throw new Error("Invalid soil row");
    }
    const record = Object.fromEntries(headers.map((column, index) => [column, row[index]]));
    if (record.surveymatchcount === "0" && rows.length === 1 &&
        Object.entries(record).every(([key, cell]) => key === "surveymatchcount" || cell === null)) return null;
    if (!record.mukey || !Number.isInteger(Number(record.surveymatchcount)) || Number(record.surveymatchcount) < 1) {
      throw new Error("Missing map unit identity or match count");
    }
    return record;
  }).filter((row): row is Record<string, string | null> => row !== null);
}
