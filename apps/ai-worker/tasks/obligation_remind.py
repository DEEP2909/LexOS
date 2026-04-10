# EvidentIS AI Worker - Obligation Reminder Tasks
# Handles deadline notifications and overdue alerts

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import httpx
from celery import shared_task

logger = logging.getLogger(__name__)

API_SERVICE_URL = 'http://api:3000'


@shared_task(bind=True)
def send_daily_reminders(self) -> Dict[str, Any]:
    """
    Send daily obligation reminders.
    Runs every morning at 8 AM via Celery Beat.
    """
    logger.info('Starting daily obligation reminders')
    
    try:
        with httpx.Client(timeout=120.0) as client:
            # Get all upcoming obligations across tenants
            today = datetime.utcnow().date()
            upcoming_dates = [
                (today, 'today'),
                (today + timedelta(days=1), 'tomorrow'),
                (today + timedelta(days=3), '3_days'),
                (today + timedelta(days=7), '7_days'),
            ]
            
            total_sent = 0
            
            for target_date, period in upcoming_dates:
                response = client.get(
                    f'{API_SERVICE_URL}/internal/obligations/due',
                    headers={'X-Internal-Key': get_internal_key()},
                    params={'date': target_date.isoformat()},
                )
                
                if response.status_code != 200:
                    logger.error(f'Failed to fetch obligations for {target_date}')
                    continue
                
                obligations = response.json()
                
                for obligation in obligations:
                    send_obligation_reminder.delay(
                        obligation['tenant_id'],
                        obligation['id'],
                        period
                    )
                    total_sent += 1
            
            logger.info(f'Queued {total_sent} obligation reminders')
            
            return {
                'status': 'success',
                'reminders_sent': total_sent,
            }
            
    except Exception as e:
        logger.error(f'Error in daily reminders: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_obligation_reminder(
    self,
    tenant_id: str,
    obligation_id: str,
    period: str
) -> Dict[str, Any]:
    """
    Send reminder for a specific obligation.
    
    Args:
        tenant_id: Tenant ID
        obligation_id: Obligation ID
        period: Reminder period (today, tomorrow, 3_days, 7_days)
    """
    logger.info(f'Sending {period} reminder for obligation {obligation_id}')
    
    try:
        with httpx.Client(timeout=30.0) as client:
            # Get obligation details
            response = client.get(
                f'{API_SERVICE_URL}/internal/obligations/{obligation_id}',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
            )
            
            if response.status_code != 200:
                raise Exception('Failed to fetch obligation details')
            
            obligation = response.json()
            
            # Get assigned attorneys
            assignees = obligation.get('assignees', [])
            if not assignees:
                assignees = [obligation.get('responsible_attorney')]
            
            # Determine notification priority
            priority = 'normal'
            if period == 'today':
                priority = 'high'
            elif period == 'tomorrow':
                priority = 'high'
            
            # Send notification to each assignee
            for assignee_id in assignees:
                if not assignee_id:
                    continue
                    
                notification_response = client.post(
                    f'{API_SERVICE_URL}/internal/notifications',
                    headers={
                        'X-Tenant-ID': tenant_id,
                        'X-Internal-Key': get_internal_key(),
                    },
                    json={
                        'type': 'obligation_reminder',
                        'recipient_id': assignee_id,
                        'priority': priority,
                        'title': get_reminder_title(period, obligation),
                        'body': get_reminder_body(period, obligation),
                        'data': {
                            'obligation_id': obligation_id,
                            'matter_id': obligation.get('matter_id'),
                            'due_date': obligation.get('due_date'),
                        },
                        'channels': ['in_app', 'email'] if period in ['today', 'tomorrow'] else ['in_app'],
                    },
                )
                
                if notification_response.status_code != 200:
                    logger.warning(f'Failed to send notification to {assignee_id}')
            
            # Record reminder sent
            client.post(
                f'{API_SERVICE_URL}/internal/obligations/{obligation_id}/reminder-sent',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
                json={'period': period, 'sent_at': datetime.utcnow().isoformat()},
            )
            
            logger.info(f'Reminder sent for obligation {obligation_id}')
            
            return {
                'status': 'success',
                'obligation_id': obligation_id,
                'assignees_notified': len([a for a in assignees if a]),
            }
            
    except Exception as e:
        logger.error(f'Error sending reminder for {obligation_id}: {e}')
        raise self.retry(exc=e)


@shared_task(bind=True)
def check_overdue(self) -> Dict[str, Any]:
    """
    Check for overdue obligations and send alerts.
    Runs every 4 hours via Celery Beat.
    """
    logger.info('Checking for overdue obligations')
    
    try:
        with httpx.Client(timeout=120.0) as client:
            # Get all overdue obligations
            response = client.get(
                f'{API_SERVICE_URL}/internal/obligations/overdue',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if response.status_code != 200:
                raise Exception('Failed to fetch overdue obligations')
            
            overdue = response.json()
            
            # Group by tenant and matter for efficient notification
            by_tenant: Dict[str, List[Dict]] = {}
            for obl in overdue:
                tenant_id = obl['tenant_id']
                if tenant_id not in by_tenant:
                    by_tenant[tenant_id] = []
                by_tenant[tenant_id].append(obl)
            
            total_alerts = 0
            
            for tenant_id, obligations in by_tenant.items():
                # Send individual alerts
                for obl in obligations:
                    send_overdue_alert.delay(tenant_id, obl['id'])
                    total_alerts += 1
                
                # Send summary to admin if many overdue
                if len(obligations) >= 5:
                    send_overdue_summary.delay(tenant_id, [o['id'] for o in obligations])
            
            logger.info(f'Processed {total_alerts} overdue obligations')
            
            return {
                'status': 'success',
                'overdue_count': len(overdue),
                'tenants_affected': len(by_tenant),
            }
            
    except Exception as e:
        logger.error(f'Error checking overdue obligations: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True, max_retries=3)
def send_overdue_alert(
    self,
    tenant_id: str,
    obligation_id: str
) -> Dict[str, Any]:
    """Send urgent alert for an overdue obligation."""
    logger.info(f'Sending overdue alert for obligation {obligation_id}')
    
    try:
        with httpx.Client(timeout=30.0) as client:
            # Get obligation details
            response = client.get(
                f'{API_SERVICE_URL}/internal/obligations/{obligation_id}',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
            )
            
            if response.status_code != 200:
                raise Exception('Failed to fetch obligation')
            
            obligation = response.json()
            
            # Check if alert already sent recently
            if obligation.get('last_overdue_alert'):
                last_alert = datetime.fromisoformat(
                    obligation['last_overdue_alert'].replace('Z', '+00:00')
                )
                if (datetime.utcnow() - last_alert).hours < 24:
                    return {'status': 'skipped', 'reason': 'Alert sent within 24h'}
            
            # Get assignees and matter lead
            assignees = obligation.get('assignees', [])
            if obligation.get('responsible_attorney'):
                assignees.append(obligation['responsible_attorney'])
            
            # Get matter lead for escalation
            matter_response = client.get(
                f'{API_SERVICE_URL}/internal/matters/{obligation["matter_id"]}',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
            )
            
            if matter_response.status_code == 200:
                matter = matter_response.json()
                if matter.get('lead_attorney_id'):
                    assignees.append(matter['lead_attorney_id'])
            
            # Send urgent notification
            days_overdue = calculate_days_overdue(obligation.get('due_date'))
            
            for assignee_id in set(assignees):  # Dedupe
                if not assignee_id:
                    continue
                    
                client.post(
                    f'{API_SERVICE_URL}/internal/notifications',
                    headers={
                        'X-Tenant-ID': tenant_id,
                        'X-Internal-Key': get_internal_key(),
                    },
                    json={
                        'type': 'obligation_overdue',
                        'recipient_id': assignee_id,
                        'priority': 'urgent',
                        'title': f'⚠️ OVERDUE: {obligation.get("title", "Obligation")}',
                        'body': (
                            f'This obligation is {days_overdue} days overdue. '
                            f'Due: {format_date(obligation.get("due_date"))}. '
                            f'Matter: {obligation.get("matter_name", "Unknown")}'
                        ),
                        'data': {
                            'obligation_id': obligation_id,
                            'matter_id': obligation.get('matter_id'),
                            'days_overdue': days_overdue,
                        },
                        'channels': ['in_app', 'email', 'push'],
                    },
                )
            
            # Update last alert timestamp
            client.patch(
                f'{API_SERVICE_URL}/internal/obligations/{obligation_id}',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
                json={'last_overdue_alert': datetime.utcnow().isoformat()},
            )
            
            return {
                'status': 'success',
                'obligation_id': obligation_id,
                'days_overdue': days_overdue,
            }
            
    except Exception as e:
        logger.error(f'Error sending overdue alert: {e}')
        raise self.retry(exc=e)


@shared_task(bind=True)
def send_overdue_summary(
    self,
    tenant_id: str,
    obligation_ids: List[str]
) -> Dict[str, Any]:
    """Send summary of overdue obligations to tenant admin."""
    logger.info(f'Sending overdue summary for tenant {tenant_id}')
    
    try:
        with httpx.Client(timeout=60.0) as client:
            # Get tenant admins
            admin_response = client.get(
                f'{API_SERVICE_URL}/internal/tenants/{tenant_id}/admins',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if admin_response.status_code != 200:
                raise Exception('Failed to fetch tenant admins')
            
            admins = admin_response.json()
            
            # Send summary notification
            for admin in admins:
                client.post(
                    f'{API_SERVICE_URL}/internal/notifications',
                    headers={
                        'X-Tenant-ID': tenant_id,
                        'X-Internal-Key': get_internal_key(),
                    },
                    json={
                        'type': 'overdue_summary',
                        'recipient_id': admin['id'],
                        'priority': 'high',
                        'title': f'⚠️ {len(obligation_ids)} Obligations Overdue',
                        'body': (
                            f'Your firm has {len(obligation_ids)} overdue obligations '
                            f'that require immediate attention.'
                        ),
                        'data': {
                            'obligation_ids': obligation_ids,
                            'count': len(obligation_ids),
                        },
                        'channels': ['in_app', 'email'],
                    },
                )
            
            return {
                'status': 'success',
                'tenant_id': tenant_id,
                'overdue_count': len(obligation_ids),
                'admins_notified': len(admins),
            }
            
    except Exception as e:
        logger.error(f'Error sending overdue summary: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True, max_retries=3)
def trigger_webhook_for_deadline(
    self,
    tenant_id: str,
    obligation_id: str,
    event_type: str
) -> Dict[str, Any]:
    """
    Trigger webhook for obligation deadline events.
    
    Event types:
    - obligation.approaching (7 days, 3 days, 1 day)
    - obligation.due_today
    - obligation.overdue
    """
    logger.info(f'Triggering webhook {event_type} for obligation {obligation_id}')
    
    try:
        with httpx.Client(timeout=30.0) as client:
            # Get obligation data
            obl_response = client.get(
                f'{API_SERVICE_URL}/internal/obligations/{obligation_id}',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
            )
            
            if obl_response.status_code != 200:
                raise Exception('Failed to fetch obligation')
            
            obligation = obl_response.json()
            
            # Trigger webhook
            webhook_response = client.post(
                f'{API_SERVICE_URL}/internal/webhooks/trigger',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
                json={
                    'event': event_type,
                    'payload': {
                        'obligation_id': obligation_id,
                        'matter_id': obligation.get('matter_id'),
                        'title': obligation.get('title'),
                        'due_date': obligation.get('due_date'),
                        'obligation_type': obligation.get('obligation_type'),
                        'responsible_party': obligation.get('responsible_party'),
                    },
                },
            )
            
            return {
                'status': 'success',
                'event': event_type,
                'webhook_response': webhook_response.status_code,
            }
            
    except Exception as e:
        logger.error(f'Error triggering webhook: {e}')
        raise self.retry(exc=e)


def get_reminder_title(period: str, obligation: Dict) -> str:
    """Generate reminder notification title."""
    title = obligation.get('title', 'Obligation')
    
    if period == 'today':
        return f'🔴 Due Today: {title}'
    elif period == 'tomorrow':
        return f'🟠 Due Tomorrow: {title}'
    elif period == '3_days':
        return f'🟡 Due in 3 Days: {title}'
    elif period == '7_days':
        return f'📅 Due in 7 Days: {title}'
    else:
        return f'Reminder: {title}'


def get_reminder_body(period: str, obligation: Dict) -> str:
    """Generate reminder notification body."""
    matter_name = obligation.get('matter_name', 'Unknown Matter')
    due_date = format_date(obligation.get('due_date'))
    
    return f'{obligation.get("description", "")}. Matter: {matter_name}. Due: {due_date}'


def format_date(date_str: Optional[str]) -> str:
    """Format date string for display."""
    if not date_str:
        return 'Unknown'
    try:
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return dt.strftime('%B %d, %Y')
    except:
        return date_str


def calculate_days_overdue(due_date_str: Optional[str]) -> int:
    """Calculate number of days overdue."""
    if not due_date_str:
        return 0
    try:
        due_date = datetime.fromisoformat(due_date_str.replace('Z', '+00:00'))
        delta = datetime.utcnow() - due_date
        return max(0, delta.days)
    except:
        return 0


def get_internal_key() -> str:
    """Get internal service communication key."""
    import os
    return os.getenv('INTERNAL_SERVICE_KEY', 'internal-key-for-dev')
