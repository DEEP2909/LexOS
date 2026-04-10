# EvidentIS AI Worker - Celery Application
# Handles async batch processing, report generation, and scheduled tasks

import os
from celery import Celery
from celery.schedules import crontab
from kombu import Queue, Exchange

# Redis broker configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/1')

# Create Celery app
app = Celery(
    'evidentis_worker',
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        'tasks.batch_embed',
        'tasks.report_gen',
        'tasks.obligation_remind',
        'tasks.cleanup',
        'tasks.analytics',
    ]
)

# Celery configuration
app.conf.update(
    # Task settings
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
    # Task execution settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3300,  # 55 min soft limit
    
    # Worker settings
    worker_prefetch_multiplier=1,
    worker_concurrency=4,
    worker_max_tasks_per_child=100,
    
    # Result backend settings
    result_expires=86400,  # 24 hours
    result_extended=True,
    
    # Task routing
    task_queues=(
        Queue('default', Exchange('default'), routing_key='default'),
        Queue('embeddings', Exchange('embeddings'), routing_key='embed.#'),
        Queue('reports', Exchange('reports'), routing_key='report.#'),
        Queue('notifications', Exchange('notifications'), routing_key='notify.#'),
        Queue('analytics', Exchange('analytics'), routing_key='analytics.#'),
        Queue('cleanup', Exchange('cleanup'), routing_key='cleanup.#'),
    ),
    
    task_default_queue='default',
    task_default_exchange='default',
    task_default_routing_key='default',
    
    task_routes={
        'tasks.batch_embed.*': {'queue': 'embeddings', 'routing_key': 'embed.batch'},
        'tasks.report_gen.*': {'queue': 'reports', 'routing_key': 'report.gen'},
        'tasks.obligation_remind.*': {'queue': 'notifications', 'routing_key': 'notify.obligation'},
        'tasks.analytics.*': {'queue': 'analytics', 'routing_key': 'analytics.compute'},
        'tasks.cleanup.*': {'queue': 'cleanup', 'routing_key': 'cleanup.run'},
    },
    
    # Beat scheduler for periodic tasks
    beat_schedule={
        # Daily obligation deadline reminders at 8 AM
        'send-obligation-reminders': {
            'task': 'tasks.obligation_remind.send_daily_reminders',
            'schedule': crontab(hour=8, minute=0),
            'options': {'queue': 'notifications'},
        },
        
        # Hourly analytics aggregation
        'aggregate-hourly-analytics': {
            'task': 'tasks.analytics.aggregate_hourly',
            'schedule': crontab(minute=0),
            'options': {'queue': 'analytics'},
        },
        
        # Daily analytics rollup at midnight
        'rollup-daily-analytics': {
            'task': 'tasks.analytics.rollup_daily',
            'schedule': crontab(hour=0, minute=15),
            'options': {'queue': 'analytics'},
        },
        
        # Weekly report generation on Monday
        'generate-weekly-reports': {
            'task': 'tasks.report_gen.generate_weekly_reports',
            'schedule': crontab(day_of_week=1, hour=6, minute=0),
            'options': {'queue': 'reports'},
        },
        
        # Monthly report generation on 1st of month
        'generate-monthly-reports': {
            'task': 'tasks.report_gen.generate_monthly_reports',
            'schedule': crontab(day_of_month=1, hour=7, minute=0),
            'options': {'queue': 'reports'},
        },
        
        # Daily cleanup of expired tokens and sessions
        'cleanup-expired-sessions': {
            'task': 'tasks.cleanup.cleanup_expired_sessions',
            'schedule': crontab(hour=3, minute=0),
            'options': {'queue': 'cleanup'},
        },
        
        # Weekly cleanup of orphaned files
        'cleanup-orphaned-files': {
            'task': 'tasks.cleanup.cleanup_orphaned_files',
            'schedule': crontab(day_of_week=0, hour=4, minute=0),
            'options': {'queue': 'cleanup'},
        },
        
        # Check for overdue obligations every 4 hours
        'check-overdue-obligations': {
            'task': 'tasks.obligation_remind.check_overdue',
            'schedule': crontab(minute=0, hour='*/4'),
            'options': {'queue': 'notifications'},
        },
        
        # Re-embed documents that failed (retry mechanism)
        'retry-failed-embeddings': {
            'task': 'tasks.batch_embed.retry_failed',
            'schedule': crontab(minute=30, hour='*/2'),
            'options': {'queue': 'embeddings'},
        },
    },
    
    # Error handling
    task_annotations={
        '*': {
            'rate_limit': '100/m',
            'max_retries': 3,
            'default_retry_delay': 60,
        },
        'tasks.batch_embed.*': {
            'rate_limit': '50/m',
            'max_retries': 5,
            'default_retry_delay': 120,
        },
        'tasks.report_gen.*': {
            'rate_limit': '10/m',
            'max_retries': 2,
            'default_retry_delay': 300,
        },
    },
)


# Task state hooks for monitoring
@app.task(bind=True)
def debug_task(self):
    """Debug task for testing worker connectivity."""
    print(f'Request: {self.request!r}')
    return {'status': 'ok', 'worker': self.request.hostname}


# Error handling hooks
from celery.signals import task_failure, task_success, task_retry
import logging

logger = logging.getLogger(__name__)


@task_failure.connect
def handle_task_failure(sender=None, task_id=None, exception=None, 
                         args=None, kwargs=None, traceback=None, **kw):
    """Log task failures for monitoring."""
    logger.error(
        f'Task {sender.name}[{task_id}] failed: {exception}',
        extra={
            'task_id': task_id,
            'task_name': sender.name,
            'args': args,
            'kwargs': kwargs,
        }
    )


@task_success.connect  
def handle_task_success(sender=None, result=None, **kw):
    """Log successful task completions."""
    logger.info(
        f'Task {sender.name} completed successfully',
        extra={'task_name': sender.name, 'result': str(result)[:200]}
    )


@task_retry.connect
def handle_task_retry(sender=None, reason=None, request=None, **kw):
    """Log task retries."""
    logger.warning(
        f'Task {sender.name} retrying: {reason}',
        extra={'task_name': sender.name, 'reason': str(reason)}
    )


if __name__ == '__main__':
    app.start()
