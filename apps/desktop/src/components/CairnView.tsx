import { useMemo, useState } from "react";
import type { StoneRecord, StoneStatus } from "../lib/cairn.js";
import { buildChains, countByStatus, surfacesOf } from "../lib/cairn.js";
import { relativeTime, shortId } from "../lib/format.js";
import { Empty, FilterChip, FilterGroup, StatusMark, SurfaceTag, ViewHeader } from "./bits.js";

const STATUS_FILTERS: (StoneStatus | "all")[] = [
  "all",
  "draft",
  "proven",
  "broken",
  "escalated",
  "retired",
];

/** The registry itself: every stone, with its lineage kept visually intact. */
export function CairnView({
  stones,
  selectedId,
  pulsing,
  onOpen,
}: {
  stones: StoneRecord[];
  selectedId: string | null;
  pulsing: Set<string>;
  onOpen: (id: string) => void;
}): JSX.Element {
  const [status, setStatus] = useState<StoneStatus | "all">("all");
  const [surface, setSurface] = useState<string>("all");

  const counts = countByStatus(stones);
  const surfaces = useMemo(() => surfacesOf(stones), [stones]);
  const chains = useMemo(() => buildChains(stones), [stones]);

  const matches = (record: StoneRecord): boolean => {
    if (surface !== "all" && record.stone.surface !== surface) return false;
    if (status === "all") return record.stone.status !== "retired";
    return record.stone.status === status;
  };

  const visible = chains.filter((chain) => chain.stones.some(matches));

  return (
    <>
      <ViewHeader
        title="Cairn"
        subtitle={`${stones.length} stone${stones.length === 1 ? "" : "s"} · ${counts.proven} proven · ${counts.broken} broken · ${counts.escalated} escalated`}
        tools={
          <>
            <FilterGroup>
              {STATUS_FILTERS.map((option) => (
                <FilterChip
                  key={option}
                  active={status === option}
                  onClick={() => {
                    setStatus(option);
                  }}
                  count={option === "all" ? stones.length : counts[option]}
                >
                  {option === "all" ? null : <StatusMark status={option} />}
                  {option}
                </FilterChip>
              ))}
            </FilterGroup>
            {surfaces.length > 0 ? (
              <FilterGroup>
                <FilterChip
                  active={surface === "all"}
                  onClick={() => {
                    setSurface("all");
                  }}
                >
                  every surface
                </FilterChip>
                {surfaces.map((name) => (
                  <FilterChip
                    key={name}
                    active={surface === name}
                    onClick={() => {
                      setSurface(name);
                    }}
                  >
                    {name}
                  </FilterChip>
                ))}
              </FilterGroup>
            ) : null}
          </>
        }
      />
      <div className="view-body">
        {visible.length === 0 ? (
          <Empty
            title={stones.length === 0 ? "The cairn is empty" : "No stone matches that filter"}
            hint={
              stones.length === 0
                ? "Stones appear as cairn-mason extracts intents into .cairn/stones."
                : undefined
            }
          />
        ) : (
          <div className="stone-list">
            {visible.map((chain) => {
              const [head, ...ancestors] = chain.stones;
              if (!head) return null;
              if (ancestors.length === 0) {
                return (
                  <StoneItem
                    key={head.stone.id}
                    record={head}
                    selected={head.stone.id === selectedId}
                    pulse={pulsing.has(head.stone.id)}
                    onOpen={onOpen}
                  />
                );
              }
              return (
                <div className="lineage-group" key={head.stone.id}>
                  <StoneItem
                    record={head}
                    selected={head.stone.id === selectedId}
                    pulse={pulsing.has(head.stone.id)}
                    onOpen={onOpen}
                  />
                  <div className="lineage">
                    <span className="lineage-label">amends</span>
                    {ancestors.map((record) => (
                      <StoneItem
                        key={record.stone.id}
                        record={record}
                        selected={record.stone.id === selectedId}
                        pulse={false}
                        onOpen={onOpen}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function StoneItem({
  record,
  selected,
  pulse,
  onOpen,
}: {
  record: StoneRecord;
  selected: boolean;
  pulse: boolean;
  onOpen: (id: string) => void;
}): JSX.Element {
  const { stone } = record;
  return (
    <button
      type="button"
      className={`stone-item is-${stone.status} ${selected ? "selected" : ""}`}
      onClick={() => {
        onOpen(stone.id);
      }}
    >
      <StatusMark status={stone.status} pulse={pulse} />
      <span className="stone-title">{stone.title}</span>
      <span className="stone-meta">
        {/* the glyph never travels alone in a dense list */}
        <span className="stone-status">{stone.status}</span>
        <SurfaceTag surface={stone.surface} />
        <span className="id-mono">{shortId(stone.id)}</span>
        <span style={{ minWidth: 62, textAlign: "right" }}>
          {stone.lastGreen ? `green ${relativeTime(stone.lastGreen.at)}` : relativeTime(stone.createdAt)}
        </span>
      </span>
    </button>
  );
}
