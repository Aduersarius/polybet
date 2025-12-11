'use client';

import { useEffect, useState } from 'react';

interface SuggestionPayload {
    title: string;
    description: string;
    category: string;
    resolutionDate: string;
    type: 'BINARY' | 'MULTIPLE';
}

export function SuggestMarket() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [form, setForm] = useState<SuggestionPayload>({
        title: '',
        description: '',
        category: '',
        resolutionDate: '',
        type: 'BINARY',
    });

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const handleFile = (nextFile: File | null) => {
        if (!nextFile) return;
        if (!nextFile.type.startsWith('image/')) {
            setError('Please attach an image file.');
            return;
        }
        if (nextFile.size > 5 * 1024 * 1024) {
            setError('Image must be under 5MB.');
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(nextFile);
        setPreviewUrl(URL.createObjectURL(nextFile));
        setError(null);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) handleFile(dropped);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (!file) {
                setError('Please attach an image.');
                setLoading(false);
                return;
            }

            const formData = new FormData();
            formData.append('title', form.title);
            formData.append('description', form.description);
            formData.append('category', form.category);
            formData.append('resolutionDate', form.resolutionDate);
            formData.append('type', form.type);
            formData.append('image', file);

            const res = await fetch('/api/event-suggestions', {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to submit suggestion');
            }
            setSuccess(true);
            setForm({
                title: '',
                description: '',
                category: '',
                resolutionDate: '',
                type: 'BINARY',
            });
            setFile(null);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        } catch (err: any) {
            setError(err?.message || 'Failed to submit suggestion');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 space-y-1">
                    <p className="text-sm text-gray-300">Have an idea?</p>
                    <h3 className="text-lg font-semibold text-white">Suggest a market</h3>
                    <p className="text-xs text-gray-400">We’ll review and add it if approved.</p>
                </div>
                <button
                    onClick={() => { setOpen(true); setSuccess(false); setError(null); }}
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-semibold hover:from-blue-400 hover:to-purple-500 transition-colors"
                >
                    Suggest
                </button>
            </div>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
                    <div className="relative z-10 w-full max-w-xl bg-[#0f1117] border border-white/10 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-blue-300">New idea</p>
                                <h3 className="text-xl font-semibold text-white">Suggest a market</h3>
                                <p className="text-sm text-gray-400">Attach an image and key details so we can review quickly.</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-sm">Close</button>
                        </div>
                        <form className="space-y-4" onSubmit={handleSubmit}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Title *</label>
                                    <input
                                        required
                                        value={form.title}
                                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                        placeholder="Will BTC hit $100k in 2025?"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Category</label>
                                    <input
                                        value={form.category}
                                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                        placeholder="e.g., CRYPTO"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Description *</label>
                                <textarea
                                    required
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[110px]"
                                    placeholder="Context, criteria, resolution details, and why it matters."
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Resolution date</label>
                                    <input
                                        type="datetime-local"
                                        value={form.resolutionDate}
                                        onChange={(e) => setForm({ ...form, resolutionDate: e.target.value })}
                                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Type</label>
                                    <select
                                        value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value as 'BINARY' | 'MULTIPLE' })}
                                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="BINARY">Binary</option>
                                        <option value="MULTIPLE">Multiple outcomes</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-300 mb-2">Cover image *</label>
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={handleDrop}
                                    className={`rounded-xl border border-dashed ${dragging ? 'border-blue-400 bg-blue-400/10' : 'border-white/15 bg-white/5'} p-4 flex flex-col sm:flex-row gap-4 items-center justify-between`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center text-gray-300">
                                            📷
                                        </div>
                                        <div>
                                            <p className="text-sm text-white font-medium">Drag & drop or choose a file</p>
                                            <p className="text-xs text-gray-400">JPG, PNG, WEBP up to 5MB.</p>
                                        </div>
                                    </div>
                                    <label className="relative">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => handleFile(e.target.files?.[0] || null)}
                                        />
                                        <span className="inline-flex px-3 py-2 rounded-lg bg-white/10 text-sm text-white border border-white/15 hover:bg-white/15 cursor-pointer">
                                            Browse
                                        </span>
                                    </label>
                                </div>
                                {previewUrl && (
                                    <div className="mt-3 rounded-lg overflow-hidden border border-white/10 bg-black/30">
                                        <img src={previewUrl} alt="Preview" className="w-full h-40 object-cover" />
                                    </div>
                                )}
                            </div>

                            {error && <p className="text-sm text-red-400">{error}</p>}
                            {success && <p className="text-sm text-green-400">Suggestion submitted for review.</p>}

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
                                >
                                    {loading ? 'Submitting...' : 'Submit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

