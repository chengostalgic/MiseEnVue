"use client";

import { useSyncExternalStore } from "react";

export type GenerationKind = "ideas" | "analyze" | "campaign";
export type JobStatus = "idle" | "queued" | "running" | "done" | "error";

export type IdeaDish = {
  name: string;
  sellingPoint?: string;
  why: string;
  spin: string;
  marketingMove: string;
  usesFromKitchen?: string;
  momentum?: string;
};

export type GenerationSnapshot = {
  running: GenerationKind | null;
  jobs: Record<GenerationKind, { status: JobStatus; error: string | null }>;
  ideas: IdeaDish[];
  analyses: Record<string, string>;
  playbooks: Record<string, string>;
};

type Work = { kind: GenerationKind; run: () => Promise<void> };

const KINDS: GenerationKind[] = ["ideas", "analyze", "campaign"];

function emptyJobs(): GenerationSnapshot["jobs"] {
  return {
    ideas: { status: "idle", error: null },
    analyze: { status: "idle", error: null },
    campaign: { status: "idle", error: null },
  };
}

let snapshot: GenerationSnapshot = {
  running: null,
  jobs: emptyJobs(),
  ideas: [],
  analyses: {},
  playbooks: {},
};

const pending: Work[] = [];
let pumping = false;
const listeners = new Set<() => void>();

function emit() {
  snapshot = {
    ...snapshot,
    jobs: { ...snapshot.jobs },
    analyses: { ...snapshot.analyses },
    playbooks: { ...snapshot.playbooks },
    ideas: [...snapshot.ideas],
  };
  listeners.forEach((listener) => listener());
}

function patchJob(kind: GenerationKind, patch: Partial<GenerationSnapshot["jobs"][GenerationKind]>) {
  snapshot.jobs = {
    ...snapshot.jobs,
    [kind]: { ...snapshot.jobs[kind], ...patch },
  };
}

export function subscribeGeneration(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGenerationSnapshot() {
  return snapshot;
}

export function useGenerationJobs() {
  return useSyncExternalStore(subscribeGeneration, getGenerationSnapshot, getGenerationSnapshot);
}

export function jobBusy(kind: GenerationKind, snap: GenerationSnapshot = snapshot) {
  return snap.jobs[kind].status === "running" || snap.jobs[kind].status === "queued";
}

export function queuedKinds(snap: GenerationSnapshot = snapshot) {
  return KINDS.filter((kind) => snap.jobs[kind].status === "queued");
}

export function enqueueGeneration(kind: GenerationKind, run: () => Promise<void>) {
  const existing = pending.findIndex((item) => item.kind === kind);
  if (existing >= 0) pending[existing] = { kind, run };
  else pending.push({ kind, run });

  if (snapshot.running !== kind) {
    patchJob(kind, { status: "queued", error: null });
    emit();
  }

  void pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;

  try {
    while (pending.length) {
      const next = pending.shift();
      if (!next) break;

      snapshot.running = next.kind;
      patchJob(next.kind, { status: "running", error: null });
      emit();

      try {
        await next.run();
        patchJob(next.kind, { status: "done", error: null });
      } catch (err) {
        patchJob(next.kind, {
          status: "error",
          error: err instanceof Error ? err.message : "Generation failed",
        });
      } finally {
        snapshot.running = null;
        emit();
      }
    }
  } finally {
    pumping = false;
  }
}

export function resetKitchenOutputs() {
  snapshot.ideas = [];
  snapshot.analyses = {};
  snapshot.playbooks = {};
  snapshot.jobs = emptyJobs();
  emit();
}

export function setIdeaDishes(dishes: IdeaDish[]) {
  snapshot.ideas = dishes;
  emit();
}

export function setAnalysis(topic: string, text: string) {
  snapshot.analyses = { ...snapshot.analyses, [topic]: text };
  emit();
}

export function setPlaybook(topic: string, text: string) {
  snapshot.playbooks = { ...snapshot.playbooks, [topic]: text };
  emit();
}
