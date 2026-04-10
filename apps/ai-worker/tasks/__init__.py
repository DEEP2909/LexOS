# EvidentIS AI Worker Tasks - Package Init
from .batch_embed import batch_embed_documents, embed_new_document, retry_failed, reindex_matter_documents
from .report_gen import generate_matter_report, generate_weekly_reports, generate_monthly_reports
from .obligation_remind import send_daily_reminders, check_overdue, send_obligation_reminder
from .cleanup import cleanup_expired_sessions, cleanup_orphaned_files, cleanup_old_audit_logs
from .analytics import aggregate_hourly, rollup_daily, compute_health_scores, compute_firm_analytics

__all__ = [
    # Batch embedding
    'batch_embed_documents',
    'embed_new_document',
    'retry_failed',
    'reindex_matter_documents',
    
    # Report generation
    'generate_matter_report',
    'generate_weekly_reports',
    'generate_monthly_reports',
    
    # Obligation reminders
    'send_daily_reminders',
    'check_overdue',
    'send_obligation_reminder',
    
    # Cleanup
    'cleanup_expired_sessions',
    'cleanup_orphaned_files',
    'cleanup_old_audit_logs',
    
    # Analytics
    'aggregate_hourly',
    'rollup_daily',
    'compute_health_scores',
    'compute_firm_analytics',
]
