/**
 * Recadrage carré "simple" côté client :
 * - prend le plus grand carré centré de l'image source ;
 * - le redimensionne à `size`×`size` ;
 * - renvoie un Blob (WebP par défaut) prêt à uploader.
 *
 * Aucune dépendance externe — utilise <canvas>.
 */
export async function cropImageToSquare(
  file: File,
  size = 256,
  type: "image/webp" | "image/jpeg" | "image/png" = "image/webp",
  quality = 0.9,
): Promise<Blob> {
  const bitmap = await loadImage(file);

  const minSide = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - minSide) / 2;
  const sy = (bitmap.height - minSide) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non disponible");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, minSide, minSide, 0, 0, size, size);

  if ("close" in bitmap && typeof bitmap.close === "function") {
    bitmap.close();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Échec de la conversion de l'image"));
      },
      type,
      quality,
    );
  });
}

async function loadImage(
  file: File,
): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap gère l'orientation EXIF et est plus rapide.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
    } catch {
      // fallback ci-dessous
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = URL.createObjectURL(file);
  });
}
