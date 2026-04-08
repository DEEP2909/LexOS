"""
LexOS AI Evaluation Framework
Golden datasets, scoring scripts, and regression testing for AI outputs
"""

from .evaluator import (
    Evaluator,
    EvaluationResult,
    EvaluationMetrics,
    run_evaluation,
)
from .datasets import (
    GoldenDataset,
    TestCase,
    load_golden_dataset,
    create_test_case,
)
from .scoring import (
    calculate_precision_recall,
    calculate_clause_accuracy,
    calculate_risk_accuracy,
    calculate_research_quality,
)

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
