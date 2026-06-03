"""
Cloudflare R2 Storage Utility
S3-compatible object storage for file uploads
"""

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import os
import uuid
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class R2Storage:
    """
    Cloudflare R2 Storage client for managing file uploads across different buckets.
    
    Bucket Types:
    - emission_evidence: For emission record evidence files
    - sinks_evidence: For carbon sinks evidence files
    - org_facility: For organization/facility attachments (including logos)
    - superadmin: For superadmin uploads (invoice history, etc.)
    """
    
    def __init__(self):
        self.account_id = os.environ.get('R2_ACCOUNT_ID')
        self.endpoint_url = os.environ.get('R2_ENDPOINT_URL')
        
        # Initialize S3 client for R2
        self.client = boto3.client(
            's3',
            endpoint_url=self.endpoint_url,
            aws_access_key_id=os.environ.get('R2_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('R2_SECRET_ACCESS_KEY'),
            config=Config(
                signature_version='s3v4',
                s3={'addressing_style': 'path'}
            ),
            region_name='auto'  # R2 uses 'auto' for region
        )
        
        # Bucket mappings
        self.buckets = {
            'emission_evidence': os.environ.get('R2_BUCKET_EMISSION_EVIDENCE', 'ghg-emissions-evidence'),
            'sinks_evidence': os.environ.get('R2_BUCKET_SINKS_EVIDENCE', 'sinks-evidence'),
            'org_facility': os.environ.get('R2_BUCKET_ORG_FACILITY', 'organization-facility-data'),
            'superadmin': os.environ.get('R2_BUCKET_SUPERADMIN', 'superadmin-data')
        }
    
    def _get_bucket(self, bucket_type: str) -> str:
        """Get bucket name from bucket type"""
        bucket = self.buckets.get(bucket_type)
        if not bucket:
            raise ValueError(f"Invalid bucket type: {bucket_type}. Valid types: {list(self.buckets.keys())}")
        return bucket
    
    def _generate_unique_key(self, filename: str, folder: str = None, org_name: str = None) -> str:
        """Generate a unique key for the file"""
        file_ext = filename.split('.')[-1] if '.' in filename else ''
        unique_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime('%Y%m%d')
        
        # Build path: org_name/timestamp/file or folder/org_name/timestamp/file
        base_name = f"{unique_id}.{file_ext}" if file_ext else unique_id
        
        if org_name:
            # Sanitize org_name for use in path
            safe_org = ''.join(c if c.isalnum() or c in '-_' else '_' for c in org_name)
            if folder:
                return f"{folder}/{safe_org}/{timestamp}/{base_name}"
            return f"{safe_org}/{timestamp}/{base_name}"
        
        if folder:
            return f"{folder}/{timestamp}/{base_name}"
        return f"{timestamp}/{base_name}"
    
    async def upload_file(
        self, 
        file_content: bytes, 
        filename: str, 
        bucket_type: str, 
        content_type: str,
        folder: str = None,
        metadata: dict = None,
        org_name: str = None
    ) -> dict:
        """
        Upload file to appropriate R2 bucket
        
        Args:
            file_content: File bytes
            filename: Original filename
            bucket_type: One of 'emission_evidence', 'sinks_evidence', 'org_facility', 'superadmin'
            content_type: MIME type of the file
            folder: Optional folder/prefix for organizing files
            metadata: Optional metadata to store with the file
            org_name: Optional organization name for path prefix
        
        Returns:
            dict with bucket, key, and file info
        """
        try:
            bucket = self._get_bucket(bucket_type)
            key = self._generate_unique_key(filename, folder, org_name)
            
            # Prepare upload parameters
            upload_params = {
                'Bucket': bucket,
                'Key': key,
                'Body': file_content,
                'ContentType': content_type
            }
            
            # Add metadata if provided - sanitize to ASCII only for S3 compatibility
            if metadata:
                sanitized_metadata = {}
                for k, v in metadata.items():
                    # Convert to string and replace non-ASCII chars with underscore
                    sanitized_value = ''.join(c if ord(c) < 128 else '_' for c in str(v))
                    sanitized_metadata[k] = sanitized_value
                upload_params['Metadata'] = sanitized_metadata
            
            # Upload to R2
            self.client.put_object(**upload_params)
            
            logger.info(f"File uploaded successfully: {bucket}/{key}")
            
            return {
                'success': True,
                'bucket': bucket,
                'bucket_type': bucket_type,
                'key': key,
                'original_filename': filename,
                'content_type': content_type,
                'file_size': len(file_content),
                'uploaded_at': datetime.now().isoformat()
            }
            
        except ClientError as e:
            logger.error(f"R2 upload error: {e}")
            raise Exception(f"Failed to upload file to R2: {str(e)}")
        except Exception as e:
            logger.error(f"Upload error: {e}")
            raise
    
    async def get_file(self, bucket_type: str, key: str) -> tuple:
        """
        Get file from R2 bucket
        
        Args:
            bucket_type: Bucket type identifier
            key: File key in the bucket
        
        Returns:
            Tuple of (file_content, content_type)
        """
        try:
            bucket = self._get_bucket(bucket_type)
            response = self.client.get_object(Bucket=bucket, Key=key)
            content = response['Body'].read()
            content_type = response.get('ContentType', 'application/octet-stream')
            return content, content_type
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                raise FileNotFoundError(f"File not found: {key}")
            logger.error(f"R2 get error: {e}")
            raise Exception(f"Failed to get file from R2: {str(e)}")
    
    async def delete_file(self, bucket_type: str, key: str) -> bool:
        """
        Delete file from R2 bucket
        
        Args:
            bucket_type: Bucket type identifier
            key: File key in the bucket
        
        Returns:
            True if deleted successfully
        """
        try:
            bucket = self._get_bucket(bucket_type)
            self.client.delete_object(Bucket=bucket, Key=key)
            logger.info(f"File deleted: {bucket}/{key}")
            return True
            
        except ClientError as e:
            logger.error(f"R2 delete error: {e}")
            raise Exception(f"Failed to delete file from R2: {str(e)}")
    
    def generate_presigned_url(
        self, 
        bucket_type: str, 
        key: str, 
        expiration: int = 3600,
        response_content_disposition: str = None
    ) -> str:
        """
        Generate presigned URL for private file access
        
        Args:
            bucket_type: Bucket type identifier
            key: File key in the bucket
            expiration: URL expiration time in seconds (default 1 hour)
            response_content_disposition: Optional content disposition header
        
        Returns:
            Presigned URL string
        """
        try:
            bucket = self._get_bucket(bucket_type)
            
            params = {
                'Bucket': bucket,
                'Key': key
            }
            
            if response_content_disposition:
                params['ResponseContentDisposition'] = response_content_disposition
            
            url = self.client.generate_presigned_url(
                'get_object',
                Params=params,
                ExpiresIn=expiration
            )
            
            return url
            
        except ClientError as e:
            logger.error(f"R2 presigned URL error: {e}")
            raise Exception(f"Failed to generate presigned URL: {str(e)}")
    
    async def file_exists(self, bucket_type: str, key: str) -> bool:
        """
        Check if file exists in R2 bucket
        
        Args:
            bucket_type: Bucket type identifier
            key: File key in the bucket
        
        Returns:
            True if file exists
        """
        try:
            bucket = self._get_bucket(bucket_type)
            self.client.head_object(Bucket=bucket, Key=key)
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            raise
    
    async def get_file_info(self, bucket_type: str, key: str) -> dict:
        """
        Get file metadata from R2
        
        Args:
            bucket_type: Bucket type identifier
            key: File key in the bucket
        
        Returns:
            Dict with file metadata
        """
        try:
            bucket = self._get_bucket(bucket_type)
            response = self.client.head_object(Bucket=bucket, Key=key)
            
            return {
                'key': key,
                'bucket': bucket,
                'content_type': response.get('ContentType'),
                'content_length': response.get('ContentLength'),
                'last_modified': response.get('LastModified').isoformat() if response.get('LastModified') else None,
                'metadata': response.get('Metadata', {})
            }
            
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                raise FileNotFoundError(f"File not found: {key}")
            raise


# Singleton instance
_r2_storage = None

def get_r2_storage() -> R2Storage:
    """Get or create R2Storage singleton instance"""
    global _r2_storage
    if _r2_storage is None:
        _r2_storage = R2Storage()
    return _r2_storage
