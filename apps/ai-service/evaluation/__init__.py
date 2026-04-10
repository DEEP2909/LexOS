"""
EvidentIS AI Evaluation Framework
Golden datasets, scoring scripts, and regression testing for AI outputs
"""

from importlib import import_module
from typing import Any

__all__ = [
    "Evaluator",
    "EvaluationResult",
    "EvaluationMetrics",
    "run_evaluation",
    "GoldenDataset",
    "TestCase",
    "load_golden_dataset",
    "create_test_case",
    "calculate_precision_recall",
    "calculate_clause_accuracy",
    "calculate_risk_accuracy",
    "calculate_research_quality",
]

_EXPORT_MODULES = {
    "Evaluator": ".evaluator",
    "EvaluationResult": ".evaluator",
    "EvaluationMetrics": ".evaluator",
    "run_evaluation": ".evaluator",
    "GoldenDataset": ".datasets",
    "TestCase": ".datasets",
    "load_golden_dataset": ".datasets",
    "create_test_case": ".datasets",
    "calculate_precision_recall": ".scoring",
    "calculate_clause_accuracy": ".scoring",
    "calculate_risk_accuracy": ".scoring",
    "calculate_research_quality": ".scoring",
}


def __getattr__(name: str) -> Any:
    module_name = _EXPORT_MODULES.get(name)
    if not module_name:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    module = import_module(module_name, package=__name__)
    value = getattr(module, name)
    globals()[name] = value
    return value
