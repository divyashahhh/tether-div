/** Downscale a photo in the browser (also converts HEIC on iOS) before uploading. */
export async function compressImage(file, maxSize = 1280, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't read that image"));
      img.src = url;
    });

    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Couldn't process that image");
    return new File([blob], "moment.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
