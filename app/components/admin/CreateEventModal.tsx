'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Outcome {
    id?: string;
    name: string;
    probability?: number;
}

interface CreateEventModalProps {
    isOpen: boolean;
    onClose: () => void;
    event?: {
        id: string;
        title: string;
        description: string;
        categories: string[];
        resolutionDate: string;
        imageUrl: string | null;
        type: string;
        isHidden: boolean;
        outcomes?: Outcome[];
    } | null;
    mode?: 'admin' | 'user';
}

const CATEGORIES = ['CRYPTO', 'SPORTS', 'POLITICS', 'ECONOMICS', 'TECH', 'FINANCE', 'CULTURE', 'WORLD', 'SCIENCE'];
const EVENT_TYPES = [
    { value: 'BINARY', label: 'Binary (YES/NO)', description: 'Simple yes or no outcome' },
    { value: 'MULTIPLE', label: 'Multiple Choice', description: 'Multiple possible outcomes' },
];

export function CreateEventModal({ isOpen, onClose, event, mode = 'admin' }: CreateEventModalProps) {
    const queryClient = useQueryClient();
    const isEditMode = !!event;
    const isUserMode = mode === 'user';

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [eventType, setEventType] = useState('BINARY');
    const [resolutionDate, setResolutionDate] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saveAsDraft, setSaveAsDraft] = useState(false);
    const [outcomes, setOutcomes] = useState<Outcome[]>([{ name: 'YES' }, { name: 'NO' }]);
    const [showThankYou, setShowThankYou] = useState(false);

    // Populate form when editing
    useEffect(() => {
        if (event) {
            setTitle(event.title || '');
            setDescription(event.description || '');
            setSelectedCategories(event.categories || []);
            setEventType(event.type || 'BINARY');
            setResolutionDate(event.resolutionDate || '');
            setImageUrl(event.imageUrl || '');
            setSaveAsDraft(event.isHidden || false);

            if (event.outcomes && event.outcomes.length > 0) {
                setOutcomes(event.outcomes);
            } else if (event.type === 'BINARY') {
                setOutcomes([{ name: 'YES' }, { name: 'NO' }]);
            }
        } else {
            // Reset form for create mode
            setTitle('');
            setDescription('');
            setSelectedCategories([]);
            setEventType('BINARY');
            setResolutionDate('');
            setImageUrl('');
            setSaveAsDraft(false);
            setOutcomes([{ name: 'YES' }, { name: 'NO' }]);
            setShowThankYou(false);
        }
    }, [event]);

    useEffect(() => {
        if (isOpen) {
            setShowThankYou(false);
        }
    }, [isOpen]);

    // Update outcomes when event type changes
    useEffect(() => {
        if (eventType === 'BINARY' && (!isEditMode || !event)) {
            setOutcomes([{ name: 'YES' }, { name: 'NO' }]);
        }
    }, [eventType, isEditMode, event]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Upload failed');
            }

            const data = await res.json();
            setImageUrl(data.url);
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const createEventMutation = useMutation({
        mutationFn: async (data: any) => {
            const isEdit = isEditMode && !isUserMode;
            const url = isUserMode ? '/api/event-suggestions' : (isEdit ? `/api/events/${event?.id}` : '/api/events');
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.text();
                throw new Error(`Failed to ${isEdit ? 'update' : isUserMode ? 'submit' : 'create'} event: ${error}`);
            }
            return res.json();
        },
        onSuccess: () => {
            if (isUserMode) {
                setShowThankYou(true);
            } else {
                queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
                queryClient.invalidateQueries({ queryKey: ['events'] });
                onClose();
            }
        },
        onError: (error: any) => {
            alert(error.message || 'Failed to save event');
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (selectedCategories.length === 0) {
            alert('Please select at least one category');
            return;
        }

        createEventMutation.mutate({
            title,
            description,
            categories: selectedCategories,
            type: eventType,
            resolutionDate,
            imageUrl,
            isHidden: isUserMode ? undefined : saveAsDraft,
            outcomes: eventType === 'MULTIPLE' ? outcomes.filter(o => o.name.trim()) : undefined,
        });
    };

    const toggleCategory = (category: string) => {
        setSelectedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        );
    };

    const addOutcome = () => {
        setOutcomes([...outcomes, { name: '' }]);
    };

    const updateOutcome = (index: number, name: string) => {
        const newOutcomes = [...outcomes];
        newOutcomes[index] = { ...newOutcomes[index], name };
        setOutcomes(newOutcomes);
    };

    const removeOutcome = (index: number) => {
        if (outcomes.length > 2) {
            setOutcomes(outcomes.filter((_, i) => i !== index));
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 flex items-center justify-center z-[70] p-4"
                    >
                        <div className="w-full max-w-3xl bg-surface-elevated border border-white/5 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                            <h2 className="text-2xl font-bold text-zinc-200 mb-6">
                                {isUserMode ? 'Suggest an Event' : (isEditMode ? 'Edit Event' : 'Create New Event')}
                            </h2>

                            {isUserMode && showThankYou ? (
                                <div className="space-y-4 text-center text-zinc-200">
                                    <div className="text-4xl">🎉</div>
                                    <p className="text-lg font-semibold">Thank you for your suggestion!</p>
                                    <p className="text-sm text-zinc-300">
                                        We&apos;ll review the event details and publish it if approved.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => { setShowThankYou(false); onClose(); }}
                                        className="mt-4 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {/* Image Upload */}
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-2">Event Image</label>
                                        <div className="flex items-center gap-4">
                                            <div className="w-32 h-20 rounded-lg bg-white/5 overflow-hidden border border-white/5">
                                                {imageUrl ? (
                                                    <img src={imageUrl} alt="Event" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-3xl">🖼️</div>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleFileUpload}
                                                    className="text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-zinc-200 hover:file:bg-primary/90 cursor-pointer"
                                                />
                                                {uploading && <p className="text-xs text-primary mt-1">Uploading...</p>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Title */}
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-2">Title</label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            required
                                            className="w-full bg-white/5 border border-white/5 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-primary transition-colors"
                                            placeholder="e.g. Will Bitcoin hit $100k in 2024?"
                                        />
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-2">Description</label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            required
                                            className="w-full bg-white/5 border border-white/5 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-primary transition-colors h-28 resize-none"
                                            placeholder="Detailed description of the event..."
                                        />
                                    </div>

                                    {/* Categories - Multi-select */}
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-2">
                                            Categories <span className="text-xs text-zinc-500">(Select one or more)</span>
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {CATEGORIES.map(cat => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => toggleCategory(cat)}
                                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedCategories.includes(cat)
                                                        ? 'bg-primary text-zinc-200 border-2 border-primary'
                                                        : 'bg-white/5 text-muted-foreground border-2 border-white/5 hover:bg-white/10 hover:text-zinc-200'
                                                        }`}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Event Type */}
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-2">Event Type</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {EVENT_TYPES.map(type => (
                                                <button
                                                    key={type.value}
                                                    type="button"
                                                    onClick={() => setEventType(type.value)}
                                                    className={`p-4 rounded-lg text-left transition-colors border-2 ${eventType === type.value
                                                        ? 'bg-primary/20 border-primary text-zinc-200'
                                                        : 'bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:text-zinc-200'
                                                        }`}
                                                >
                                                    <div className="font-medium mb-1">{type.label}</div>
                                                    <div className="text-xs opacity-70">{type.description}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Outcomes Editor - Show default YES/NO for Binary, custom for Multiple */}
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-2">
                                            Outcomes {eventType === 'BINARY' && <span className="text-xs text-zinc-500">(Default: YES/NO)</span>}
                                        </label>
                                        <div className="space-y-2">
                                            {outcomes.map((outcome, index) => (
                                                <div key={index} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={outcome.name}
                                                        onChange={(e) => updateOutcome(index, e.target.value)}
                                                        disabled={eventType === 'BINARY'}
                                                        placeholder={`Outcome ${index + 1}`}
                                                        className={`flex-1 bg-white/5 border border-white/5 rounded-lg px-4 py-2 text-zinc-200 focus:outline-none focus:border-primary transition-colors ${eventType === 'BINARY' ? 'opacity-60 cursor-not-allowed' : ''
                                                            }`}
                                                    />
                                                    {eventType === 'MULTIPLE' && outcomes.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeOutcome(index)}
                                                            className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {eventType === 'MULTIPLE' && (
                                                <button
                                                    type="button"
                                                    onClick={addOutcome}
                                                    className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-sm text-muted-foreground hover:text-zinc-200 transition-colors"
                                                >
                                                    + Add Outcome
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Resolution Date */}
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-2">Resolution Date</label>
                                        <input
                                            type="datetime-local"
                                            value={resolutionDate}
                                            onChange={(e) => setResolutionDate(e.target.value)}
                                            required
                                            className="w-full bg-white/5 border border-white/5 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-primary transition-colors [color-scheme:dark]"
                                        />
                                    </div>

                                    {/* Save as Draft Toggle */}
                                    {!isUserMode && (
                                        <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg border border-white/5">
                                            <input
                                                type="checkbox"
                                                id="draft-mode"
                                                checked={saveAsDraft}
                                                onChange={(e) => setSaveAsDraft(e.target.checked)}
                                                className="w-5 h-5 rounded border-white/20 bg-white/5 checked:bg-primary"
                                            />
                                            <label htmlFor="draft-mode" className="flex-1 cursor-pointer">
                                                <div className="text-sm font-medium text-zinc-200">Save as Draft/Preview Mode</div>
                                                <div className="text-xs text-muted-foreground">Event will be hidden from public until published</div>
                                            </label>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 pt-4 border-t border-white/5">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="flex-1 px-4 py-3 rounded-lg font-medium text-muted-foreground hover:text-zinc-200 hover:bg-white/5 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={createEventMutation.isPending || uploading}
                                            className="flex-1 px-4 py-3 rounded-lg font-medium bg-primary hover:bg-primary/90 text-zinc-200 transition-colors disabled:opacity-50"
                                        >
                                            {createEventMutation.isPending
                                                ? (isUserMode ? 'Submitting...' : (isEditMode ? 'Updating...' : 'Creating...'))
                                                : (isUserMode ? 'Submit Suggestion' : (isEditMode ? 'Update Event' : (saveAsDraft ? 'Save as Draft' : 'Publish Event')))}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
