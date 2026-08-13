"""Command line entry point: benchmark | validate | run | merge."""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

import pandas as pd
import structlog

from llm_fill.benchmark import run_benchmark
from llm_fill.eval_harness import (
    FieldMetrics,
    district_median_baseline,
    load_ground_truth,
    run_evaluation,
)
from llm_fill.merge import merge_to_file
from llm_fill.pipeline import run_pipeline
from llm_fill.types import ALL_TARGETS, OllamaConfig, RunConfig, TargetField

DEFAULT_HOST = "http://localhost:11434"
DEFAULT_MODEL = "gemma4:26b"
DEFAULT_WORK_QUEUE = Path("data/work_queue.parquet")
DEFAULT_CHECKPOINT_SOURCE = Path("data/checkpoint_pre_pipeline.parquet")
DEFAULT_EXTRACTION_DIR = Path("data/llm_extractions")
DEFAULT_OUTPUT = Path("data/real_estate_filled.parquet")


def configure_logging(verbose: bool) -> None:
    structlog.configure(
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.INFO if verbose else logging.WARNING
        ),
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ],
    )


def build_ollama_config(args: argparse.Namespace) -> OllamaConfig:
    return OllamaConfig(
        host=args.host,
        model=args.model,
        temperature=0.0,
        seed=42,
        num_ctx=args.num_ctx,
        num_predict=400,
        timeout_seconds=args.timeout,
        max_attempts=args.max_attempts,
    )


def _format_metrics(metrics: tuple[FieldMetrics, ...]) -> str:
    header = (
        f"{'field':<14}{'n':>6}{'attempt':>9}{'cover':>8}{'exact':>8}"
        f"{'±1':>8}{'MAE':>8}{'±5m':>8}{'prec':>8}{'F1':>8}{'gate':>8}"
    )
    lines = [header, "-" * len(header)]
    for m in metrics:
        def fmt(value: float | None, digits: int) -> str:
            return "-" if value is None else f"{value:.{digits}f}"

        lines.append(
            f"{m.field.value:<14}{m.sampled:>6}{m.attempted:>9}"
            f"{m.coverage:>8.2f}{fmt(m.exact_match, 3):>8}{fmt(m.off_by_one, 3):>8}"
            f"{fmt(m.mae, 2):>8}{fmt(m.within_tolerance, 3):>8}"
            f"{fmt(m.precision, 3):>8}{fmt(m.f1, 3):>8}"
            f"{'PASS' if m.passed_gate else 'FAIL':>8}"
        )
    return "\n".join(lines)


def cmd_benchmark(args: argparse.Namespace) -> int:
    results = run_benchmark(
        work_queue_path=args.work_queue,
        base_config=build_ollama_config(args),
        models=tuple(args.models),
        concurrencies=tuple(args.concurrencies),
        sample_size=args.n,
        seed=args.seed,
    )
    header = (
        f"{'model':<18}{'conc':>6}{'rows':>7}{'elapsed_s':>11}"
        f"{'rows/s':>9}{'mean_ms':>10}{'full_run_h':>12}"
    )
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r.model:<18}{r.concurrency:>6}{r.rows:>7}{r.elapsed_seconds:>11.1f}"
            f"{r.rows_per_second:>9.2f}{r.mean_latency_ms:>10.0f}"
            f"{r.projected_full_queue_hours:>12.1f}"
        )
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    fields = (
        ALL_TARGETS
        if not args.fields
        else tuple(TargetField(f) for f in args.fields)
    )
    metrics, detail = run_evaluation(
        checkpoint_path=args.source,
        fields=fields,
        sample_size=args.n,
        seed=args.seed,
        config=build_ollama_config(args),
        concurrency=args.concurrency,
    )
    print(f"\nmodel: {args.model}   sample: {args.n}/field   seed: {args.seed}\n")
    print(_format_metrics(metrics))

    frame = load_ground_truth(args.source)
    print("\ndistrict-median baseline (same rows, medians from held-out data)")
    print(f"{'field':<14}{'exact':>8}{'MAE':>8}{'±5m':>8}")
    print("-" * 38)
    for field in (TargetField.AGE, TargetField.STREET_WIDTH):
        if field not in fields:
            continue
        ids = frozenset(
            int(i) for i in detail.loc[detail["field"] == field.value, "id"]
        )
        exact, mae, within = district_median_baseline(frame, field, ids)
        print(f"{field.value:<14}{exact:>8.3f}{mae:>8.2f}{within:>8.3f}")

    if args.detail_out:
        detail.to_parquet(args.detail_out, index=False)
        print(f"\nper-row detail -> {args.detail_out}")

    failed = [m.field.value for m in metrics if not m.passed_gate]
    if failed:
        print(f"\ngates FAILED: {', '.join(failed)} (excluded from auto-fill)")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    config = RunConfig(
        ollama=build_ollama_config(args),
        work_queue_path=args.work_queue,
        checkpoint_dir=args.checkpoint_dir,
        concurrency=args.concurrency,
        flush_every=args.flush_every,
        consecutive_connection_error_limit=20,
        limit=args.limit,
    )
    processed = asyncio.run(run_pipeline(config))
    print(f"processed {processed:,} rows -> {args.checkpoint_dir}")
    return 0


def cmd_merge(args: argparse.Namespace) -> int:
    trusted = frozenset(TargetField(f) for f in args.trusted_fields)
    output = merge_to_file(
        checkpoint_path=args.source,
        extraction_dir=args.checkpoint_dir,
        output_path=args.output,
        trusted_fields=trusted,
    )
    frame = pd.read_parquet(output)
    print(f"wrote {len(frame):,} rows -> {output}")
    for field in ALL_TARGETS:
        counts = frame[f"{field.value}_extraction_status"].value_counts()
        print(f"\n{field.value}:")
        print(counts.to_string())
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="llm-fill")
    parser.add_argument("--host", type=str, default=DEFAULT_HOST)
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL)
    parser.add_argument("--num-ctx", type=int, default=2048)
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--max-attempts", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--quiet", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    bench = sub.add_parser("benchmark", help="measure throughput")
    bench.add_argument("--work-queue", type=Path, default=DEFAULT_WORK_QUEUE)
    bench.add_argument("--n", type=int, default=100)
    bench.add_argument("--models", nargs="+", default=[DEFAULT_MODEL])
    bench.add_argument("--concurrencies", nargs="+", type=int, default=[4, 8, 16])
    bench.set_defaults(func=cmd_benchmark)

    validate = sub.add_parser("validate", help="measure accuracy vs ground truth")
    validate.add_argument("--source", type=Path, default=DEFAULT_CHECKPOINT_SOURCE)
    validate.add_argument("--n", type=int, default=100)
    validate.add_argument("--concurrency", type=int, default=8)
    validate.add_argument("--fields", nargs="*", default=[])
    validate.add_argument("--detail-out", type=Path, default=None)
    validate.set_defaults(func=cmd_validate)

    run = sub.add_parser("run", help="extract the full work queue")
    run.add_argument("--work-queue", type=Path, default=DEFAULT_WORK_QUEUE)
    run.add_argument("--checkpoint-dir", type=Path, default=DEFAULT_EXTRACTION_DIR)
    run.add_argument("--concurrency", type=int, default=8)
    run.add_argument("--flush-every", type=int, default=500)
    run.add_argument("--limit", type=int, default=None)
    run.set_defaults(func=cmd_run)

    merge = sub.add_parser("merge", help="apply extractions to the dataset")
    merge.add_argument("--source", type=Path, default=DEFAULT_CHECKPOINT_SOURCE)
    merge.add_argument("--checkpoint-dir", type=Path, default=DEFAULT_EXTRACTION_DIR)
    merge.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    merge.add_argument("--trusted-fields", nargs="+", required=True)
    merge.set_defaults(func=cmd_merge)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    configure_logging(verbose=not args.quiet)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
