"""Report-Klasse für Validierungsergebnisse."""

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Status(Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"
    SKIP = "SKIP"


@dataclass
class TestResult:
    test_id: str
    name: str
    status: Status
    detail: str = ""
    duration_ms: float = 0.0


@dataclass
class ValidationReport:
    results: list[TestResult] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)

    def add(self, result: TestResult):
        self.results.append(result)

    @property
    def pass_count(self) -> int:
        return sum(1 for r in self.results if r.status == Status.PASS)

    @property
    def warn_count(self) -> int:
        return sum(1 for r in self.results if r.status == Status.WARN)

    @property
    def fail_count(self) -> int:
        return sum(1 for r in self.results if r.status == Status.FAIL)

    @property
    def skip_count(self) -> int:
        return sum(1 for r in self.results if r.status == Status.SKIP)

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def overall_status(self) -> Status:
        if self.fail_count > 0:
            return Status.FAIL
        active = [r for r in self.results if r.status != Status.SKIP]
        if not active:
            return Status.SKIP
        pass_count = sum(1 for r in active if r.status == Status.PASS)
        if pass_count >= len(active):
            return Status.PASS
        if pass_count >= 40:
            return Status.PASS  # PASS MIT WARN
        return Status.WARN

    def print_report(self):
        elapsed = time.time() - self.start_time
        status_symbols = {
            Status.PASS: "\033[32m✓ PASS\033[0m",
            Status.WARN: "\033[33m⚠ WARN\033[0m",
            Status.FAIL: "\033[31m✗ FAIL\033[0m",
            Status.SKIP: "\033[90m○ SKIP\033[0m",
        }

        print("\n" + "=" * 72)
        print("BLOBTOPIA VALIDATION REPORT")
        print("=" * 72)

        current_layer = ""
        for r in self.results:
            layer = r.test_id.split(".")[0]
            if layer != current_layer:
                current_layer = layer
                layer_names = {
                    "1": "Layer 1: Datenintegrität",
                    "2": "Layer 2: Simulationsplausibilität",
                    "3": "Layer 3: Prompt-Genauigkeit",
                    "4": "Layer 4: LLM-Kalibrierung",
                    "5": "Layer 5: Temporale Konsistenz",
                    "6": "Layer 6: Tweet-Qualität",
                    "7": "Layer 7: Tiefenplausibilität",
                }
                print(f"\n--- {layer_names.get(layer, f'Layer {layer}')} ---")

            sym = status_symbols[r.status]
            dur = f"({r.duration_ms:.0f}ms)" if r.duration_ms > 0 else ""
            print(f"  [{r.test_id:>4}] {sym}  {r.name:<40} {dur}")
            if r.detail and r.status in (Status.FAIL, Status.WARN):
                print(f"         {r.detail}")

        print("\n" + "-" * 72)
        overall_sym = status_symbols[self.overall_status]
        print(
            f"  GESAMT: {overall_sym}  "
            f"({self.pass_count} PASS, {self.warn_count} WARN, "
            f"{self.fail_count} FAIL, {self.skip_count} SKIP)"
        )
        print(f"  Laufzeit: {elapsed:.1f}s")
        print("=" * 72 + "\n")

    def exit_code(self) -> int:
        return 1 if self.overall_status == Status.FAIL else 0


def run_test(test_id: str, name: str, fn) -> TestResult:
    """Run a test function that returns (Status, detail_str)."""
    t0 = time.time()
    try:
        status, detail = fn()
    except Exception as e:
        status, detail = Status.FAIL, f"Exception: {e}"
    duration_ms = (time.time() - t0) * 1000
    return TestResult(test_id, name, status, detail, duration_ms)
