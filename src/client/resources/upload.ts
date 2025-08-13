import Jimp from 'jimp';

// getPresignedUploadUrl
export async function getPresignedUploadUrl(
  http: { get: <T>(endpoint: string, params?: Record<string, any>) => Promise<T> },
  args: { agentId: string; stepId?: string; sessionId?: string; eventId?: string; nthScreenshot?: number },
): Promise<{ presigned_url: string; bucket_name: string; object_key: string }> {
  const params: any = { agent_id: args.agentId };
  if (args.stepId) params.step_id = args.stepId;
  if (args.sessionId) params.session_id = args.sessionId;
  if (args.eventId) {
    params.event_id = args.eventId;
    if (args.nthScreenshot == null) throw new Error('nth_screenshot is required when event_id is provided');
    params.nth_screenshot = args.nthScreenshot;
  }
  return http.get('getpresigneduploadurl', params);
}

// Upload JPEG/GIF to presigned URL (Node fetch)
export async function uploadImageToS3(url: string, buffer: Buffer, contentType: 'image/jpeg'|'image/gif'): Promise<void> {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: buffer });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

// Convert base64 data URL to JPEG buffer, flatten alpha
export async function dataUrlToJpegBuffer(dataUrl: string): Promise<Buffer> {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const img = await Jimp.read(Buffer.from(base64, 'base64'));
  if (img.hasAlpha()) img.background(0xffffffff);
  return img.getBufferAsync(Jimp.MIME_JPEG);
}

// Convert file path (any format) to JPEG base64
export async function pathToJpegBase64(path: string): Promise<string> {
  const img = await Jimp.read(path);
  if (img.hasAlpha()) img.background(0xffffffff);
  const buf = await img.getBufferAsync(Jimp.MIME_JPEG);
  return Buffer.from(buf).toString('base64');
}

