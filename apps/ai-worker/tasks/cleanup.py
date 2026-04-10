# EvidentIS AI Worker - Cleanup Tasks
# Handles scheduled cleanup of expired data and orphaned files

import logging
from typing import Dict, Any, List
from datetime import datetime, timedelta
import httpx
from celery import shared_task

logger = logging.getLogger(__name__)

API_SERVICE_URL = 'http://api:3000'


@shared_task(bind=True)
def cleanup_expired_sessions(self) -> Dict[str, Any]:
    """
    Clean up expired sessions, tokens, and temporary data.
    Runs daily at 3 AM via Celery Beat.
    """
    logger.info('Starting cleanup of expired sessions')
    
    results = {
        'sessions_deleted': 0,
        'refresh_tokens_deleted': 0,
        'password_reset_tokens_deleted': 0,
        'mfa_challenges_deleted': 0,
        'saml_requests_deleted': 0,
    }
    
    try:
        with httpx.Client(timeout=120.0) as client:
            # Clean up expired sessions
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/sessions',
                headers={'X-Internal-Key': get_internal_key()},
            )
            if response.status_code == 200:
                results['sessions_deleted'] = response.json().get('deleted', 0)
            
            # Clean up expired refresh tokens
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/refresh-tokens',
                headers={'X-Internal-Key': get_internal_key()},
            )
            if response.status_code == 200:
                results['refresh_tokens_deleted'] = response.json().get('deleted', 0)
            
            # Clean up expired password reset tokens
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/password-reset-tokens',
                headers={'X-Internal-Key': get_internal_key()},
            )
            if response.status_code == 200:
                results['password_reset_tokens_deleted'] = response.json().get('deleted', 0)
            
            # Clean up expired MFA challenges
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/mfa-challenges',
                headers={'X-Internal-Key': get_internal_key()},
            )
            if response.status_code == 200:
                results['mfa_challenges_deleted'] = response.json().get('deleted', 0)
            
            # Clean up expired SAML requests
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/saml-requests',
                headers={'X-Internal-Key': get_internal_key()},
            )
            if response.status_code == 200:
                results['saml_requests_deleted'] = response.json().get('deleted', 0)
        
        total_deleted = sum(results.values())
        logger.info(f'Session cleanup complete: {total_deleted} items deleted')
        
        return {'status': 'success', **results}
        
    except Exception as e:
        logger.error(f'Error in session cleanup: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True)
def cleanup_orphaned_files(self) -> Dict[str, Any]:
    """
    Clean up orphaned files in storage.
    Runs weekly on Sunday at 4 AM via Celery Beat.
    """
    logger.info('Starting cleanup of orphaned files')
    
    results = {
        'quarantine_files_deleted': 0,
        'orphaned_uploads_deleted': 0,
        'temp_files_deleted': 0,
        'bytes_freed': 0,
    }
    
    try:
        with httpx.Client(timeout=300.0) as client:
            # Clean up old quarantine files (malware scan failures > 7 days)
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/quarantine',
                headers={'X-Internal-Key': get_internal_key()},
                params={'older_than_days': 7},
            )
            if response.status_code == 200:
                data = response.json()
                results['quarantine_files_deleted'] = data.get('deleted', 0)
                results['bytes_freed'] += data.get('bytes_freed', 0)
            
            # Clean up orphaned uploads (uploads without document records > 24h)
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/orphaned-uploads',
                headers={'X-Internal-Key': get_internal_key()},
                params={'older_than_hours': 24},
            )
            if response.status_code == 200:
                data = response.json()
                results['orphaned_uploads_deleted'] = data.get('deleted', 0)
                results['bytes_freed'] += data.get('bytes_freed', 0)
            
            # Clean up temporary files
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/temp-files',
                headers={'X-Internal-Key': get_internal_key()},
                params={'older_than_hours': 12},
            )
            if response.status_code == 200:
                data = response.json()
                results['temp_files_deleted'] = data.get('deleted', 0)
                results['bytes_freed'] += data.get('bytes_freed', 0)
        
        total_deleted = (
            results['quarantine_files_deleted'] +
            results['orphaned_uploads_deleted'] +
            results['temp_files_deleted']
        )
        
        mb_freed = results['bytes_freed'] / (1024 * 1024)
        logger.info(f'File cleanup complete: {total_deleted} files, {mb_freed:.2f} MB freed')
        
        return {'status': 'success', **results}
        
    except Exception as e:
        logger.error(f'Error in file cleanup: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True)
def cleanup_old_audit_logs(self) -> Dict[str, Any]:
    """
    Archive and clean up old audit logs.
    Keeps detailed logs for 90 days, summary for 1 year.
    """
    logger.info('Starting cleanup of old audit logs')
    
    try:
        with httpx.Client(timeout=300.0) as client:
            # Archive logs older than 90 days
            archive_response = client.post(
                f'{API_SERVICE_URL}/internal/cleanup/audit-logs/archive',
                headers={'X-Internal-Key': get_internal_key()},
                params={'older_than_days': 90},
            )
            
            archived = 0
            if archive_response.status_code == 200:
                archived = archive_response.json().get('archived', 0)
            
            # Delete archived logs older than 1 year
            delete_response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/audit-logs/archived',
                headers={'X-Internal-Key': get_internal_key()},
                params={'older_than_days': 365},
            )
            
            deleted = 0
            if delete_response.status_code == 200:
                deleted = delete_response.json().get('deleted', 0)
            
            logger.info(f'Audit log cleanup: {archived} archived, {deleted} deleted')
            
            return {
                'status': 'success',
                'archived': archived,
                'deleted': deleted,
            }
            
    except Exception as e:
        logger.error(f'Error in audit log cleanup: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True)
def cleanup_stale_jobs(self) -> Dict[str, Any]:
    """
    Clean up stale background jobs that may have failed without proper cleanup.
    """
    logger.info('Starting cleanup of stale jobs')
    
    try:
        with httpx.Client(timeout=120.0) as client:
            # Find jobs stuck in 'processing' for > 1 hour
            response = client.post(
                f'{API_SERVICE_URL}/internal/cleanup/stale-jobs',
                headers={'X-Internal-Key': get_internal_key()},
                json={
                    'max_age_minutes': 60,
                    'statuses': ['processing', 'pending'],
                },
            )
            
            if response.status_code != 200:
                raise Exception('Failed to cleanup stale jobs')
            
            result = response.json()
            
            logger.info(f'Stale job cleanup: {result.get("cleaned", 0)} jobs reset')
            
            return {
                'status': 'success',
                'jobs_reset': result.get('cleaned', 0),
                'jobs_failed': result.get('failed', 0),
            }
            
    except Exception as e:
        logger.error(f'Error in stale job cleanup: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True)
def cleanup_old_notifications(self) -> Dict[str, Any]:
    """
    Clean up old read notifications.
    Keeps unread indefinitely, read notifications for 30 days.
    """
    logger.info('Starting cleanup of old notifications')
    
    try:
        with httpx.Client(timeout=120.0) as client:
            response = client.delete(
                f'{API_SERVICE_URL}/internal/cleanup/notifications',
                headers={'X-Internal-Key': get_internal_key()},
                params={
                    'read_older_than_days': 30,
                    'unread_older_than_days': 90,
                },
            )
            
            if response.status_code != 200:
                raise Exception('Failed to cleanup notifications')
            
            result = response.json()
            
            logger.info(f'Notification cleanup: {result.get("deleted", 0)} notifications deleted')
            
            return {
                'status': 'success',
                'deleted': result.get('deleted', 0),
            }
            
    except Exception as e:
        logger.error(f'Error in notification cleanup: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True)
def vacuum_database(self) -> Dict[str, Any]:
    """
    Trigger database maintenance operations.
    Runs weekly to optimize query performance.
    """
    logger.info('Starting database vacuum')
    
    try:
        with httpx.Client(timeout=600.0) as client:
            response = client.post(
                f'{API_SERVICE_URL}/internal/maintenance/vacuum',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if response.status_code != 200:
                raise Exception('Failed to vacuum database')
            
            result = response.json()
            
            logger.info(f'Database vacuum complete: {result}')
            
            return {
                'status': 'success',
                'tables_vacuumed': result.get('tables', []),
            }
            
    except Exception as e:
        logger.error(f'Error in database vacuum: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True)
def refresh_materialized_views(self) -> Dict[str, Any]:
    """
    Refresh materialized views for analytics.
    Runs daily to keep aggregate data current.
    """
    logger.info('Starting materialized view refresh')
    
    try:
        with httpx.Client(timeout=300.0) as client:
            response = client.post(
                f'{API_SERVICE_URL}/internal/maintenance/refresh-views',
                headers={'X-Internal-Key': get_internal_key()},
            )
            
            if response.status_code != 200:
                raise Exception('Failed to refresh materialized views')
            
            result = response.json()
            
            logger.info(f'Materialized views refreshed: {result.get("views", [])}')
            
            return {
                'status': 'success',
                'views_refreshed': result.get('views', []),
            }
            
    except Exception as e:
        logger.error(f'Error refreshing materialized views: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True)
def purge_deleted_tenants(self) -> Dict[str, Any]:
    """
    Permanently delete data for tenants marked for deletion.
    Runs monthly, deletes tenants marked > 30 days ago.
    """
    logger.info('Starting purge of deleted tenants')
    
    try:
        with httpx.Client(timeout=600.0) as client:
            # Get tenants marked for deletion > 30 days ago
            response = client.get(
                f'{API_SERVICE_URL}/internal/tenants/pending-purge',
                headers={'X-Internal-Key': get_internal_key()},
                params={'marked_before_days': 30},
            )
            
            if response.status_code != 200:
                raise Exception('Failed to get tenants pending purge')
            
            tenants = response.json()
            
            purged = 0
            for tenant in tenants:
                # Purge each tenant
                purge_response = client.delete(
                    f'{API_SERVICE_URL}/internal/tenants/{tenant["id"]}/purge',
                    headers={'X-Internal-Key': get_internal_key()},
                )
                
                if purge_response.status_code == 200:
                    purged += 1
                    logger.info(f'Purged tenant {tenant["id"]}')
                else:
                    logger.error(f'Failed to purge tenant {tenant["id"]}')
            
            logger.info(f'Tenant purge complete: {purged}/{len(tenants)} tenants purged')
            
            return {
                'status': 'success',
                'tenants_purged': purged,
                'tenants_pending': len(tenants) - purged,
            }
            
    except Exception as e:
        logger.error(f'Error purging deleted tenants: {e}')
        return {'status': 'error', 'error': str(e)}


def get_internal_key() -> str:
    """Get internal service communication key."""
    import os
    return os.getenv('INTERNAL_SERVICE_KEY', 'internal-key-for-dev')
