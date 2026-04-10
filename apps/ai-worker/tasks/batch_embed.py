# EvidentIS AI Worker - Batch Embedding Tasks
# Handles bulk document embedding and re-embedding operations

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import httpx
from celery import shared_task
from celery.exceptions import MaxRetriesExceededError

logger = logging.getLogger(__name__)

# AI Service URL
AI_SERVICE_URL = 'http://ai-service:8000'
API_SERVICE_URL = 'http://api:3000'


@shared_task(bind=True, max_retries=5, default_retry_delay=120)
def batch_embed_documents(
    self,
    tenant_id: str,
    document_ids: List[str],
    force_reembed: bool = False
) -> Dict[str, Any]:
    """
    Batch embed multiple documents.
    
    Args:
        tenant_id: Tenant ID for the documents
        document_ids: List of document IDs to embed
        force_reembed: If True, re-embed even if embeddings exist
        
    Returns:
        Summary of embedding results
    """
    logger.info(f'Starting batch embedding for {len(document_ids)} documents')
    
    results = {
        'total': len(document_ids),
        'succeeded': 0,
        'failed': 0,
        'skipped': 0,
        'errors': [],
    }
    
    try:
        for doc_id in document_ids:
            try:
                result = embed_single_document(tenant_id, doc_id, force_reembed)
                
                if result['status'] == 'success':
                    results['succeeded'] += 1
                elif result['status'] == 'skipped':
                    results['skipped'] += 1
                else:
                    results['failed'] += 1
                    results['errors'].append({
                        'document_id': doc_id,
                        'error': result.get('error', 'Unknown error'),
                    })
                    
            except Exception as e:
                logger.error(f'Error embedding document {doc_id}: {e}')
                results['failed'] += 1
                results['errors'].append({
                    'document_id': doc_id,
                    'error': str(e),
                })
                
        logger.info(
            f'Batch embedding complete: {results["succeeded"]} succeeded, '
            f'{results["failed"]} failed, {results["skipped"]} skipped'
        )
        
        return results
        
    except Exception as e:
        logger.error(f'Batch embedding failed: {e}')
        raise self.retry(exc=e)


def embed_single_document(
    tenant_id: str,
    document_id: str,
    force_reembed: bool = False
) -> Dict[str, str]:
    """Embed a single document synchronously."""
    with httpx.Client(timeout=300.0) as client:
        # Check if document needs embedding
        if not force_reembed:
            check_response = client.get(
                f'{API_SERVICE_URL}/internal/documents/{document_id}/embedding-status',
                headers={'X-Tenant-ID': tenant_id, 'X-Internal-Key': get_internal_key()},
            )
            if check_response.status_code == 200:
                status = check_response.json()
                if status.get('has_embeddings'):
                    return {'status': 'skipped', 'reason': 'Already embedded'}
        
        # Get document content
        doc_response = client.get(
            f'{API_SERVICE_URL}/internal/documents/{document_id}/content',
            headers={'X-Tenant-ID': tenant_id, 'X-Internal-Key': get_internal_key()},
        )
        
        if doc_response.status_code != 200:
            return {'status': 'error', 'error': 'Failed to fetch document content'}
        
        content = doc_response.json()
        
        # Generate embeddings via AI service
        embed_response = client.post(
            f'{AI_SERVICE_URL}/embed/batch',
            json={
                'texts': content.get('chunks', [content.get('text', '')]),
                'document_id': document_id,
            },
        )
        
        if embed_response.status_code != 200:
            return {'status': 'error', 'error': 'Embedding generation failed'}
        
        embeddings = embed_response.json()
        
        # Store embeddings
        store_response = client.post(
            f'{API_SERVICE_URL}/internal/documents/{document_id}/embeddings',
            headers={'X-Tenant-ID': tenant_id, 'X-Internal-Key': get_internal_key()},
            json={'embeddings': embeddings['embeddings']},
        )
        
        if store_response.status_code != 200:
            return {'status': 'error', 'error': 'Failed to store embeddings'}
        
        return {'status': 'success'}


@shared_task(bind=True, max_retries=3)
def embed_new_document(
    self,
    tenant_id: str,
    document_id: str,
    content: str,
    chunks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Embed a newly uploaded document.
    Called after OCR/text extraction completes.
    """
    logger.info(f'Embedding new document {document_id}')
    
    try:
        texts_to_embed = chunks if chunks else [content]
        
        with httpx.Client(timeout=300.0) as client:
            # Generate embeddings
            response = client.post(
                f'{AI_SERVICE_URL}/embed/batch',
                json={
                    'texts': texts_to_embed,
                    'document_id': document_id,
                },
            )
            
            if response.status_code != 200:
                raise Exception(f'Embedding failed: {response.text}')
            
            embeddings_data = response.json()
            
            # Store in database via API
            store_response = client.post(
                f'{API_SERVICE_URL}/internal/documents/{document_id}/embeddings',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
                json={
                    'embeddings': embeddings_data['embeddings'],
                    'chunk_count': len(texts_to_embed),
                },
            )
            
            if store_response.status_code != 200:
                raise Exception(f'Failed to store embeddings: {store_response.text}')
            
            # Update document status
            client.patch(
                f'{API_SERVICE_URL}/internal/documents/{document_id}/status',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
                json={'status': 'embedded', 'embedding_count': len(embeddings_data['embeddings'])},
            )
            
            logger.info(f'Document {document_id} embedded successfully with {len(embeddings_data["embeddings"])} vectors')
            
            return {
                'status': 'success',
                'document_id': document_id,
                'embedding_count': len(embeddings_data['embeddings']),
            }
            
    except Exception as e:
        logger.error(f'Error embedding document {document_id}: {e}')
        try:
            raise self.retry(exc=e)
        except MaxRetriesExceededError:
            # Mark document as failed
            with httpx.Client() as client:
                client.patch(
                    f'{API_SERVICE_URL}/internal/documents/{document_id}/status',
                    headers={
                        'X-Tenant-ID': tenant_id,
                        'X-Internal-Key': get_internal_key(),
                    },
                    json={'status': 'embedding_failed', 'error': str(e)},
                )
            raise


@shared_task(bind=True)
def retry_failed(self) -> Dict[str, Any]:
    """
    Retry embedding for documents that previously failed.
    Runs on schedule to catch transient failures.
    """
    logger.info('Starting retry of failed embeddings')
    
    try:
        with httpx.Client(timeout=60.0) as client:
            # Get documents with failed embeddings
            response = client.get(
                f'{API_SERVICE_URL}/internal/documents/embedding-failed',
                headers={'X-Internal-Key': get_internal_key()},
                params={'limit': 100},
            )
            
            if response.status_code != 200:
                logger.error('Failed to fetch documents with failed embeddings')
                return {'status': 'error', 'error': 'Failed to fetch failed documents'}
            
            failed_docs = response.json()
            
            if not failed_docs:
                logger.info('No failed embeddings to retry')
                return {'status': 'success', 'retried': 0}
            
            # Group by tenant
            by_tenant: Dict[str, List[str]] = {}
            for doc in failed_docs:
                tenant_id = doc['tenant_id']
                if tenant_id not in by_tenant:
                    by_tenant[tenant_id] = []
                by_tenant[tenant_id].append(doc['id'])
            
            # Queue batch embedding tasks
            total_retried = 0
            for tenant_id, doc_ids in by_tenant.items():
                batch_embed_documents.delay(tenant_id, doc_ids, force_reembed=True)
                total_retried += len(doc_ids)
            
            logger.info(f'Queued {total_retried} documents for re-embedding')
            
            return {'status': 'success', 'retried': total_retried}
            
    except Exception as e:
        logger.error(f'Error in retry_failed: {e}')
        return {'status': 'error', 'error': str(e)}


@shared_task(bind=True, max_retries=3)
def reindex_matter_documents(
    self,
    tenant_id: str,
    matter_id: str
) -> Dict[str, Any]:
    """
    Re-embed all documents in a matter.
    Useful when embedding model changes or for rebuilding search index.
    """
    logger.info(f'Re-indexing documents for matter {matter_id}')
    
    try:
        with httpx.Client(timeout=60.0) as client:
            # Get all document IDs for matter
            response = client.get(
                f'{API_SERVICE_URL}/internal/matters/{matter_id}/documents',
                headers={
                    'X-Tenant-ID': tenant_id,
                    'X-Internal-Key': get_internal_key(),
                },
            )
            
            if response.status_code != 200:
                raise Exception('Failed to fetch matter documents')
            
            documents = response.json()
            document_ids = [doc['id'] for doc in documents]
            
            if not document_ids:
                return {'status': 'success', 'message': 'No documents to reindex'}
            
            # Queue batch embedding
            batch_embed_documents.delay(tenant_id, document_ids, force_reembed=True)
            
            return {
                'status': 'queued',
                'matter_id': matter_id,
                'document_count': len(document_ids),
            }
            
    except Exception as e:
        logger.error(f'Error reindexing matter {matter_id}: {e}')
        raise self.retry(exc=e)


def get_internal_key() -> str:
    """Get internal service communication key."""
    import os
    return os.getenv('INTERNAL_SERVICE_KEY', 'internal-key-for-dev')
