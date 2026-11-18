export const CLOUDINARY_CLOUD_NAME =
  import.meta.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() ||
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim() ||
  'ej48nbbk';

export const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim() ||
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim() ||
  'era_unsigned';

const CLOUD_NAME_STORAGE_KEY = 'era_cloudinary_cloud_name';

export function getSavedCloudinaryCloudName(): string {
  if (CLOUDINARY_CLOUD_NAME) return CLOUDINARY_CLOUD_NAME;
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem(CLOUD_NAME_STORAGE_KEY)?.trim() || '';
  }
  return '';
}

export function saveCloudinaryCloudName(cloudName: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CLOUD_NAME_STORAGE_KEY, cloudName.trim());
  }
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  resourceType: 'image' | 'video';
}

export async function uploadToCloudinary(
  file: File,
  cloudName: string = getSavedCloudinaryCloudName()
): Promise<CloudinaryUploadResult> {
  const cleanCloud = cloudName.trim() || CLOUDINARY_CLOUD_NAME;
  if (!cleanCloud) {
    throw new Error('CLOUDINARY_CLOUD_MISSING');
  }

  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');
  if (!isVideo && !isImage) {
    throw new Error('Only photo and video files are supported.');
  }

  const maxSizeMb = isVideo ? 50 : 15;
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`File exceeds ${maxSizeMb} MB limit.`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const resourceSegment = isVideo ? 'video' : 'image';
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cleanCloud)}/${resourceSegment}/upload`;

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let reason = `Upload failed. Verify Cloudinary cloud "${cleanCloud}" and unsigned preset "${CLOUDINARY_UPLOAD_PRESET}".`;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) {
        reason = errBody.error.message;
      }
    } catch {
      // ignore JSON parse error
    }
    throw new Error(reason);
  }

  const data = await response.json();
  if (!data?.secure_url) {
    throw new Error('Cloudinary did not return a media URL.');
  }

  return {
    secureUrl: String(data.secure_url),
    resourceType: isVideo ? 'video' : 'image',
  };
}
