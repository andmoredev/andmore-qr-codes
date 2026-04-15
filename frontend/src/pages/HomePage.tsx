import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
import { Upload, X, Download, Link, ImageIcon, Clock } from 'lucide-react';
import { generateQr, getHistory, HistoryItem } from '../services/api';

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadBase64Png(base64: string, filename = 'qr-code.png') {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${base64}`;
  a.download = filename;
  a.click();
}

export function HomePage() {
  const [url, setUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; qrCode: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerate = async () => {
    if (!url) return;
    setError('');
    setLoading(true);
    try {
      const imageBase64 = imageFile ? await toBase64(imageFile) : undefined;
      const res = await generateQr(url, imageBase64);
      setResult(res);
      const newItem = await getHistory();
      setHistory(newItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Generator */}
      <section className="bg-surface border border-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold text-foreground">Generate QR Code</h2>

        {/* URL input */}
        <div className="space-y-1.5">
          <label htmlFor="url" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Link className="w-3.5 h-3.5 text-text-muted" />
            Destination URL
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
          />
        </div>

        {/* Image dropzone */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ImageIcon className="w-3.5 h-3.5 text-text-muted" />
            Center Logo <span className="text-text-muted font-normal">(optional)</span>
          </label>

          {imagePreview ? (
            <div className="flex items-center gap-3 bg-muted border border-border rounded-lg px-4 py-3">
              <img src={imagePreview} alt="Preview" className="w-10 h-10 object-cover rounded-md" />
              <span className="text-sm text-foreground flex-1 truncate">{imageFile?.name}</span>
              <button onClick={clearImage} className="text-text-muted hover:text-foreground transition-colors cursor-pointer" aria-label="Remove image">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg px-4 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors duration-150 ${
                dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-muted'
              }`}
            >
              <Upload className="w-5 h-5 text-text-muted" />
              <p className="text-sm text-text-muted">
                Drop an image here or <span className="text-accent">browse</span>
              </p>
              <p className="text-xs text-text-muted">Square images work best (min 125×125px)</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={!url || loading}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-colors duration-150 cursor-pointer flex items-center justify-center gap-2"
        >
          {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {loading ? 'Generating…' : 'Generate QR Code'}
        </button>

        {result && (
          <div className="flex flex-col items-center gap-4 pt-2">
            <img
              src={`data:image/png;base64,${result.qrCode}`}
              alt="Generated QR code"
              className="w-56 h-56 rounded-lg border border-border"
            />
            <button
              onClick={() => downloadBase64Png(result.qrCode)}
              className="flex items-center gap-2 text-sm text-text-muted hover:text-foreground transition-colors duration-150 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
          </div>
        )}
      </section>

      {/* History */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <Clock className="w-4 h-4 text-text-muted" />
          Your QR Codes
        </h2>

        {historyLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4 space-y-3 animate-pulse">
                <div className="aspect-square bg-muted rounded-lg" />
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl py-16 flex flex-col items-center gap-2">
            <p className="text-text-muted text-sm">No QR codes yet — generate your first one above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map(item => (
              <div key={item.id} className="bg-surface border border-border rounded-xl p-4 space-y-3 group">
                <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
                  <img src={item.qrCodeUrl} alt={`QR code for ${item.url}`} className="w-full h-full object-contain p-2" />
                  <a
                    href={item.qrCodeUrl}
                    download={`qr-${item.id}.png`}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    aria-label="Download QR code"
                  >
                    <Download className="w-5 h-5 text-white" />
                  </a>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-foreground truncate" title={item.url}>{item.url}</p>
                  <p className="text-xs text-text-muted">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
