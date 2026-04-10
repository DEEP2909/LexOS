"""
EvidentIS Golden Datasets
Test cases and ground truth data for AI evaluation
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import json


@dataclass
class TestCase:
    """A single test case with input, expected output, and metadata"""
    case_id: str
    task_type: str
    input_data: Dict[str, Any]
    expected_output: Dict[str, Any]
    description: str = ""
    tags: List[str] = field(default_factory=list)
    difficulty: str = "medium"  # easy, medium, hard
    jurisdiction: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "case_id": self.case_id,
            "task_type": self.task_type,
            "input_data": self.input_data,
            "expected_output": self.expected_output,
            "description": self.description,
            "tags": self.tags,
            "difficulty": self.difficulty,
            "jurisdiction": self.jurisdiction,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TestCase":
        return cls(
            case_id=data["case_id"],
            task_type=data["task_type"],
            input_data=data["input_data"],
            expected_output=data["expected_output"],
            description=data.get("description", ""),
            tags=data.get("tags", []),
            difficulty=data.get("difficulty", "medium"),
            jurisdiction=data.get("jurisdiction"),
        )


@dataclass
class GoldenDataset:
    """Collection of test cases for a specific task type"""
    name: str
    task_type: str
    version: str
    description: str
    cases: List[TestCase]
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "task_type": self.task_type,
            "version": self.version,
            "description": self.description,
            "cases": [c.to_dict() for c in self.cases],
            "metadata": self.metadata,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GoldenDataset":
        return cls(
            name=data["name"],
            task_type=data["task_type"],
            version=data["version"],
            description=data["description"],
            cases=[TestCase.from_dict(c) for c in data["cases"]],
            metadata=data.get("metadata", {}),
        )
    
    def filter_by_difficulty(self, difficulty: str) -> "GoldenDataset":
        """Return a new dataset with only cases of specified difficulty"""
        filtered = [c for c in self.cases if c.difficulty == difficulty]
        return GoldenDataset(
            name=f"{self.name}_{difficulty}",
            task_type=self.task_type,
            version=self.version,
            description=f"{self.description} (filtered: {difficulty})",
            cases=filtered,
            metadata=self.metadata,
        )
    
    def filter_by_jurisdiction(self, jurisdiction: str) -> "GoldenDataset":
        """Return a new dataset with only cases for specified jurisdiction"""
        filtered = [c for c in self.cases if c.jurisdiction == jurisdiction]
        return GoldenDataset(
            name=f"{self.name}_{jurisdiction}",
            task_type=self.task_type,
            version=self.version,
            description=f"{self.description} (filtered: {jurisdiction})",
            cases=filtered,
            metadata=self.metadata,
        )


def load_golden_dataset(path: str) -> GoldenDataset:
    """Load a golden dataset from a JSON file"""
    with open(path, "r") as f:
        data = json.load(f)
    return GoldenDataset.from_dict(data)


def save_golden_dataset(dataset: GoldenDataset, path: str) -> None:
    """Save a golden dataset to a JSON file"""
    with open(path, "w") as f:
        json.dump(dataset.to_dict(), f, indent=2)


def create_test_case(
    task_type: str,
    input_data: Dict[str, Any],
    expected_output: Dict[str, Any],
    case_id: Optional[str] = None,
    **kwargs,
) -> TestCase:
    """Convenience function to create a test case"""
    import uuid
    
    if case_id is None:
        case_id = f"{task_type}_{str(uuid.uuid4())[:8]}"
    
    return TestCase(
        case_id=case_id,
        task_type=task_type,
        input_data=input_data,
        expected_output=expected_output,
        **kwargs,
    )


# =============================================================================
# Pre-built Golden Datasets
# =============================================================================

def create_clause_extraction_dataset() -> GoldenDataset:
    """Create a golden dataset for clause extraction testing"""
    cases = [
        TestCase(
            case_id="clause_001",
            task_type="clause_extraction",
            description="Standard NDA with confidentiality and non-solicitation",
            input_data={
                "text": """
                CONFIDENTIALITY. The Receiving Party agrees to hold in confidence 
                all Confidential Information disclosed by the Disclosing Party and 
                shall not disclose such information to any third party without prior 
                written consent. This obligation shall survive for a period of five 
                (5) years following termination of this Agreement.
                
                NON-SOLICITATION. During the term of this Agreement and for a period 
                of two (2) years thereafter, neither party shall directly or indirectly 
                solicit for employment any employee of the other party.
                """,
                "document_type": "NDA",
            },
            expected_output={
                "clauses": [
                    {"type": "confidentiality", "confidence": 0.95},
                    {"type": "non_solicitation", "confidence": 0.90},
                ],
            },
            tags=["nda", "confidentiality", "non-solicitation"],
            difficulty="easy",
        ),
        TestCase(
            case_id="clause_002",
            task_type="clause_extraction",
            description="Employment agreement with non-compete (California)",
            input_data={
                "text": """
                NON-COMPETITION COVENANT. Employee agrees that during employment 
                and for twelve (12) months following termination, Employee shall not 
                engage in any business activity that competes directly with Employer 
                within a fifty (50) mile radius of any Employer location.
                
                GOVERNING LAW. This Agreement shall be governed by and construed in 
                accordance with the laws of the State of California, without regard 
                to conflicts of law principles.
                """,
                "document_type": "Employment Agreement",
            },
            expected_output={
                "clauses": [
                    {"type": "non_compete", "confidence": 0.92},
                    {"type": "governing_law", "confidence": 0.95},
                ],
                "flags": [
                    {"type": "enforceability_risk", "clause_type": "non_compete", 
                     "reason": "California prohibits non-compete agreements"},
                ],
            },
            tags=["employment", "non-compete", "california"],
            difficulty="medium",
            jurisdiction="CA",
        ),
        TestCase(
            case_id="clause_003",
            task_type="clause_extraction",
            description="Complex indemnification with carve-outs",
            input_data={
                "text": """
                INDEMNIFICATION. Vendor shall defend, indemnify, and hold harmless 
                Customer and its officers, directors, employees, agents, and 
                affiliates from and against any and all claims, damages, losses, 
                costs, and expenses (including reasonable attorneys' fees) arising 
                out of or relating to: (a) any breach of this Agreement by Vendor; 
                (b) any negligent or wrongful act or omission of Vendor; or (c) any 
                infringement or misappropriation of any intellectual property rights 
                by the Products; PROVIDED, HOWEVER, that Vendor shall not be 
                obligated to indemnify Customer to the extent any claim arises from 
                (i) Customer's modification of the Products, (ii) Customer's 
                combination of the Products with other products not provided by 
                Vendor, or (iii) Customer's use of the Products other than as 
                permitted under this Agreement.
                """,
                "document_type": "Software License Agreement",
            },
            expected_output={
                "clauses": [
                    {"type": "indemnification", "confidence": 0.98},
                    {"type": "intellectual_property", "confidence": 0.85},
                ],
            },
            tags=["indemnification", "ip", "carve-outs"],
            difficulty="hard",
        ),
    ]
    
    return GoldenDataset(
        name="clause_extraction_v1",
        task_type="clause_extraction",
        version="1.0.0",
        description="Golden dataset for clause extraction evaluation",
        cases=cases,
        metadata={
            "created_by": "EvidentIS Team",
            "last_updated": "2026-04-08",
        },
    )


def create_risk_assessment_dataset() -> GoldenDataset:
    """Create a golden dataset for risk assessment testing"""
    cases = [
        TestCase(
            case_id="risk_001",
            task_type="risk_assessment",
            description="Low risk standard NDA",
            input_data={
                "clauses": [
                    {"type": "confidentiality", "text": "Standard mutual confidentiality..."},
                    {"type": "termination_for_convenience", "text": "Either party may terminate with 30 days notice..."},
                ],
                "document_type": "NDA",
                "jurisdiction": "DE",
            },
            expected_output={
                "risk_level": "low",
                "risk_score": 0.25,
                "factors": [
                    {"category": "standard_terms", "impact": "positive"},
                ],
            },
            difficulty="easy",
        ),
        TestCase(
            case_id="risk_002",
            task_type="risk_assessment",
            description="High risk one-sided indemnification",
            input_data={
                "clauses": [
                    {"type": "indemnification", "text": "Customer shall indemnify Vendor against ALL claims..."},
                    {"type": "limitation_of_liability", "text": "Vendor's liability shall not exceed fees paid in prior 12 months..."},
                    {"type": "warranty_disclaimer", "text": "Services provided AS-IS without any warranty..."},
                ],
                "document_type": "SaaS Agreement",
                "jurisdiction": "TX",
            },
            expected_output={
                "risk_level": "high",
                "risk_score": 0.82,
                "factors": [
                    {"category": "one_sided_indemnification", "impact": "negative"},
                    {"category": "limited_remedies", "impact": "negative"},
                ],
            },
            difficulty="medium",
        ),
    ]
    
    return GoldenDataset(
        name="risk_assessment_v1",
        task_type="risk_assessment",
        version="1.0.0",
        description="Golden dataset for risk assessment evaluation",
        cases=cases,
    )


def get_all_golden_datasets() -> List[GoldenDataset]:
    """Get all pre-built golden datasets"""
    return [
        create_clause_extraction_dataset(),
        create_risk_assessment_dataset(),
    ]
