// CR-020: the images of a message of the person stay in sight after it is sent, as small previews kept with the
// chat (a JPEG of at most PREVIEW_MAX px a side): the file itself is never kept.

/** The longest side of a preview, in px. */
export const PREVIEW_MAX = 480;
/** The previews of one message at most: the chat stays small. */
export const PREVIEW_LIMIT = 4;

/** A preview of an image attached to a message: its name and a data URL. */
export interface AttachmentPreview {
    name: string;
    src: string;
}

async function previewOf(file: File, max: number): Promise<string | undefined> {
    if (!file.type.startsWith('image/') || typeof document === 'undefined' || typeof createImageBitmap !== 'function') return undefined;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        // A white ground: a transparent PNG keeps its look as a JPEG.
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        return canvas.toDataURL('image/jpeg', 0.8);
    } catch {
        return undefined;
    }
}

/** The previews of the images among `files` (the first PREVIEW_LIMIT), none where the browser cannot draw one. */
export async function imagePreviews(files: readonly File[], max = PREVIEW_MAX, limit = PREVIEW_LIMIT): Promise<AttachmentPreview[]> {
    const images = files.filter((file) => file.type.startsWith('image/')).slice(0, limit);
    const previews = await Promise.all(images.map(async (file) => ({ name: file.name, src: await previewOf(file, max) })));
    return previews.filter((preview): preview is AttachmentPreview => Boolean(preview.src));
}
