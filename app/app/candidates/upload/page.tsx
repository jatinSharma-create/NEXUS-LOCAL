'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/candidates/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      router.push(`/candidates/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setLoading(false);
    }
  };

  return (
    <AppShell title="Upload resume">
      <div className="max-w-lg">
        <div className="mb-4">
          <Link href="/candidates" className="nexus-link text-sm">
            ← Candidates
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="nexus-panel p-6 space-y-5">
          <div className="border border-dashed border-border rounded p-10 text-center">
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer nexus-link font-medium">
              Choose a file
            </label>
            <p className="mt-1 text-sm text-muted">PDF or DOCX, up to 10MB</p>
            {file && <p className="mt-3 text-sm text-foreground">{file.name}</p>}
          </div>

          {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}

          <button
            type="submit"
            disabled={!file || loading}
            className="nexus-btn-primary w-full"
          >
            {loading ? 'Parsing…' : 'Upload & parse'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
