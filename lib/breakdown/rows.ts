// How the breakdown groups box-score events into chart rows.
import type { Attribution, EventKey } from "@/lib/breakdown/engine";

export type Side = "offense" | "defense";

export type Row = {
  key: string;
  label: string;
  side: Side;
  events: EventKey[];
  /** What one event is called, for "+0.016 per make". Null for the floor-time row. */
  unit: string | null;
  /** Counts shown in the detail, e.g. "431 of 730". */
  count: (c: Attribution["counts"]) => string;
};

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const of = (made: number, missed: number) => `${n(made)} of ${n(made + missed)}`;

const FLOOR: Row = { key: "floor", label: "Floor time", side: "defense", events: [], unit: null, count: () => "" };

/** Makes and misses together: the default view. */
export const NET_ROWS: Row[] = [
  { key: "two", label: "Two-pointers", side: "offense", events: ["fg2", "fg2Miss"], unit: "attempt", count: (c) => of(c.fg2, c.fg2Miss) },
  { key: "three", label: "Three-pointers", side: "offense", events: ["fg3", "fg3Miss"], unit: "attempt", count: (c) => of(c.fg3, c.fg3Miss) },
  { key: "ft", label: "Free throws", side: "offense", events: ["ft", "ftMiss"], unit: "attempt", count: (c) => of(c.ft, c.ftMiss) },
  { key: "ast", label: "Assists", side: "offense", events: ["ast"], unit: "assist", count: (c) => n(c.ast) },
  { key: "orb", label: "Offensive boards", side: "offense", events: ["orb"], unit: "board", count: (c) => n(c.orb) },
  { key: "tov", label: "Turnovers", side: "offense", events: ["tov"], unit: "turnover", count: (c) => n(c.tov) },
  { key: "drb", label: "Defensive boards", side: "defense", events: ["drb"], unit: "board", count: (c) => n(c.drb) },
  { key: "blk", label: "Blocks", side: "defense", events: ["blk"], unit: "block", count: (c) => n(c.blk) },
  { key: "stl", label: "Steals", side: "defense", events: ["stl"], unit: "steal", count: (c) => n(c.stl) },
  { key: "pf", label: "Fouls", side: "defense", events: ["pf"], unit: "foul", count: (c) => n(c.pf) },
  FLOOR,
];

const single = (key: EventKey, label: string, side: Side, unit: string): Row => ({
  key,
  label,
  side,
  events: [key],
  unit,
  count: (c) => n(c[key]),
});

/** Makes and misses on their own rows. */
export const SPLIT_ROWS: Row[] = [
  single("fg2", "Twos made", "offense", "make"),
  single("fg2Miss", "Twos missed", "offense", "miss"),
  single("fg3", "Threes made", "offense", "make"),
  single("fg3Miss", "Threes missed", "offense", "miss"),
  single("ft", "Free throws made", "offense", "make"),
  single("ftMiss", "Free throws missed", "offense", "miss"),
  ...NET_ROWS.filter((r) => ["ast", "orb", "tov", "drb", "blk", "stl", "pf", "floor"].includes(r.key)),
];

export const rowValue = (row: Row, a: Attribution) =>
  row.key === "floor" ? a.floor : row.events.reduce((s, k) => s + a.parts[k], 0);

export const rowCount = (row: Row, a: Attribution) => row.events.reduce((s, k) => s + a.counts[k], 0);

export const NOTES: Record<string, string> = {
  floor:
    "Defensive credit for minutes on the court while the team defends, before any box-score stat. Good team defense makes it positive.",
  pf: "Fouls barely register. The formula only hands the fouler a share of the stops when opponents miss their free throws.",
};
