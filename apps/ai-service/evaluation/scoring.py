"""
EvidentIS Scoring Functions
Specialized scoring metrics for legal AI tasks
"""

from typing import List, Dict, Any, Set
from dataclasses import dataclass


@dataclass
class PrecisionRecallResult:
    """Precision and recall metrics"""
    precision: float
    recall: float
    f1: float
    true_positives: int
    false_positives: int
    false_negatives: int


def calculate_precision_recall(
    expected: Set[str],
    actual: Set[str],
) -> PrecisionRecallResult:
    """Calculate precision, recall, and F1 score"""
    tp = len(expected & actual)
    fp = len(actual - expected)
    fn = len(expected - actual)
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    
    return PrecisionRecallResult(
        precision=precision,
        recall=recall,
        f1=f1,
        true_positives=tp,
        false_positives=fp,
        false_negatives=fn,
    )


def calculate_clause_accuracy(
    expected_clauses: List[Dict[str, Any]],
    actual_clauses: List[Dict[str, Any]],
    type_weight: float = 0.6,
    boundary_weight: float = 0.4,
) -> Dict[str, float]:
    """
    Calculate clause extraction accuracy with multiple dimensions
    
    Args:
        expected_clauses: Ground truth clauses
        actual_clauses: Predicted clauses
        type_weight: Weight for clause type accuracy
        boundary_weight: Weight for boundary accuracy
    
    Returns:
        Dictionary with accuracy metrics
    """
    if not expected_clauses:
        return {"overall": 1.0 if not actual_clauses else 0.0}
    
    # Type accuracy
    expected_types = {
        clause_type
        for clause in expected_clauses
        if isinstance((clause_type := clause.get("type")), str)
    }
    actual_types = {
        clause_type
        for clause in actual_clauses
        if isinstance((clause_type := clause.get("type")), str)
    }
    type_result = calculate_precision_recall(expected_types, actual_types)
    
    # Boundary accuracy (using overlap ratio)
    boundary_scores = []
    for exp in expected_clauses:
        exp_text = exp.get("text", "")
        best_overlap = 0.0
        
        for act in actual_clauses:
            if act.get("type") != exp.get("type"):
                continue
            
            act_text = act.get("text", "")
            overlap = _calculate_text_overlap(exp_text, act_text)
            best_overlap = max(best_overlap, overlap)
        
        boundary_scores.append(best_overlap)
    
    boundary_accuracy = sum(boundary_scores) / len(boundary_scores) if boundary_scores else 0.0
    
    # Overall weighted accuracy
    overall = (type_weight * type_result.f1) + (boundary_weight * boundary_accuracy)
    
    return {
        "overall": overall,
        "type_precision": type_result.precision,
        "type_recall": type_result.recall,
        "type_f1": type_result.f1,
        "boundary_accuracy": boundary_accuracy,
    }


def _calculate_text_overlap(text1: str, text2: str) -> float:
    """Calculate word-level overlap between two texts"""
    if not text1 or not text2:
        return 0.0
    
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    
    if not words1 or not words2:
        return 0.0
    
    intersection = len(words1 & words2)
    union = len(words1 | words2)
    
    return intersection / union if union > 0 else 0.0


def calculate_risk_accuracy(
    expected: Dict[str, Any],
    actual: Dict[str, Any],
    strict_level_match: bool = False,
) -> Dict[str, float]:
    """
    Calculate risk assessment accuracy
    
    Args:
        expected: Ground truth risk assessment
        actual: Predicted risk assessment
        strict_level_match: If True, require exact level match
    
    Returns:
        Dictionary with accuracy metrics
    """
    # Level mapping
    level_map = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    
    exp_level_raw = expected.get("risk_level", "")
    act_level_raw = actual.get("risk_level", "")
    exp_level = exp_level_raw.lower() if isinstance(exp_level_raw, str) else ""
    act_level = act_level_raw.lower() if isinstance(act_level_raw, str) else ""
    
    exp_num = level_map.get(exp_level, 0)
    act_num = level_map.get(act_level, 0)
    
    # Level accuracy
    if strict_level_match:
        level_correct = exp_level == act_level
    else:
        level_correct = abs(exp_num - act_num) <= 1
    
    # Score accuracy (if provided)
    exp_score_raw = expected.get("risk_score", 0.5)
    act_score_raw = actual.get("risk_score", 0.5)
    exp_score = float(exp_score_raw) if isinstance(exp_score_raw, (int, float)) else 0.5
    act_score = float(act_score_raw) if isinstance(act_score_raw, (int, float)) else 0.5
    score_error = abs(exp_score - act_score)
    score_accuracy = max(0, 1 - score_error)
    
    # Factor accuracy
    exp_factors = {
        category
        for factor in expected.get("factors", [])
        if isinstance(factor, dict) and isinstance((category := factor.get("category")), str)
    }
    act_factors = {
        category
        for factor in actual.get("factors", [])
        if isinstance(factor, dict) and isinstance((category := factor.get("category")), str)
    }
    factor_result = calculate_precision_recall(exp_factors, act_factors)
    
    # Overall (weighted)
    overall = (
        0.4 * (1.0 if level_correct else 0.0) +
        0.3 * score_accuracy +
        0.3 * factor_result.f1
    )
    
    return {
        "overall": overall,
        "level_correct": 1.0 if level_correct else 0.0,
        "score_accuracy": score_accuracy,
        "factor_precision": factor_result.precision,
        "factor_recall": factor_result.recall,
        "factor_f1": factor_result.f1,
    }


def calculate_research_quality(
    expected: Dict[str, Any],
    actual: Dict[str, Any],
) -> Dict[str, float]:
    """
    Calculate research result quality
    
    Args:
        expected: Ground truth research result
        actual: Generated research result
    
    Returns:
        Dictionary with quality metrics
    """
    # Citation accuracy
    exp_citations = {citation for citation in expected.get("citations", []) if isinstance(citation, str)}
    act_citations = {citation for citation in actual.get("citations", []) if isinstance(citation, str)}
    citation_result = calculate_precision_recall(exp_citations, act_citations)
    
    # Keyword coverage
    exp_keywords = {
        keyword.lower() for keyword in expected.get("keywords", []) if isinstance(keyword, str)
    }
    act_answer = actual.get("answer", "")
    act_text = act_answer.lower() if isinstance(act_answer, str) else ""
    
    keywords_found = sum(1 for k in exp_keywords if k in act_text)
    keyword_coverage = keywords_found / len(exp_keywords) if exp_keywords else 1.0
    
    # Factual accuracy (if key facts provided)
    exp_facts = [fact for fact in expected.get("key_facts", []) if isinstance(fact, str)]
    fact_accuracy = 1.0  # Default to perfect if no facts to check
    
    if exp_facts:
        facts_found = sum(1 for fact in exp_facts if fact.lower() in act_text)
        fact_accuracy = facts_found / len(exp_facts)
    
    # Answer length appropriateness
    exp_length_raw = expected.get("expected_length", 500)
    exp_length = float(exp_length_raw) if isinstance(exp_length_raw, (int, float)) else 500.0
    act_length = len(act_answer) if isinstance(act_answer, str) else 0
    
    # Penalize if too short or too long
    length_ratio = act_length / exp_length if exp_length > 0 else 1.0
    if length_ratio < 0.5:
        length_score = length_ratio * 2  # Penalize short answers
    elif length_ratio > 2.0:
        length_score = 1.0 / (length_ratio / 2)  # Penalize very long answers
    else:
        length_score = 1.0
    
    # Overall quality score
    overall = (
        0.3 * citation_result.f1 +
        0.3 * keyword_coverage +
        0.3 * fact_accuracy +
        0.1 * length_score
    )
    
    return {
        "overall": overall,
        "citation_precision": citation_result.precision,
        "citation_recall": citation_result.recall,
        "citation_f1": citation_result.f1,
        "keyword_coverage": keyword_coverage,
        "fact_accuracy": fact_accuracy,
        "length_score": length_score,
    }


def calculate_obligation_accuracy(
    expected_obligations: List[Dict[str, Any]],
    actual_obligations: List[Dict[str, Any]],
) -> Dict[str, float]:
    """
    Calculate obligation extraction accuracy
    
    Checks:
    - Obligation type detection
    - Due date extraction
    - Party identification
    """
    if not expected_obligations:
        return {"overall": 1.0 if not actual_obligations else 0.0}
    
    # Type accuracy
    exp_types = {
        obligation_type
        for obligation in expected_obligations
        if isinstance((obligation_type := obligation.get("type")), str)
    }
    act_types = {
        obligation_type
        for obligation in actual_obligations
        if isinstance((obligation_type := obligation.get("type")), str)
    }
    type_result = calculate_precision_recall(exp_types, act_types)
    
    # Date extraction accuracy
    date_matches = 0
    for exp in expected_obligations:
        exp_date = exp.get("due_date")
        if not exp_date:
            continue
        
        for act in actual_obligations:
            if act.get("due_date") == exp_date:
                date_matches += 1
                break
    
    date_accuracy = date_matches / len([o for o in expected_obligations if o.get("due_date")]) if expected_obligations else 1.0
    
    # Party accuracy
    exp_parties = {
        party
        for obligation in expected_obligations
        if isinstance((party := obligation.get("responsible_party")), str) and party
    }
    act_parties = {
        party
        for obligation in actual_obligations
        if isinstance((party := obligation.get("responsible_party")), str) and party
    }
    party_result = calculate_precision_recall(exp_parties, act_parties)
    
    overall = (
        0.4 * type_result.f1 +
        0.3 * date_accuracy +
        0.3 * party_result.f1
    )
    
    return {
        "overall": overall,
        "type_f1": type_result.f1,
        "date_accuracy": date_accuracy,
        "party_f1": party_result.f1,
    }


def compute_metrics(results: List[Any]) -> Dict[str, Any]:
    """
    Compute aggregate metrics from a list of evaluation results.
    
    Args:
        results: List of EvaluationResult objects
    
    Returns:
        Dictionary with aggregated metrics
    """
    if not results:
        return {"status": "no_results"}
    
    # Aggregate metrics across all results
    total_precision = 0.0
    total_recall = 0.0
    total_f1 = 0.0
    total_accuracy = 0.0
    total_latency = 0.0
    total_pass_rate = 0.0
    count = len(results)
    
    for result in results:
        if hasattr(result, 'metrics'):
            total_precision += result.metrics.precision
            total_recall += result.metrics.recall
            total_f1 += result.metrics.f1_score
            total_accuracy += result.metrics.accuracy
            total_latency += result.metrics.latency_ms
            total_pass_rate += result.pass_rate
    
    return {
        "total_evaluations": count,
        "avg_precision": round(total_precision / count, 4) if count else 0,
        "avg_recall": round(total_recall / count, 4) if count else 0,
        "avg_f1": round(total_f1 / count, 4) if count else 0,
        "avg_accuracy": round(total_accuracy / count, 4) if count else 0,
        "avg_latency_ms": round(total_latency / count, 2) if count else 0,
        "avg_pass_rate": round(total_pass_rate / count, 4) if count else 0,
    }
