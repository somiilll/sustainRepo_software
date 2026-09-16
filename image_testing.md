# Image Integration Testing Playbook

- Use base64-encoded JPEG, PNG, or WEBP images for image-integration tests.
- Do not use blank or uniform images; inputs must contain real visual features.
- Transcode unsupported image formats before testing and verify MIME type after conversion.
- For animated formats, use the first frame only.
- Resize oversized images to reasonable bounds.

Testing remains intentionally deferred for the current OCR change per the user’s standing instruction.
