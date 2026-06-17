/** Converte assinaturas claras em fundo escuro para traço escuro em fundo branco (ticket/impressão). */
export function normalizeSignatureImageSrc(src: string): Promise<string> {
  return new Promise((resolve) => {
    if (!src?.trim()) {
      resolve(src);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const w = Math.max(1, img.naturalWidth || img.width);
      const h = Math.max(1, img.naturalHeight || img.height);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(src);
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      let lumSum = 0;
      let lumCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 16) continue;
        lumSum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
        lumCount += 1;
      }
      const avgLum = lumCount > 0 ? lumSum / lumCount : 255;
      const needsInvert = avgLum < 140;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      if (needsInvert) ctx.filter = "invert(1)";
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = "none";

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => resolve(src);
    img.src = src;
  });
}
