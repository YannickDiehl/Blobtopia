#!/usr/bin/env python3
"""
Blobtopia Simulation Validation Suite

Führt ~63 automatisierte Tests über 6 Schichten aus:
  Layer 1: Datenintegrität (15 SQL-Tests)
  Layer 2: Simulationsplausibilität (9 Tests: CFA, Alpha, ENP, Gini)
  Layer 3: Prompt-Genauigkeit (7 Tests)
  Layer 4: LLM-Kalibrierung (optional, mit --with-llm)
  Layer 5: Temporale Konsistenz (6 Tests)
  Layer 6: Tweet-Qualität (18 Tests)

Aufruf:
  python scripts/validate_simulation.py                   # Layer 1-3, 5
  python scripts/validate_simulation.py --with-llm        # + Layer 4
  python scripts/validate_simulation.py --layer 2         # Nur ein Layer
  python scripts/validate_simulation.py --db path/to.db   # Anderer DB-Pfad
"""

import argparse
import os
import sqlite3
import sys

# Add scripts/ to path so validation package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from validation.config import DEFAULT_DB_PATH
from validation.report import ValidationReport


def main():
    parser = argparse.ArgumentParser(
        description="Blobtopia Simulation Validation Suite"
    )
    parser.add_argument(
        "--db",
        default=DEFAULT_DB_PATH,
        help=f"Pfad zur Timeline-DB (default: {DEFAULT_DB_PATH})",
    )
    parser.add_argument(
        "--layer",
        type=int,
        choices=[1, 2, 3, 4, 5, 6, 7],
        help="Nur einen bestimmten Layer ausführen",
    )
    parser.add_argument(
        "--with-llm",
        action="store_true",
        help="Layer 4 (LLM-Kalibrierung) einschließen",
    )
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"FEHLER: Datenbank nicht gefunden: {args.db}")
        sys.exit(1)

    print(f"Öffne Datenbank: {args.db}")
    print(f"Dateigröße: {os.path.getsize(args.db) / (1024**2):.1f} MB")

    conn = sqlite3.connect(args.db, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA query_only=ON")

    report = ValidationReport()

    layers_to_run = [args.layer] if args.layer else [1, 2, 3, 5, 6, 7]
    if args.with_llm and (args.layer is None or args.layer == 4):
        if 4 not in layers_to_run:
            layers_to_run.append(4)
    layers_to_run.sort()

    for layer_num in layers_to_run:
        if layer_num == 1:
            print("\nLayer 1: Datenintegrität ...")
            from validation.layer1_integrity import run_layer1
            for result in run_layer1(conn):
                report.add(result)

        elif layer_num == 2:
            print("\nLayer 2: Simulationsplausibilität ...")
            from validation.layer2_plausibility import run_layer2
            for result in run_layer2(conn):
                report.add(result)

        elif layer_num == 3:
            print("\nLayer 3: Prompt-Genauigkeit ...")
            from validation.layer3_prompt_accuracy import run_layer3
            for result in run_layer3(conn):
                report.add(result)

        elif layer_num == 4:
            print("\nLayer 4: LLM-Kalibrierung ...")
            from validation.layer4_llm_calibration import run_layer4
            for result in run_layer4(conn):
                report.add(result)

        elif layer_num == 5:
            print("\nLayer 5: Temporale Konsistenz ...")
            from validation.layer5_temporal import run_layer5
            for result in run_layer5(conn):
                report.add(result)

        elif layer_num == 6:
            print("\nLayer 6: Tweet-Qualität ...")
            from validation.layer6_tweets import run_layer6
            for result in run_layer6(conn):
                report.add(result)

        elif layer_num == 7:
            print("\nLayer 7: Tiefenplausibilität ...")
            from validation.layer7_plausibility_deep import run_layer7
            for result in run_layer7(conn):
                report.add(result)

    conn.close()
    report.print_report()
    sys.exit(report.exit_code())


if __name__ == "__main__":
    main()
