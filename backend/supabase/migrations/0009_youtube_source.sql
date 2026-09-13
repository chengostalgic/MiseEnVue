-- The live ingest path is YouTube-first. signal_source was designed before
-- that swap; add the value so ingest_runs / raw_signals / trend_signals can
-- store the real provider instead of stuffing it into `manual`.

alter type signal_source add value if not exists 'youtube';
