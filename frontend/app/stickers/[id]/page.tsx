"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ModulePageHeader from "@/components/ModulePageHeader";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";
import Switch from "@/components/ui/Switch";
import { Field, Group, Row } from "@/components/ui/Grouped";
import { useToast } from "@/components/Toast";
import ColorEditor, { Swatch } from "@/components/stickers/ColorEditor";
import { subscribeLive } from "@/lib/live";
import { BADGE } from "@/lib/palette";
import { confirmDelete } from "@/lib/confirmDelete";
import { useAuth } from "@/lib/self";
import { undoDelete } from "@/lib/undo";
import {
  COLOR_HEX,
  ColorKey,
  Grid,
  PREFS,
  REGIONS,
  StickerColor,
  StickerCount,
  Survey,
  colorTotal,
  deleteSurvey,
  getSurvey,
  grandTotal,
  patchSurvey,
  prefTotal,
  resetSurvey,
  shortPref,
  tap,
  undoTap,
} from "@/lib/stickersApi";
import { saveStickerCsv, saveStickerPdf } from "@/lib/stickerExport";

type Tab = "count" | "table";

const errMsg = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const cellKey = (pref: string, color: string) => `${pref}|${color}`;

function newTapId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// ---------------------------------------------------------------------------
// 数（サーバーの値 + 送信中の分）。押したらすぐ画面に反映し、サーバーの値で確定させる
// ---------------------------------------------------------------------------
function useSurveyCounts(id: string) {
  const toast = useToast();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [missing, setMissing] = useState(false);
  const [server, setServer] = useState<Grid>({});
  const [pending, setPending] = useState<Record<string, number>>({});
  const stamps = useRef<Record<string, string>>({});
  const inflight = useRef<Map<string, string>>(new Map()); // tap_id → cellKey

  const applyRow = useCallback((row: StickerCount) => {
    const key = cellKey(row.pref, row.color);
    const ts = row.updated_at ?? "";
    // 届く順番が前後しても古い値で上書きしない
    if (ts && stamps.current[key] && ts < stamps.current[key]) return;
    if (ts) stamps.current[key] = ts;
    setServer((g) => ({ ...g, [row.pref]: { ...g[row.pref], [row.color]: row.count } }));
  }, []);

  const settle = useCallback((tapId: string | null | undefined) => {
    if (!tapId) return;
    const key = inflight.current.get(tapId);
    if (!key) return;
    inflight.current.delete(tapId);
    setPending((p) => ({ ...p, [key]: Math.max(0, (p[key] ?? 0) - 1) }));
  }, []);

  const load = useCallback(() => {
    getSurvey(id)
      .then(({ survey, counts }) => {
        setSurvey(survey);
        const g: Grid = {};
        const st: Record<string, string> = {};
        for (const c of counts) {
          (g[c.pref] ??= {})[c.color] = c.count;
          if (c.updated_at) st[cellKey(c.pref, c.color)] = c.updated_at;
        }
        stamps.current = st;
        setServer(g);
      })
      .catch((err) => {
        if (String(err?.message ?? "").includes("見つかりません")) setMissing(true);
        else toast.error(errMsg(err, "読み込めませんでした"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
    const offs = [
      subscribeLive(
        "sticker_counts",
        (ev, row) => {
          if (String(row.survey_id) !== id) return;
          if (ev === "DELETE" && row.reset) {
            stamps.current = {};
            setServer({});
            return;
          }
          settle(row.tap_id as string | undefined);
          applyRow(row as unknown as StickerCount);
        },
        load
      ),
      subscribeLive("sticker_surveys", (ev, row) => {
        if (String(row.id) !== id) return;
        if (ev === "DELETE") setMissing(true);
        else setSurvey(row as unknown as Survey);
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [id, load, applyRow, settle]);

  const grid = useMemo(() => {
    const g: Grid = {};
    for (const p of PREFS) {
      const row = { ...server[p] };
      for (const [k, n] of Object.entries(pending)) {
        if (!n) continue;
        const [pref, color] = k.split("|");
        if (pref === p) row[color as ColorKey] = (row[color as ColorKey] ?? 0) + n;
      }
      if (Object.keys(row).length) g[p] = row;
    }
    return g;
  }, [server, pending]);

  const count = useCallback(
    (pref: string, color: ColorKey) => {
      const key = cellKey(pref, color);
      const tapId = newTapId();
      inflight.current.set(tapId, key);
      setPending((p) => ({ ...p, [key]: (p[key] ?? 0) + 1 }));
      tap(id, pref, color, tapId)
        .then((row) => {
          settle(tapId);
          applyRow(row);
        })
        .catch((err) => {
          settle(tapId);
          toast.error(errMsg(err, "記録できませんでした"));
        });
    },
    [id, applyRow, settle, toast]
  );

  const undo = useCallback(
    () =>
      undoTap(id)
        .then((row) => {
          applyRow(row);
          return row;
        })
        .catch((err) => {
          toast.error(errMsg(err, "取り消せませんでした"));
          return null;
        }),
    [id, applyRow, toast]
  );

  return { survey, setSurvey, missing, grid, count, undo, reload: load };
}

// ---------------------------------------------------------------------------
// 数える
// ---------------------------------------------------------------------------
function ColorBar({
  colors,
  grid,
  selected,
  onSelect,
  onUndo,
  undoing,
  disabled,
}: {
  colors: StickerColor[];
  grid: Grid;
  selected: ColorKey;
  onSelect: (c: ColorKey) => void;
  onUndo: () => void;
  undoing: boolean;
  disabled: boolean;
}) {
  return (
    <div className="sticky top-12 z-20 -mx-4 mb-3 border-b border-separator bg-grouped/90 px-4 pb-3 pt-2 backdrop-blur-xl md:top-14 md:-mx-8 md:px-8">
      <div
        role="radiogroup"
        aria-label="シールの色"
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(colors.length, 4)}, minmax(0, 1fr))` }}
      >
        {colors.map((c) => {
          const active = c.key === selected;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(c.key)}
              className={`flex min-w-0 flex-col items-center justify-center rounded-xl px-1 py-2 text-white transition-transform active:scale-95 ${
                active ? "ring-[3px] ring-label ring-offset-2 ring-offset-grouped" : "opacity-80"
              }`}
              style={{ background: COLOR_HEX[c.key] }}
            >
              <span className="max-w-full truncate text-[13px] font-semibold drop-shadow-sm">{c.label}</span>
              <span className="tabular-nums text-[22px] font-bold leading-tight drop-shadow-sm">{colorTotal(grid, c.key)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[15px]">
          合計 <span className="tabular-nums text-[17px] font-bold">{grandTotal(grid).toLocaleString()}</span> 枚
        </p>
        <button type="button" className="ios-btn-gray px-3 py-1.5 text-[14px]" onClick={onUndo} disabled={undoing || disabled}>
          ↶ 自分の直前を取り消す
        </button>
      </div>
    </div>
  );
}

function PrefGrid({
  grid,
  colors,
  selected,
  disabled,
  onTap,
}: {
  grid: Grid;
  colors: StickerColor[];
  selected: ColorKey;
  disabled: boolean;
  onTap: (pref: string) => void;
}) {
  const [flash, setFlash] = useState<{ pref: string; n: number } | null>(null);
  return (
    <div className="space-y-4">
      {REGIONS.map((r) => (
        <section key={r.name}>
          <h2 className="mb-1.5 px-1 text-[13px] text-label-2">{r.name}</h2>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
            {r.prefs.map((p) => {
              const total = prefTotal(grid, p);
              const mine = grid[p]?.[selected] ?? 0;
              return (
                <button
                  key={flash?.pref === p ? `${p}-${flash.n}` : p}
                  type="button"
                  disabled={disabled}
                  aria-label={`${p}（${total}）`}
                  onClick={() => {
                    onTap(p);
                    setFlash((f) => ({ pref: p, n: (f?.n ?? 0) + 1 }));
                    try {
                      navigator.vibrate?.(8);
                    } catch {
                      // 振動に対応していない端末
                    }
                  }}
                  className={`relative flex min-h-[58px] flex-col items-center justify-center rounded-xl bg-card px-1 py-1.5 active:bg-fill disabled:opacity-50 ${
                    flash?.pref === p ? "animate-tap-pop" : ""
                  } ${p === "福島県" ? "ring-1 ring-accent/40" : ""}`}
                >
                  <span className="text-[15px] font-semibold leading-tight">{shortPref(p)}</span>
                  <span className="tabular-nums text-[12px] text-label-2">
                    {total}
                    {mine > 0 && total !== mine && (
                      <span className="ml-1 font-semibold" style={{ color: COLOR_HEX[selected] }}>
                        ({mine})
                      </span>
                    )}
                  </span>
                  {total > 0 && (
                    <span className="absolute inset-x-2 bottom-1 flex h-1 overflow-hidden rounded-full" aria-hidden>
                      {colors.map((c) =>
                        grid[p]?.[c.key] ? (
                          <span key={c.key} style={{ flexGrow: grid[p]![c.key], background: COLOR_HEX[c.key] }} />
                        ) : null
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 集計表
// ---------------------------------------------------------------------------
function TopChart({ grid, colors }: { grid: Grid; colors: StickerColor[] }) {
  const top = PREFS.map((p) => ({ p, total: prefTotal(grid, p) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  if (top.length === 0) return null;
  const max = top[0].total;
  return (
    <section className="mb-6 rounded-2xl bg-card p-4">
      <h2 className="mb-3 text-[15px] font-semibold">多い都道府県</h2>
      <ol className="space-y-1.5">
        {top.map(({ p, total }, i) => (
          <li key={p} className="grid grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-[13px]">
            <span className="tabular-nums text-label-3">{i + 1}</span>
            <span className="truncate font-medium">{shortPref(p)}</span>
            <span className="flex h-3.5 overflow-hidden rounded-full bg-fill" style={{ width: `${Math.max(4, (total / max) * 100)}%` }}>
              {colors.map((c) =>
                grid[p]?.[c.key] ? <span key={c.key} style={{ flexGrow: grid[p]![c.key], background: COLOR_HEX[c.key] }} /> : null
              )}
            </span>
            <span className="tabular-nums text-right font-semibold">{total}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {colors.map((c) => (
          <span key={c.key} className="flex items-center gap-1 text-[12px] text-label-2">
            <Swatch color={c.key} size={8} />
            {c.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function TablePanel({ survey, grid }: { survey: Survey; grid: Grid }) {
  const toast = useToast();
  const [includeZero, setIncludeZero] = useState(false);
  const colors = survey.colors;
  const rows = PREFS.filter((p) => includeZero || prefTotal(grid, p) > 0);

  const save = async (fn: () => Promise<string>) => {
    try {
      if ((await fn()) !== "cancelled") toast.success("保存しました");
    } catch (err) {
      toast.error(errMsg(err, "保存できませんでした"));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] text-label-2">集計表</h2>
          <label className="flex items-center gap-2 text-[13px] text-label-2">
            0件も表示
            <Switch checked={includeZero} onChange={setIncludeZero} label="0件も表示" />
          </label>
        </div>
        <div className="overflow-x-auto rounded-2xl bg-card">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-separator text-[12px] text-label-2">
                <th className="px-3 py-2 text-left font-medium">都道府県</th>
                {colors.map((c) => (
                  <th key={c.key} className="px-2 py-2 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Swatch color={c.key} size={8} />
                      {c.label}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">計</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={colors.length + 2} className="px-3 py-6 text-center text-label-2">
                    まだ数えていません
                  </td>
                </tr>
              )}
              {rows.map((p) => {
                const total = prefTotal(grid, p);
                return (
                  <tr key={p} className={`border-b border-separator last:border-0 ${total === 0 ? "text-label-3" : ""}`}>
                    <td className="px-3 py-1.5 font-medium">{p}</td>
                    {colors.map((c) => (
                      <td key={c.key} className="tabular-nums px-2 py-1.5 text-center">
                        {grid[p]?.[c.key] ?? 0}
                      </td>
                    ))}
                    <td className="tabular-nums px-3 py-1.5 text-center font-semibold">{total}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-separator bg-accent-soft font-semibold text-accent-ink">
                <td className="px-3 py-2">合計</td>
                {colors.map((c) => (
                  <td key={c.key} className="tabular-nums px-2 py-2 text-center">
                    {colorTotal(grid, c.key)}
                  </td>
                ))}
                <td className="tabular-nums px-3 py-2 text-center">{grandTotal(grid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div>
        <TopChart grid={grid} colors={colors} />
        <Group title="書き出し">
          <Row onClick={() => save(() => saveStickerPdf(survey, grid, includeZero))}>
            <span className="text-accent">PDFで保存{includeZero ? "（全都道府県）" : "（0件を除く）"}</span>
          </Row>
          <Row onClick={() => save(() => saveStickerCsv(survey, includeZero))}>
            <span className="text-accent">CSVで保存{includeZero ? "（全都道府県）" : "（0件を除く）"}</span>
          </Row>
        </Group>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------
function SettingsSheet({
  survey,
  grid,
  open,
  onClose,
  onSurvey,
}: {
  survey: Survey;
  grid: Grid;
  open: boolean;
  onClose: () => void;
  onSurvey: (s: Survey) => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const { me } = useAuth();
  const [f, setF] = useState({ title: "", survey_date: "", location: "" });
  const [colors, setColors] = useState<StickerColor[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({ title: survey.title, survey_date: survey.survey_date ?? "", location: survey.location ?? "" });
    setColors(survey.colors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const locked = survey.colors.map((c) => c.key).filter((k) => colorTotal(grid, k) > 0);
  const canReset = me.role === "admin" || survey.created_by === me.name;
  const valid = f.title.trim() && colors.length > 0 && colors.every((c) => c.label.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const s = await patchSurvey(survey.id, {
        title: f.title.trim(),
        survey_date: f.survey_date || null,
        location: f.location.trim() || null,
        colors: colors.map((c) => ({ ...c, label: c.label.trim() })),
      });
      onSurvey(s);
      onClose();
    } catch (err) {
      toast.error(errMsg(err, "保存できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="集計の設定"
      leading={
        <button type="button" className="ios-btn-plain" onClick={onClose}>
          キャンセル
        </button>
      }
      trailing={
        <button type="submit" form="edit-survey" className="ios-btn-plain font-semibold" disabled={busy || !valid}>
          保存
        </button>
      }
    >
      <form id="edit-survey" onSubmit={submit} className="space-y-4">
        <Field label="名前" required>
          <input className="ios-input bg-card" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className="ios-input bg-card" value={f.survey_date} onChange={(e) => setF({ ...f, survey_date: e.target.value })} />
          </Field>
          <Field label="場所">
            <input className="ios-input bg-card" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          </Field>
        </div>
        <Field label="色と意味" group>
          <ColorEditor value={colors} onChange={setColors} locked={locked} />
        </Field>
      </form>

      <div className="mt-6">
        <Group>
          {canReset && (
            <Row
              destructive
              onClick={() => {
                if (!confirm(`「${survey.title}」の数をすべて0に戻します。元に戻せません。よろしいですか？`)) return;
                resetSurvey(survey.id)
                  .then(() => {
                    toast.success("リセットしました");
                    onClose();
                  })
                  .catch((err) => toast.error(errMsg(err, "リセットできませんでした")));
              }}
            >
              数をすべてリセット
            </Row>
          )}
          <Row
            destructive
            onClick={() => {
              if (!confirmDelete(survey.title)) return;
              deleteSurvey(survey.id)
                .then(() => {
                  toast.success(`「${survey.title}」をゴミ箱に移しました`, undoDelete("sticker_surveys", survey.id));
                  router.push("/stickers");
                })
                .catch((err) => toast.error(errMsg(err, "削除できませんでした")));
            }}
          >
            この集計をゴミ箱に移す
          </Row>
        </Group>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------
export default function StickerSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { survey, setSurvey, missing, grid, count, undo } = useSurveyCounts(id);
  const [tab, setTab] = useState<Tab>("count");
  const [selected, setSelected] = useState<ColorKey>("red");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);

  // 選択中の色が集計から外れたら先頭の色にする
  useEffect(() => {
    if (survey && !survey.colors.some((c) => c.key === selected)) setSelected(survey.colors[0]?.key ?? "red");
  }, [survey, selected]);

  if (missing)
    return (
      <div className="mx-auto max-w-3xl">
        <ModulePageHeader title="シール集計" back={{ href: "/stickers", label: "シール集計" }} />
        <p className="text-[15px] text-label-2">見つかりません（削除された可能性があります）</p>
      </div>
    );
  if (!survey) return <p className="text-[15px] text-label-3">読み込み中...</p>;

  const done = survey.status === "done";

  return (
    <div className="mx-auto max-w-7xl">
      <ModulePageHeader
        title={survey.title}
        back={{ href: "/stickers", label: "シール集計" }}
        actions={
          <>
            <button type="button" className="ios-btn-gray px-3" onClick={() => setSettingsOpen(true)}>
              設定
            </button>
            <button
              type="button"
              className="ios-btn-gray px-3"
              onClick={() =>
                patchSurvey(survey.id, { status: done ? "active" : "done" })
                  .then(setSurvey)
                  .catch((err) => toast.error(errMsg(err, "更新できませんでした")))
              }
            >
              {done ? "再開" : "終了にする"}
            </button>
          </>
        }
      />
      <p className="-mt-4 mb-4 text-[15px] text-label-2">
        {[survey.survey_date, survey.location].filter(Boolean).join(" · ") || "—"}
        {done && <span className={`ml-2 rounded-sm px-1.5 py-0.5 text-[12px] font-semibold ${BADGE.gray}`}>終了</span>}
      </p>

      <Segmented<Tab>
        className="mb-3 w-full max-w-md"
        value={tab}
        onChange={setTab}
        ariaLabel="表示"
        options={[
          { value: "count", label: "数える" },
          { value: "table", label: "集計表" },
        ]}
      />

      {tab === "count" && (
        <>
          <ColorBar
            colors={survey.colors}
            grid={grid}
            selected={selected}
            onSelect={setSelected}
            undoing={undoing}
            disabled={done}
            onUndo={() => {
              setUndoing(true);
              undo()
                .then((row) => {
                  if (row) toast.success(`${row.pref}（${survey.colors.find((c) => c.key === row.color)?.label ?? row.color}）を1枚取り消しました`);
                })
                .finally(() => setUndoing(false));
            }}
          />
          {done && (
            <p className="mb-3 rounded-xl bg-p-gray px-3 py-2 text-[14px] text-p-gray-ink">終了した集計です。数えるには「再開」を押してください</p>
          )}
          <PrefGrid grid={grid} colors={survey.colors} selected={selected} disabled={done} onTap={(p) => count(p, selected)} />
        </>
      )}
      {tab === "table" && <TablePanel survey={survey} grid={grid} />}

      <SettingsSheet survey={survey} grid={grid} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSurvey={setSurvey} />
    </div>
  );
}
