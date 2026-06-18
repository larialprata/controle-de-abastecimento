/** Prepara assinaturas para o ticket: fundo branco + traço escuro visível na impressão. */
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

      const drawOnWhite = (invert: boolean) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.filter = invert ? "invert(1)" : "none";
        ctx.drawImage(img, 0, 0, w, h);
        ctx.filter = "none";
      };

      // PNG do app usa fundo transparente + traço preto — compõe sobre branco antes de medir.
      drawOnWhite(false);

      const { data } = ctx.getImageData(0, 0, w, h);
      let darkCount = 0;
      let sampleCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 48) continue;
        sampleCount += 1;
        const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
        if (lum < 170) darkCount += 1;
      }

      const darkRatio = sampleCount > 0 ? darkCount / sampleCount : 0;
      if (darkRatio < 0.004) {
        // Traço claro em fundo escuro (legado): inverte para preto em branco.
        drawOnWhite(true);
      }

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => resolve(src);
    img.src = src;
  });
}
