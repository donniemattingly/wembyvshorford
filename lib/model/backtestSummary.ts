import backtest from "@/lib/model/backtest.json";

export type BacktestLine = {
  label: string;
  detail: string;
  cases: number;
  miss: number;
  lean: number;
  hit: number | null;
};

export const backtestLines = (): BacktestLine[] => {
  const line = (label: string, detail: string, group: typeof backtest.stars): BacktestLine => ({
    label,
    detail,
    cases: group.rest.model.n,
    miss: group.rest.model.mae,
    lean: group.rest.model.bias,
    hit: group.rest.model.coverage ?? null,
  });
  return [
    line("EARLY STARS", ".150+ WS/48 in his third season, age 24 or under", backtest.stars),
    line("ELITE YOUNG PLAYERS", ".190+ WS/48 or +6 BPM, age 23 or under", backtest.elite),
    line("ALL-TIME GREATS", "the 60 best careers since 1965, picked knowing how they ended", backtest.greats),
  ];
};

export const backtestNotes = () => {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const elite100 = backtest.tails.elite[2];
  const stars = backtest.stars.next5;
  return [
    `Its odds hold up. Elite young players were given a ${pct(elite100.predicted)} chance, on average, of 100 or more further Win Shares, and ${pct(elite100.actual)} got there.`,
    `Over the next five seasons it missed early stars by ${stars.model.mae.toFixed(1)} Win Shares on average. Repeating the last season, the method this page used before, missed by ${stars.repeat.mae.toFixed(1)} and ran ${stars.repeat.bias.toFixed(1)} high.`,
    `The greats run low because they were picked knowing how their careers went. Malone, Stockton and Nash looked ordinary after three seasons, and no one could have projected what came next.`,
  ];
};
