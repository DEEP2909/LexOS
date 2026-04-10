# EvidentIS AI Worker - Analytics Tasks
# Handles analytics aggregation and computation

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import httpx
from celery import shared_task

logger = logging.getLogger(__name__)

API_SERVICE_URL = 'http://api:3000'


@shared_task(bind=True)
def aggregate_hourly(self) -> Dict[str, Any]:
    """
    Aggregate hourly analytics metrics.
    Runs every hour via Celery Beat.
    """
    logger.info('Starting hourly analytics aggregation')
    
    try:
        now = datetime.utcnow()
        hour_start = now.replace(minute=0, second=0, microsecond=0)
        hour_end = hour_start + timedelta(hours=1)
        
        with httpx.Client(timeout=120.0) as client:
            # Get all active tenants
            tenants_response = client.get(
                f'{API_SERVICE_URL}/internal/tenants/active',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if tenants_response.status_code != 200:
                raise Exception('Failed to fetch tenants')
            
            tenants = tenants_response.json()
            
            processed = 0
            for tenant in tenants:
                try:
                    aggregate_tenant_hourly(
                        client, tenant['id'], hour_start, hour_end
                    )
                    processed += 1
                except Exception as e:
                    logger.error(f'Error aggregating for tenant {tenant["id"]}: {e}')
            
            logger.info(f'Hourly aggregation complete: {processed}/{len(tenants)} tenants')
            
            return {
                'status': 'success',
                'tenants_processed': processed,
                'hour': hour_start.isoformat(),
            }
            
    except Exception as e:
        logger.error(f'Error in hourly aggregation: {e}')
        return {'status': 'error', 'error': str(e)}


def aggregate_tenant_hourly(
    client: httpx.Client,
    tenant_id: str,
    hour_start: datetime,
    hour_end: datetime
) -> None:
    """Aggregate hourly metrics for a single tenant."""
    
    # Fetch raw events for the hour
    events_response = client.get(
        f'{API_SERVICE_URL}/internal/events',
        headers={
            'X-Tenant-ID': tenant_id,
            'X-Internal-Key': get_internal_key(),
        },
        params={
            'start': hour_start.isoformat(),
            'end': hour_end.isoformat(),
        },
    )
    
    if events_response.status_code != 200:
        raise Exception('Failed to fetch events')
    
    events = events_response.json()
    
    # Compute aggregates
    metrics = {
        'document_uploads': 0,
        'document_views': 0,
        'research_queries': 0,
        'clause_extractions': 0,
        'risk_assessments': 0,
        'flags_created': 0,
        'flags_resolved': 0,
        'active_users': set(),
        'api_calls': 0,
    }
    
    for event in events:
        event_type = event.get('type')
        
        if event_type == 'document.uploaded':
            metrics['document_uploads'] += 1
        elif event_type == 'document.viewed':
            metrics['document_views'] += 1
        elif event_type == 'research.query':
            metrics['research_queries'] += 1
        elif event_type == 'clause.extracted':
            metrics['clause_extractions'] += 1
        elif event_type == 'risk.assessed':
            metrics['risk_assessments'] += 1
        elif event_type == 'flag.created':
            metrics['flags_created'] += 1
        elif event_type == 'flag.resolved':
            metrics['flags_resolved'] += 1
        
        if event.get('user_id'):
            metrics['active_users'].add(event['user_id'])
        
        metrics['api_calls'] += 1
    
    # Convert set to count
    metrics['active_users'] = len(metrics['active_users'])
    
    # Store aggregated metrics
    client.post(
        f'{API_SERVICE_URL}/internal/analytics/hourly',
        headers={
            'X-Tenant-ID': tenant_id,
            'X-Internal-Key': get_internal_key(),
        },
        json={
            'hour': hour_start.isoformat(),
            'metrics': metrics,
        },
    )


@shared_task(bind=True)
def rollup_daily(self) -> Dict[str, Any]:
    """
    Roll up hourly metrics into daily summaries.
    Runs daily at 00:15 via Celery Beat.
    """
    logger.info('Starting daily analytics rollup')
    
    try:
        yesterday = (datetime.utcnow() - timedelta(days=1)).date()
        
        with httpx.Client(timeout=300.0) as client:
            # Get all active tenants
            tenants_response = client.get(
                f'{API_SERVICE_URL}/internal/tenants/active',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if tenants_response.status_code != 200:
                raise Exception('Failed to fetch tenants')
            
            tenants = tenants_response.json()
            
            processed = 0
            for tenant in tenants:
                try:
                    rollup_tenant_daily(client, tenant['id'], yesterday)
                    processed += 1
                except Exception as e:
                    logger.error(f'Error rolling up for tenant {tenant["id"]}: {e}')
            
            logger.info(f'Daily rollup complete: {processed}/{len(tenants)} tenants')
            
            return {
                'status': 'success',
                'tenants_processed': processed,
                'date': yesterday.isoformat(),
            }
            
    except Exception as e:
        logger.error(f'Error in daily rollup: {e}')
        return {'status': 'error', 'error': str(e)}


def rollup_tenant_daily(
    client: httpx.Client,
    tenant_id: str,
    date: datetime.date
) -> None:
    """Roll up hourly metrics into daily summary for a tenant."""
    
    # Fetch hourly data for the day
    hourly_response = client.get(
        f'{API_SERVICE_URL}/internal/analytics/hourly',
        headers={
            'X-Tenant-ID': tenant_id,
            'X-Internal-Key': get_internal_key(),
        },
        params={'date': date.isoformat()},
    )
    
    if hourly_response.status_code != 200:
        raise Exception('Failed to fetch hourly data')
    
    hourly_data = hourly_response.json()
    
    # Aggregate hourly into daily
    daily_metrics = {
        'document_uploads': 0,
        'document_views': 0,
        'research_queries': 0,
        'clause_extractions': 0,
        'risk_assessments': 0,
        'flags_created': 0,
        'flags_resolved': 0,
        'active_users': 0,
        'api_calls': 0,
        'peak_hour': None,
        'peak_api_calls': 0,
    }
    
    all_users = set()
    
    for hour in hourly_data:
        metrics = hour.get('metrics', {})
        
        daily_metrics['document_uploads'] += metrics.get('document_uploads', 0)
        daily_metrics['document_views'] += metrics.get('document_views', 0)
        daily_metrics['research_queries'] += metrics.get('research_queries', 0)
        daily_metrics['clause_extractions'] += metrics.get('clause_extractions', 0)
        daily_metrics['risk_assessments'] += metrics.get('risk_assessments', 0)
        daily_metrics['flags_created'] += metrics.get('flags_created', 0)
        daily_metrics['flags_resolved'] += metrics.get('flags_resolved', 0)
        daily_metrics['api_calls'] += metrics.get('api_calls', 0)
        
        # Track peak hour
        if metrics.get('api_calls', 0) > daily_metrics['peak_api_calls']:
            daily_metrics['peak_api_calls'] = metrics['api_calls']
            daily_metrics['peak_hour'] = hour.get('hour')
    
    # Get unique active users for the day
    users_response = client.get(
        f'{API_SERVICE_URL}/internal/analytics/active-users',
        headers={
            'X-Tenant-ID': tenant_id,
            'X-Internal-Key': get_internal_key(),
        },
        params={'date': date.isoformat()},
    )
    
    if users_response.status_code == 200:
        daily_metrics['active_users'] = users_response.json().get('count', 0)
    
    # Store daily summary
    client.post(
        f'{API_SERVICE_URL}/internal/analytics/daily',
        headers={
            'X-Tenant-ID': tenant_id,
            'X-Internal-Key': get_internal_key(),
        },
        json={
            'date': date.isoformat(),
            'metrics': daily_metrics,
        },
    )


@shared_task(bind=True)
def compute_health_scores(self) -> Dict[str, Any]:
    """
    Compute matter health scores based on flags and activity.
    Runs hourly to keep scores current.
    """
    logger.info('Starting health score computation')
    
    try:
        with httpx.Client(timeout=300.0) as client:
            # Get matters that need score update
            matters_response = client.get(
                f'{API_SERVICE_URL}/internal/matters/needs-health-update',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if matters_response.status_code != 200:
                raise Exception('Failed to fetch matters')
            
            matters = matters_response.json()
            
            updated = 0
            for matter in matters:
                try:
                    score = compute_matter_health_score(client, matter)
                    
                    # Update score
                    client.patch(
                        f'{API_SERVICE_URL}/internal/matters/{matter["id"]}/health-score',
                        headers={
                            'X-Tenant-ID': matter['tenant_id'],
                            'X-Internal-Key': get_internal_key(),
                        },
                        json={'health_score': score},
                    )
                    
                    updated += 1
                except Exception as e:
                    logger.error(f'Error computing health for matter {matter["id"]}: {e}')
            
            logger.info(f'Health score computation complete: {updated} matters updated')
            
            return {
                'status': 'success',
                'matters_updated': updated,
            }
            
    except Exception as e:
        logger.error(f'Error in health score computation: {e}')
        return {'status': 'error', 'error': str(e)}


def compute_matter_health_score(
    client: httpx.Client,
    matter: Dict[str, Any]
) -> int:
    """
    Compute health score for a matter (0-100).
    
    Factors:
    - Flag severity and count (-points)
    - Overdue obligations (-points)
    - Document completeness (+points)
    - Playbook compliance (+points)
    """
    score = 100
    
    # Get flags
    flags_response = client.get(
        f'{API_SERVICE_URL}/internal/matters/{matter["id"]}/flags',
        headers={
            'X-Tenant-ID': matter['tenant_id'],
            'X-Internal-Key': get_internal_key(),
        },
    )
    
    if flags_response.status_code == 200:
        flags = flags_response.json()
        unresolved = [f for f in flags if f.get('status') != 'resolved']
        
        for flag in unresolved:
            severity = flag.get('severity', 'low')
            if severity == 'critical':
                score -= 15
            elif severity == 'high':
                score -= 10
            elif severity == 'medium':
                score -= 5
            else:
                score -= 2
    
    # Get obligations
    obls_response = client.get(
        f'{API_SERVICE_URL}/internal/matters/{matter["id"]}/obligations',
        headers={
            'X-Tenant-ID': matter['tenant_id'],
            'X-Internal-Key': get_internal_key(),
        },
    )
    
    if obls_response.status_code == 200:
        obligations = obls_response.json()
        now = datetime.utcnow()
        
        for obl in obligations:
            if obl.get('status') == 'completed':
                continue
            
            due_date_str = obl.get('due_date')
            if due_date_str:
                due_date = datetime.fromisoformat(due_date_str.replace('Z', '+00:00'))
                if due_date < now:
                    days_overdue = (now - due_date).days
                    score -= min(20, days_overdue * 2)  # Cap at -20 per obligation
    
    # Get compliance metrics
    compliance_response = client.get(
        f'{API_SERVICE_URL}/internal/matters/{matter["id"]}/compliance',
        headers={
            'X-Tenant-ID': matter['tenant_id'],
            'X-Internal-Key': get_internal_key(),
        },
    )
    
    if compliance_response.status_code == 200:
        compliance = compliance_response.json()
        compliance_rate = compliance.get('compliance_rate', 100)
        
        # Boost for high compliance, penalty for low
        if compliance_rate >= 90:
            score += 5
        elif compliance_rate < 70:
            score -= 10
    
    # Ensure score stays in bounds
    return max(0, min(100, score))


@shared_task(bind=True)
def compute_firm_analytics(self, tenant_id: str) -> Dict[str, Any]:
    """
    Compute firm-wide analytics for a tenant.
    Called on-demand or weekly.
    """
    logger.info(f'Computing firm analytics for tenant {tenant_id}')
    
    try:
        with httpx.Client(timeout=300.0) as client:
            # Get all matters
            matters_response = client.get(
                f'{API_SERVICE_URL}/internal/matters',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
            )
            
            if matters_response.status_code != 200:
                raise Exception('Failed to fetch matters')
            
            matters = matters_response.json()
            
            # Compute aggregate metrics
            analytics = {
                'total_matters': len(matters),
                'active_matters': len([m for m in matters if m.get('status') == 'active']),
                'total_documents': 0,
                'total_clauses': 0,
                'total_flags': 0,
                'unresolved_flags': 0,
                'average_health_score': 0,
                'matters_by_status': defaultdict(int),
                'flags_by_severity': defaultdict(int),
                'top_flag_categories': defaultdict(int),
            }
            
            health_scores = []
            
            for matter in matters:
                analytics['matters_by_status'][matter.get('status', 'unknown')] += 1
                analytics['total_documents'] += matter.get('document_count', 0)
                
                if matter.get('health_score'):
                    health_scores.append(matter['health_score'])
                
                # Get flags for matter
                flags_response = client.get(
                    f'{API_SERVICE_URL}/internal/matters/{matter["id"]}/flags',
                    headers={
                        'X-Tenant-ID': tenant_id,
                        'X-Internal-Key': get_internal_key(),
                    },
                )
                
                if flags_response.status_code == 200:
                    flags = flags_response.json()
                    analytics['total_flags'] += len(flags)
                    
                    for flag in flags:
                        if flag.get('status') != 'resolved':
                            analytics['unresolved_flags'] += 1
                        
                        analytics['flags_by_severity'][flag.get('severity', 'low')] += 1
                        analytics['top_flag_categories'][flag.get('category', 'other')] += 1
            
            if health_scores:
                analytics['average_health_score'] = sum(health_scores) / len(health_scores)
            
            # Convert defaultdicts to regular dicts
            analytics['matters_by_status'] = dict(analytics['matters_by_status'])
            analytics['flags_by_severity'] = dict(analytics['flags_by_severity'])
            analytics['top_flag_categories'] = dict(
                sorted(
                    analytics['top_flag_categories'].items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:10]
            )
            
            # Store analytics
            client.post(
                f'{API_SERVICE_URL}/internal/analytics/firm',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
                json={
                    'computed_at': datetime.utcnow().isoformat(),
                    'metrics': analytics,
                },
            )
            
            logger.info(f'Firm analytics computed for tenant {tenant_id}')
            
            return {
                'status': 'success',
                'tenant_id': tenant_id,
                'metrics': analytics,
            }
            
    except Exception as e:
        logger.error(f'Error computing firm analytics: {e}')
        return {'status': 'error', 'error': str(e)}


def get_internal_key() -> str:
    """Get internal service communication key."""
    import os
    return os.getenv('INTERNAL_SERVICE_KEY', 'internal-key-for-dev')
