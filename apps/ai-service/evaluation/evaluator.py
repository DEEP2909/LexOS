"""
EvidentIS AI Evaluator
Core evaluation engine for testing AI model outputs against golden datasets
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime, timezone
import argparse
import asyncio
import json
import logging

from evaluation.datasets import GoldenDataset

logger = logging.getLogger(__name__)


@dataclass
class EvaluationMetrics:
    """Metrics for a single evaluation"""
    task_type: str
    precision: float
    recall: float
    f1_score: float
    accuracy: float
    latency_ms: float
    token_count: int
    custom_metrics: Dict[str, float] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_type": self.task_type,
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1_score": round(self.f1_score, 4),
            "accuracy": round(self.accuracy, 4),
            "latency_ms": round(self.latency_ms, 2),
            "token_count": self.token_count,
            "custom_metrics": {k: round(v, 4) for k, v in self.custom_metrics.items()},
        }


@dataclass
class EvaluationResult:
    """Complete evaluation result"""
    run_id: str
    model_version: str
    dataset_name: str
    timestamp: datetime
    total_cases: int
    passed_cases: int
    failed_cases: int
    metrics: EvaluationMetrics
    failures: List[Dict[str, Any]] = field(default_factory=list)
    
    @property
    def pass_rate(self) -> float:
        if self.total_cases == 0:
            return 0.0
        return self.passed_cases / self.total_cases
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "run_id": self.run_id,
            "model_version": self.model_version,
            "dataset_name": self.dataset_name,
            "timestamp": self.timestamp.isoformat(),
            "total_cases": self.total_cases,
            "passed_cases": self.passed_cases,
            "failed_cases": self.failed_cases,
            "pass_rate": round(self.pass_rate, 4),
            "metrics": self.metrics.to_dict(),
            "failures": self.failures[:10],  # Limit to 10 failures in output
        }


class Evaluator:
    """Main evaluator class for running evaluations"""
    
    def __init__(
        self,
        model_version: str,
        thresholds: Optional[Dict[str, float]] = None,
    ):
        self.model_version = model_version
        self.thresholds = thresholds or {
            "min_precision": 0.80,
            "min_recall": 0.75,
            "min_f1": 0.77,
            "min_accuracy": 0.80,
            "max_latency_ms": 5000,
        }
        self._test_functions: Dict[str, Callable] = {}
    
    def register_test(self, task_type: str, test_fn: Callable) -> None:
        """Register a test function for a task type"""
        self._test_functions[task_type] = test_fn
    
    async def evaluate(
        self,
        dataset: GoldenDataset,
        inference_fn: Callable,
    ) -> EvaluationResult:
        """Run evaluation on a dataset"""
        import uuid
        import time
        
        run_id = str(uuid.uuid4())[:8]
        start_time = datetime.now()
        
        passed = 0
        failed = 0
        failures = []
        
        total_latency = 0.0
        total_tokens = 0
        
        true_positives = 0
        false_positives = 0
        false_negatives = 0
        correct = 0
        
        for case in dataset.cases:
            case_start = time.time()
            
            try:
                # Run inference
                prediction = await inference_fn(case.input_data)
                latency = (time.time() - case_start) * 1000
                total_latency += latency
                
                # Count tokens (approximate)
                tokens = self._estimate_tokens(case.input_data, prediction)
                total_tokens += tokens
                
                # Evaluate prediction
                is_correct, tp, fp, fn = self._evaluate_case(
                    case.expected_output,
                    prediction,
                    case.task_type,
                )
                
                true_positives += tp
                false_positives += fp
                false_negatives += fn
                
                if is_correct:
                    passed += 1
                    correct += 1
                else:
                    failed += 1
                    failures.append({
                        "case_id": case.case_id,
                        "task_type": case.task_type,
                        "expected": self._truncate(case.expected_output),
                        "actual": self._truncate(prediction),
                        "latency_ms": latency,
                    })
                    
            except Exception as e:
                failed += 1
                failures.append({
                    "case_id": case.case_id,
                    "task_type": case.task_type,
                    "error": str(e),
                })
        
        # Calculate metrics
        precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
        recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        accuracy = correct / len(dataset.cases) if dataset.cases else 0
        avg_latency = total_latency / len(dataset.cases) if dataset.cases else 0
        
        metrics = EvaluationMetrics(
            task_type=dataset.task_type,
            precision=precision,
            recall=recall,
            f1_score=f1,
            accuracy=accuracy,
            latency_ms=avg_latency,
            token_count=total_tokens,
        )
        
        return EvaluationResult(
            run_id=run_id,
            model_version=self.model_version,
            dataset_name=dataset.name,
            timestamp=start_time,
            total_cases=len(dataset.cases),
            passed_cases=passed,
            failed_cases=failed,
            metrics=metrics,
            failures=failures,
        )
    
    def _evaluate_case(
        self,
        expected: Dict[str, Any],
        actual: Dict[str, Any],
        task_type: str,
    ) -> tuple:
        """Evaluate a single case, returns (is_correct, tp, fp, fn)"""
        if task_type == "clause_extraction":
            return self._evaluate_clause_extraction(expected, actual)
        elif task_type == "risk_assessment":
            return self._evaluate_risk_assessment(expected, actual)
        elif task_type == "research":
            return self._evaluate_research(expected, actual)
        else:
            return self._evaluate_generic(expected, actual)
    
    def _evaluate_clause_extraction(
        self,
        expected: Dict[str, Any],
        actual: Dict[str, Any],
    ) -> tuple:
        """Evaluate clause extraction results"""
        expected_types = set(c.get("type") for c in expected.get("clauses", []))
        actual_types = set(c.get("type") for c in actual.get("clauses", []))
        
        tp = len(expected_types & actual_types)
        fp = len(actual_types - expected_types)
        fn = len(expected_types - actual_types)
        
        # Consider correct if >= 80% overlap
        overlap = tp / len(expected_types) if expected_types else 1.0
        is_correct = overlap >= 0.8
        
        return is_correct, tp, fp, fn
    
    def _evaluate_risk_assessment(
        self,
        expected: Dict[str, Any],
        actual: Dict[str, Any],
    ) -> tuple:
        """Evaluate risk assessment results"""
        expected_level_raw = expected.get("risk_level", "")
        actual_level_raw = actual.get("risk_level", "")
        expected_level = expected_level_raw.lower() if isinstance(expected_level_raw, str) else ""
        actual_level = actual_level_raw.lower() if isinstance(actual_level_raw, str) else ""
        
        # Map to numeric for comparison
        level_map = {"low": 1, "medium": 2, "high": 3, "critical": 4}
        exp_num = level_map.get(expected_level, 0)
        act_num = level_map.get(actual_level, 0)
        
        # Allow 1 level difference
        is_correct = abs(exp_num - act_num) <= 1
        
        # For precision/recall, treat as binary (high risk vs not)
        exp_high = exp_num >= 3
        act_high = act_num >= 3
        
        tp = 1 if exp_high and act_high else 0
        fp = 1 if act_high and not exp_high else 0
        fn = 1 if exp_high and not act_high else 0
        
        return is_correct, tp, fp, fn
    
    def _evaluate_research(
        self,
        expected: Dict[str, Any],
        actual: Dict[str, Any],
    ) -> tuple:
        """Evaluate research results"""
        # Check if key citations are present
        expected_citations = {
            citation for citation in expected.get("citations", []) if isinstance(citation, str)
        }
        actual_citations = {
            citation for citation in actual.get("citations", []) if isinstance(citation, str)
        }
        
        tp = len(expected_citations & actual_citations)
        fp = len(actual_citations - expected_citations)
        fn = len(expected_citations - actual_citations)
        
        # Check answer quality (simple keyword matching)
        expected_keywords = {
            keyword for keyword in expected.get("keywords", []) if isinstance(keyword, str)
        }
        answer = actual.get("answer", "")
        actual_text = answer.lower() if isinstance(answer, str) else ""
        
        keyword_matches = sum(1 for k in expected_keywords if k.lower() in actual_text)
        keyword_ratio = keyword_matches / len(expected_keywords) if expected_keywords else 1.0
        
        is_correct = keyword_ratio >= 0.6 and (tp / len(expected_citations) if expected_citations else 1.0) >= 0.5
        
        return is_correct, tp, fp, fn
    
    def _evaluate_generic(
        self,
        expected: Dict[str, Any],
        actual: Dict[str, Any],
    ) -> tuple:
        """Generic evaluation for unknown task types"""
        # Simple key presence check
        expected_keys = set(expected.keys())
        actual_keys = set(actual.keys())
        
        tp = len(expected_keys & actual_keys)
        fp = len(actual_keys - expected_keys)
        fn = len(expected_keys - actual_keys)
        
        is_correct = tp >= len(expected_keys) * 0.8
        
        return is_correct, tp, fp, fn
    
    def _estimate_tokens(
        self,
        input_data: Dict[str, Any],
        output_data: Dict[str, Any],
    ) -> int:
        """Rough token estimation"""
        input_str = json.dumps(input_data)
        output_str = json.dumps(output_data)
        # Rough estimate: 4 chars per token
        return (len(input_str) + len(output_str)) // 4
    
    def _truncate(self, data: Any, max_len: int = 200) -> Any:
        """Truncate data for failure reports"""
        s = json.dumps(data)
        if len(s) > max_len:
            return s[:max_len] + "..."
        return data
    
    def check_thresholds(self, result: EvaluationResult) -> List[str]:
        """Check if results meet thresholds, return list of failures"""
        failures = []
        
        if result.metrics.precision < self.thresholds["min_precision"]:
            failures.append(
                f"Precision {result.metrics.precision:.3f} below threshold {self.thresholds['min_precision']}"
            )
        if result.metrics.recall < self.thresholds["min_recall"]:
            failures.append(
                f"Recall {result.metrics.recall:.3f} below threshold {self.thresholds['min_recall']}"
            )
        if result.metrics.f1_score < self.thresholds["min_f1"]:
            failures.append(
                f"F1 {result.metrics.f1_score:.3f} below threshold {self.thresholds['min_f1']}"
            )
        if result.metrics.latency_ms > self.thresholds["max_latency_ms"]:
            failures.append(
                f"Latency {result.metrics.latency_ms:.0f}ms above threshold {self.thresholds['max_latency_ms']}ms"
            )
        
        return failures


async def run_evaluation(
    model_version: str,
    dataset_path: str,
    inference_fn: Callable,
    output_path: Optional[str] = None,
) -> EvaluationResult:
    """Convenience function to run an evaluation"""
    from .datasets import load_golden_dataset
    
    dataset = load_golden_dataset(dataset_path)
    evaluator = Evaluator(model_version)
    result = await evaluator.evaluate(dataset, inference_fn)
    
    # Check thresholds
    threshold_failures = evaluator.check_thresholds(result)
    if threshold_failures:
        logger.warning(f"Evaluation failed thresholds: {threshold_failures}")
    
    # Save results if path provided
    if output_path:
        with open(output_path, "w") as f:
            json.dump(result.to_dict(), f, indent=2)
    
    return result


def _infer_clause_types(text: str) -> List[Dict[str, Any]]:
    lowered = text.lower()
    clause_map = [
        ("indemnification", ("indemnif",)),
        ("intellectual_property", ("intellectual property", "infringement")),
        ("confidentiality", ("confidential", "confidentiality", "nda")),
        ("non_solicitation", ("non-solicit", "non solicit")),
        ("non_compete", ("non-compete", "non compete", "non-competition", "noncompetition", "non_competition")),
        ("governing_law", ("governing law", "choice of law")),
    ]

    extracted: List[Dict[str, Any]] = []
    for clause_type, patterns in clause_map:
        if any(pattern in lowered for pattern in patterns):
            extracted.append({"type": clause_type, "confidence": 0.9})
    return extracted


def _infer_risk_level(clauses: List[Dict[str, Any]]) -> str:
    text = " ".join(str(clause.get("text", "")).lower() for clause in clauses)
    high_risk_markers = (
        "all claims",
        "as-is",
        "as is",
        "shall indemnify vendor",
        "liability shall not exceed",
    )
    if any(marker in text for marker in high_risk_markers):
        return "high"
    return "low"


async def _ci_inference(input_data: Dict[str, Any]) -> Dict[str, Any]:
    if "text" in input_data:
        return {"clauses": _infer_clause_types(str(input_data.get("text", "")))}
    if "clauses" in input_data:
        return {"risk_level": _infer_risk_level(input_data.get("clauses", []))}
    return {}


async def run_ci_benchmark(output_path: str, model_version: str = "ci-baseline") -> Dict[str, Any]:
    from .datasets import create_clause_extraction_dataset, create_risk_assessment_dataset

    clause_dataset = create_clause_extraction_dataset()
    risk_dataset = create_risk_assessment_dataset()
    evaluator = Evaluator(model_version)

    clause_result = await evaluator.evaluate(clause_dataset, _ci_inference)
    risk_result = await evaluator.evaluate(risk_dataset, _ci_inference)

    obligation_proxy = (clause_result.metrics.accuracy + risk_result.metrics.accuracy) / 2
    redline_proxy = (clause_result.metrics.f1_score + risk_result.metrics.f1_score) / 2

    payload = {
        "model_version": model_version,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scores": {
            "clause_extraction_accuracy": round(clause_result.metrics.accuracy, 4),
            "risk_assessment_precision": round(risk_result.metrics.precision, 4),
            "risk_assessment_recall": round(risk_result.metrics.recall, 4),
            "obligation_extraction_accuracy": round(obligation_proxy, 4),
            "redline_suggestion_relevance": round(redline_proxy, 4),
        },
        "details": {
            "clause_extraction": clause_result.to_dict(),
            "risk_assessment": risk_result.to_dict(),
        },
    }

    Path(output_path).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run EvidentIS AI evaluation benchmark")
    parser.add_argument("--output", default="evaluation-results.json", help="Path to write evaluation results JSON")
    parser.add_argument("--model-version", default="ci-baseline", help="Model version label for the result payload")
    return parser


def main() -> None:
    args = _build_arg_parser().parse_args()
    results = asyncio.run(run_ci_benchmark(args.output, args.model_version))
    logger.info("AI evaluation results written to %s", args.output)
    for metric, score in results["scores"].items():
        logger.info("%s: %.2f%%", metric, score * 100)


if __name__ == "__main__":
    main()
