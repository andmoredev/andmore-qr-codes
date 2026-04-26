import { useRef, useState, ChangeEvent, DragEvent } from 'react';
import { ImageIcon, Upload, X } from 'lucide-react';

interface Props {
  /** Current preview src (data URL or remote URL). */
  previewSrc: string | null;
  /** Called with the selected file read as raw base64 (no data URL prefix). */
  onChange: (base64: string | null) => void;
  /** Called when the user clicks "Remove" — signals "clear on save". */
  onRemove: () => void;
}

const MAX_SIZE_BYTES = 4 * 1024 * 1024;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function BannerUploader({ previewSrc, onChange, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Image must be smaller than 4MB.');
      return;
    }
    try {
      const base64 = await toBase64(file);
      onChange(base64);
    } catch {
      setError('Could not read the file.');
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-2">
      {previewSrc ? (
        <div className="space-y-2">
          <div
            className="w-full h-28 sm:h-32 rounded-lg border border-border bg-cover bg-center"
            style={{ backgroundImage: `url(${previewSrc})` }}
            role="img"
            aria-label="Banner preview"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                onRemove();
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="flex items-center gap-1.5 text-sm text-destructive hover:text-red-400 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg px-4 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors duration-150 ${
            dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-muted'
          }`}
        >
          <div className="w-10 h-10 rounded-md bg-muted border border-border flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">
            Drop a banner image or <span className="text-accent">browse</span>
          </p>
          <p className="text-xs text-text-muted">Wide images (e.g. 1600×500) work best, under 4MB</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInput}
        className="hidden"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
