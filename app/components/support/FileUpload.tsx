'use client';

import { useState, useRef } from 'react';
import { Upload, X, File, FileText, Image as ImageIcon, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  ticketId?: string;
  messageId?: string;
  onUploadComplete?: (attachment: any) => void;
  onUploadError?: (error: string) => void;
  maxFiles?: number;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export function FileUpload({
  ticketId,
  messageId,
  onUploadComplete,
  onUploadError,
  maxFiles = 5,
  disabled = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon;
    if (type === 'application/pdf') return FileText;
    return File;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Validate files
    const validFiles: File[] = [];
    let error = '';

    for (const file of files) {
      if (selectedFiles.length + uploadedFiles.length + validFiles.length >= maxFiles) {
        error = `Maximum ${maxFiles} files allowed`;
        break;
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        error = `${file.name}: File type not allowed`;
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        error = `${file.name}: File too large (max 10MB)`;
        continue;
      }

      validFiles.push(file);
    }

    if (error && onUploadError) {
      onUploadError(error);
    }

    setSelectedFiles([...selectedFiles, ...validFiles]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleRemoveUploaded = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!ticketId || selectedFiles.length === 0) return;

    setUploading(true);

    try {
      const uploaded: any[] = [];

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('ticketId', ticketId);
        if (messageId) formData.append('messageId', messageId);

        const response = await fetch('/api/support/attachments/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }

        const attachment = await response.json();
        uploaded.push(attachment);

        if (onUploadComplete) {
          onUploadComplete(attachment);
        }
      }

      setUploadedFiles([...uploadedFiles, ...uploaded]);
      setSelectedFiles([]);
    } catch (error) {
      if (onUploadError) {
        onUploadError(error instanceof Error ? error.message : 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* File Input */}
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileSelect}
          disabled={disabled || uploading || selectedFiles.length + uploadedFiles.length >= maxFiles}
          className="hidden"
        />
        
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading || selectedFiles.length + uploadedFiles.length >= maxFiles}
          className="w-full p-4 rounded-xl border-2 border-dashed border-white/20 hover:border-emerald-500/40 bg-white/5 hover:bg-emerald-500/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-6 h-6 text-white/40 group-hover:text-emerald-400 transition-colors" />
            <div className="text-sm text-white/60">
              <span className="text-emerald-400 font-medium">Click to upload</span> or drag and drop
            </div>
            <div className="text-xs text-white/40">
              Images, PDF, Word docs (max 10MB each, {maxFiles} files max)
            </div>
          </div>
        </button>
      </div>

      {/* Selected Files (Not Yet Uploaded) */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/60">Selected Files ({selectedFiles.length})</p>
            <button
              onClick={handleUpload}
              disabled={uploading || !ticketId}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          
          {selectedFiles.map((file, index) => {
            const Icon = getFileIcon(file.type);
            return (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10"
              >
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{file.name}</p>
                  <p className="text-xs text-white/40">{formatFileSize(file.size)}</p>
                </div>
                <button
                  onClick={() => handleRemoveFile(index)}
                  disabled={uploading}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-white/60">Uploaded ({uploadedFiles.length})</p>
          {uploadedFiles.map((file, index) => {
            const Icon = getFileIcon(file.mimeType);
            return (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
              >
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <Icon className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{file.fileName}</p>
                  <p className="text-xs text-emerald-400">{formatFileSize(file.fileSize)}</p>
                </div>
                <button
                  onClick={() => handleRemoveUploaded(index)}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
