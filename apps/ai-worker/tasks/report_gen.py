# EvidentIS AI Worker - Report Generation Tasks
# Handles scheduled and on-demand report generation

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from io import BytesIO
import json
import httpx
from celery import shared_task, group

logger = logging.getLogger(__name__)

API_SERVICE_URL = 'http://api:3000'


@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def generate_matter_report(
    self,
    tenant_id: str,
    matter_id: str,
    report_type: str,
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate a report for a specific matter.
    
    Report types:
    - summary: Executive summary of matter status
    - risk: Risk analysis report
    - obligations: Upcoming obligations report
    - compliance: Playbook compliance report
    - full: Comprehensive matter report
    """
    logger.info(f'Generating {report_type} report for matter {matter_id}')
    
    try:
        with httpx.Client(timeout=300.0) as client:
            # Fetch matter data
            matter_response = client.get(
                f'{API_SERVICE_URL}/internal/matters/{matter_id}/full',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
            )
            
            if matter_response.status_code != 200:
                raise Exception('Failed to fetch matter data')
            
            matter_data = matter_response.json()
            
            # Generate report based on type
            report_content = generate_report_content(report_type, matter_data, options)
            
            # Store report
            report_id = store_report(
                client, tenant_id, matter_id, report_type, report_content
            )
            
            logger.info(f'Report {report_id} generated for matter {matter_id}')
            
            return {
                'status': 'success',
                'report_id': report_id,
                'report_type': report_type,
                'matter_id': matter_id,
            }
            
    except Exception as e:
        logger.error(f'Error generating report for matter {matter_id}: {e}')
        raise self.retry(exc=e)


def generate_report_content(
    report_type: str,
    matter_data: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate report content based on type."""
    
    report = {
        'generated_at': datetime.utcnow().isoformat(),
        'type': report_type,
        'matter': {
            'id': matter_data.get('id'),
            'name': matter_data.get('name'),
            'client': matter_data.get('client_name'),
            'status': matter_data.get('status'),
        },
    }
    
    if report_type == 'summary':
        report['content'] = generate_summary_report(matter_data)
    elif report_type == 'risk':
        report['content'] = generate_risk_report(matter_data)
    elif report_type == 'obligations':
        report['content'] = generate_obligations_report(matter_data)
    elif report_type == 'compliance':
        report['content'] = generate_compliance_report(matter_data)
    elif report_type == 'full':
        report['content'] = {
            'summary': generate_summary_report(matter_data),
            'risk': generate_risk_report(matter_data),
            'obligations': generate_obligations_report(matter_data),
            'compliance': generate_compliance_report(matter_data),
        }
    else:
        report['content'] = {'error': f'Unknown report type: {report_type}'}
    
    return report


def generate_summary_report(matter_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate executive summary report."""
    documents = matter_data.get('documents', [])
    clauses = matter_data.get('clauses', [])
    flags = matter_data.get('flags', [])
    
    return {
        'overview': {
            'total_documents': len(documents),
            'total_clauses': len(clauses),
            'total_flags': len(flags),
            'health_score': matter_data.get('health_score', 0),
        },
        'document_breakdown': {
            'by_status': count_by_field(documents, 'status'),
            'by_type': count_by_field(documents, 'document_type'),
        },
        'risk_summary': {
            'critical': len([f for f in flags if f.get('severity') == 'critical']),
            'high': len([f for f in flags if f.get('severity') == 'high']),
            'medium': len([f for f in flags if f.get('severity') == 'medium']),
            'low': len([f for f in flags if f.get('severity') == 'low']),
        },
        'key_dates': extract_key_dates(matter_data),
    }


def generate_risk_report(matter_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate detailed risk analysis report."""
    flags = matter_data.get('flags', [])
    clauses = matter_data.get('clauses', [])
    
    # Group flags by category
    flags_by_category: Dict[str, List] = {}
    for flag in flags:
        category = flag.get('category', 'other')
        if category not in flags_by_category:
            flags_by_category[category] = []
        flags_by_category[category].append(flag)
    
    # Identify high-risk clauses
    high_risk_clauses = [
        c for c in clauses
        if c.get('risk_score', 0) >= 70
    ]
    
    return {
        'total_flags': len(flags),
        'flags_by_severity': {
            'critical': [f for f in flags if f.get('severity') == 'critical'],
            'high': [f for f in flags if f.get('severity') == 'high'],
            'medium': [f for f in flags if f.get('severity') == 'medium'],
            'low': [f for f in flags if f.get('severity') == 'low'],
        },
        'flags_by_category': flags_by_category,
        'high_risk_clauses': [
            {
                'id': c.get('id'),
                'type': c.get('clause_type'),
                'risk_score': c.get('risk_score'),
                'document_id': c.get('document_id'),
                'text_preview': c.get('text', '')[:200],
            }
            for c in high_risk_clauses
        ],
        'recommendations': generate_risk_recommendations(flags, clauses),
    }


def generate_obligations_report(matter_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate obligations and deadlines report."""
    obligations = matter_data.get('obligations', [])
    
    now = datetime.utcnow()
    
    # Categorize by urgency
    overdue = []
    due_this_week = []
    due_this_month = []
    future = []
    
    for obl in obligations:
        if obl.get('status') == 'completed':
            continue
            
        due_date_str = obl.get('due_date')
        if not due_date_str:
            continue
            
        due_date = datetime.fromisoformat(due_date_str.replace('Z', '+00:00'))
        days_until = (due_date - now).days
        
        if days_until < 0:
            overdue.append(obl)
        elif days_until <= 7:
            due_this_week.append(obl)
        elif days_until <= 30:
            due_this_month.append(obl)
        else:
            future.append(obl)
    
    return {
        'summary': {
            'total_obligations': len(obligations),
            'overdue': len(overdue),
            'due_this_week': len(due_this_week),
            'due_this_month': len(due_this_month),
        },
        'overdue': format_obligations(overdue),
        'due_this_week': format_obligations(due_this_week),
        'due_this_month': format_obligations(due_this_month),
        'upcoming': format_obligations(future[:10]),  # Next 10 future obligations
    }


def generate_compliance_report(matter_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate playbook compliance report."""
    clauses = matter_data.get('clauses', [])
    playbook_id = matter_data.get('playbook_id')
    
    # Compliance checks
    required_clauses = [
        'indemnification', 'limitation_of_liability', 'confidentiality',
        'termination_for_convenience', 'governing_law', 'notice_requirements',
    ]
    
    present_types = set(c.get('clause_type') for c in clauses)
    missing = [ct for ct in required_clauses if ct not in present_types]
    
    # Non-compliant clauses
    non_compliant = [
        c for c in clauses
        if c.get('playbook_compliant') is False
    ]
    
    return {
        'playbook_id': playbook_id,
        'overall_compliance': calculate_compliance_score(clauses),
        'clause_coverage': {
            'required': required_clauses,
            'present': list(present_types),
            'missing': missing,
        },
        'non_compliant_clauses': [
            {
                'id': c.get('id'),
                'type': c.get('clause_type'),
                'deviation': c.get('playbook_deviation'),
                'document_id': c.get('document_id'),
            }
            for c in non_compliant
        ],
        'recommendations': generate_compliance_recommendations(missing, non_compliant),
    }


def count_by_field(items: List[Dict], field: str) -> Dict[str, int]:
    """Count items by a specific field."""
    counts: Dict[str, int] = {}
    for item in items:
        value = item.get(field, 'unknown')
        counts[value] = counts.get(value, 0) + 1
    return counts


def extract_key_dates(matter_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract key dates from matter data."""
    dates = []
    
    # Matter dates
    if matter_data.get('start_date'):
        dates.append({'type': 'Matter Start', 'date': matter_data['start_date']})
    if matter_data.get('target_close_date'):
        dates.append({'type': 'Target Close', 'date': matter_data['target_close_date']})
    
    # Upcoming obligations
    for obl in matter_data.get('obligations', [])[:5]:
        if obl.get('due_date'):
            dates.append({
                'type': f"Obligation: {obl.get('title', 'Unnamed')}",
                'date': obl['due_date'],
            })
    
    return sorted(dates, key=lambda x: x['date'])


def format_obligations(obligations: List[Dict]) -> List[Dict[str, Any]]:
    """Format obligations for report."""
    return [
        {
            'id': o.get('id'),
            'title': o.get('title'),
            'type': o.get('obligation_type'),
            'due_date': o.get('due_date'),
            'party': o.get('responsible_party'),
            'document_id': o.get('document_id'),
        }
        for o in obligations
    ]


def calculate_compliance_score(clauses: List[Dict]) -> float:
    """Calculate overall compliance score."""
    if not clauses:
        return 0.0
    
    compliant = sum(1 for c in clauses if c.get('playbook_compliant', True))
    return round((compliant / len(clauses)) * 100, 1)


def generate_risk_recommendations(flags: List[Dict], clauses: List[Dict]) -> List[str]:
    """Generate risk mitigation recommendations."""
    recommendations = []
    
    critical_flags = [f for f in flags if f.get('severity') == 'critical']
    if critical_flags:
        recommendations.append(
            f"Address {len(critical_flags)} critical risk flags immediately"
        )
    
    high_risk_clauses = [c for c in clauses if c.get('risk_score', 0) >= 80]
    if high_risk_clauses:
        recommendations.append(
            f"Review {len(high_risk_clauses)} high-risk clauses with senior counsel"
        )
    
    return recommendations


def generate_compliance_recommendations(
    missing: List[str],
    non_compliant: List[Dict]
) -> List[str]:
    """Generate compliance recommendations."""
    recommendations = []
    
    if missing:
        recommendations.append(
            f"Add missing required clauses: {', '.join(missing)}"
        )
    
    if non_compliant:
        recommendations.append(
            f"Review {len(non_compliant)} clauses that deviate from playbook"
        )
    
    return recommendations


def store_report(
    client: httpx.Client,
    tenant_id: str,
    matter_id: str,
    report_type: str,
    content: Dict[str, Any]
) -> str:
    """Store generated report."""
    response = client.post(
        f'{API_SERVICE_URL}/internal/reports',
        headers={
            'X-Tenant-ID': tenant_id,
            'X-Internal-Key': get_internal_key(),
        },
        json={
            'matter_id': matter_id,
            'report_type': report_type,
            'content': content,
        },
    )
    
    if response.status_code != 200:
        raise Exception(f'Failed to store report: {response.text}')
    
    return response.json().get('id')


@shared_task(bind=True)
def generate_weekly_reports(self) -> Dict[str, Any]:
    """Generate weekly reports for all active matters."""
    logger.info('Starting weekly report generation')
    
    try:
        with httpx.Client(timeout=60.0) as client:
            # Get all active matters across tenants
            response = client.get(
                f'{API_SERVICE_URL}/internal/matters/active',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if response.status_code != 200:
                raise Exception('Failed to fetch active matters')
            
            matters = response.json()
            
            # Queue report generation for each matter
            tasks = []
            for matter in matters:
                task = generate_matter_report.s(
                    matter['tenant_id'],
                    matter['id'],
                    'summary',
                    {'period': 'weekly'}
                )
                tasks.append(task)
            
            # Execute in parallel
            if tasks:
                job = group(tasks)
                result = job.apply_async()
                
            logger.info(f'Queued weekly reports for {len(matters)} matters')
            
            return {
                'status': 'success',
                'matters_count': len(matters),
            }
            
    except Exception as e:
        logger.error(f'Error in weekly report generation: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True)
def generate_monthly_reports(self) -> Dict[str, Any]:
    """Generate monthly comprehensive reports."""
    logger.info('Starting monthly report generation')
    
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.get(
                f'{API_SERVICE_URL}/internal/tenants/active',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if response.status_code != 200:
                raise Exception('Failed to fetch active tenants')
            
            tenants = response.json()
            
            # Generate tenant-level monthly reports
            for tenant in tenants:
                generate_tenant_monthly_report.delay(
                    tenant['id'],
                    (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    datetime.utcnow().isoformat()
                )
            
            logger.info(f'Queued monthly reports for {len(tenants)} tenants')
            
            return {
                'status': 'success',
                'tenants_count': len(tenants),
            }
            
    except Exception as e:
        logger.error(f'Error in monthly report generation: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True, max_retries=2)
def generate_tenant_monthly_report(
    self,
    tenant_id: str,
    start_date: str,
    end_date: str
) -> Dict[str, Any]:
    """Generate monthly analytics report for a tenant."""
    logger.info(f'Generating monthly report for tenant {tenant_id}')
    
    try:
        with httpx.Client(timeout=300.0) as client:
            # Fetch tenant analytics
            response = client.get(
                f'{API_SERVICE_URL}/internal/tenants/{tenant_id}/analytics',
                headers={'X-Internal-Key': get_internal_key()},
                params={'start_date': start_date, 'end_date': end_date},
            )
            
            if response.status_code != 200:
                raise Exception('Failed to fetch tenant analytics')
            
            analytics = response.json()
            
            report = {
                'tenant_id': tenant_id,
                'period': {'start': start_date, 'end': end_date},
                'generated_at': datetime.utcnow().isoformat(),
                'metrics': analytics,
            }
            
            # Store report
            store_response = client.post(
                f'{API_SERVICE_URL}/internal/reports/tenant',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
                json=report,
            )
            
            logger.info(f'Monthly report generated for tenant {tenant_id}')
            
            return {'status': 'success', 'tenant_id': tenant_id}
            
    except Exception as e:
        logger.error(f'Error generating tenant report: {e}')
        raise self.retry(exc=e)


def get_internal_key() -> str:
    """Get internal service communication key."""
    import os
    return os.getenv('INTERNAL_SERVICE_KEY', 'internal-key-for-dev')
