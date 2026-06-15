import { Layers, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  OpeningRangeConfig,
  SessionScope,
  Symbol,
} from "@/lib/opening-ranges";

interface Props {
  configs: OpeningRangeConfig[];
  onChange: (next: OpeningRangeConfig[]) => void;
  onReset: () => void;
  symbol: Symbol;
}

const PALETTE = ["#22d3ee", "#eab308", "#ec4899", "#14b8a6", "#f97316", "#a78bfa"];

function uid() {
  return `or-${Math.random().toString(36).slice(2, 9)}`;
}

export function OpeningRangesPopover({ configs, onChange, onReset, symbol }: Props) {
  const update = (id: string, patch: Partial<OpeningRangeConfig>) =>
    onChange(configs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const remove = (id: string) => onChange(configs.filter((c) => c.id !== id));

  const add = () =>
    onChange([
      ...configs,
      {
        id: uid(),
        label: "New Range",
        start: "09:30",
        durationMin: 2,
        scope: "RTH",
        color: PALETTE[configs.length % PALETTE.length],
        enabled: true,
      },
    ]);

  const activeCount = configs.filter((c) => c.enabled).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Opening Ranges"
        >
          <Layers className="h-3 w-3" />
          Ranges
          <span className="mono text-[10px] text-foreground/80">{activeCount}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="label-xs">Opening Ranges</div>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
        <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1">
          {configs.map((c) => {
            const dimmed = symbol === "SPX" && c.scope === "Globex";
            return (
              <div
                key={c.id}
                className={`flex items-center gap-1.5 rounded border border-border bg-surface-1 px-1.5 py-1 ${
                  dimmed ? "opacity-50" : ""
                }`}
              >
                <Switch
                  checked={c.enabled}
                  onCheckedChange={(v) => update(c.id, { enabled: v })}
                />
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => update(c.id, { color: e.target.value })}
                  className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                  aria-label="zone color"
                />
                <Input
                  value={c.label}
                  onChange={(e) => update(c.id, { label: e.target.value })}
                  className="h-7 flex-1 text-[11px]"
                />
                <Input
                  type="time"
                  value={c.start}
                  onChange={(e) => update(c.id, { start: e.target.value })}
                  className="mono h-7 w-[88px] text-[11px]"
                />
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={c.durationMin}
                  onChange={(e) =>
                    update(c.id, { durationMin: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="mono h-7 w-14 text-[11px]"
                  aria-label="minutes"
                />
                <Select
                  value={c.scope}
                  onValueChange={(v) => update(c.id, { scope: v as SessionScope })}
                >
                  <SelectTrigger className="h-7 w-[86px] text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Both">Both</SelectItem>
                    <SelectItem value="RTH">RTH</SelectItem>
                    <SelectItem value="Globex">Globex</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => remove(c.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="delete zone"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={add}>
            <Plus className="mr-1 h-3 w-3" /> Add zone
          </Button>
          {symbol === "SPX" && (
            <span className="text-[10px] text-muted-foreground">SPX = RTH only</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
