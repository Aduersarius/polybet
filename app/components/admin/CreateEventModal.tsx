'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Upload, Lightbulb, Sparkles, Check, Calendar, Tag, FileText, ImageIcon } from 'lucide-react';

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
    const [step, setStep] = useState(1);

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
            setStep(1);
        }
    }, [event]);

    useEffect(() => {
        if (isOpen) {
            setShowThankYou(false);
            setStep(1);
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

    const canProceedStep1 = title.trim().length > 5 && description.trim().length > 10;
    const canProceedStep2 = selectedCategories.length > 0 && resolutionDate;

    // User mode - modern split layout
    if (isUserMode) {
        return (
            <AnimatePresence mode="wait">
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
                        >
                            <div className="w-full max-w-3xl max-h-[90vh] bg-gradient-to-br from-[#0d1a2d] via-[#0a1628] to-[#0d1a2d] border border-white/10 rounded-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.9)] flex flex-col lg:flex-row overflow-hidden pointer-events-auto">
                                
                                {/* Left Side - Visual */}
                                <div className="hidden lg:flex lg:w-2/5 relative overflow-hidden">
                                    {/* Background Effects */}
                                    <div className="absolute inset-0">
                                        <div className="absolute top-1/4 right-0 w-64 h-64 bg-blue-500/30 rounded-full blur-3xl animate-pulse" />
                                        <div className="absolute bottom-1/4 left-0 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl" />
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-cyan-400/20 rounded-full blur-2xl" />
                                    </div>

                                    {/* 3D Illustration */}
                                    <div className="relative z-10 flex flex-col justify-center items-center p-8 text-center">
                                        <div className="relative mb-6">
                                            {/* Floating 3D Elements */}
                                            <div className="w-32 h-32 relative">
                                                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/30 to-purple-500/30 rounded-2xl rotate-6 blur-sm" />
                                                <div className="absolute inset-2 bg-gradient-to-br from-[#1a2744] to-[#0d1a2d] rounded-xl border border-blue-400/30 flex items-center justify-center transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                                                    <Lightbulb className="w-12 h-12 text-blue-400" />
                                                </div>
                                                {/* Sparkles */}
                                                <div className="absolute -top-3 -right-3 w-6 h-6">
                                                    <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse" />
                                                </div>
                                                <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-blue-400 rounded-full animate-bounce opacity-60" />
                                            </div>
                                        </div>

                                        <h3 className="text-xl font-bold text-white mb-2">
                                            Create Your Market
                                        </h3>
                                        <p className="text-sm text-blue-100/60 max-w-[200px]">
                                            Propose an event and let the community trade on your prediction
                                        </p>

                                        {/* Progress Steps */}
                                        {!showThankYou && (
                                            <div className="mt-8 flex items-center gap-3">
                                                {[1, 2, 3].map((s) => (
                                                    <div
                                                        key={s}
                                                        className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                                                            s === step
                                                                ? 'bg-blue-400 w-8'
                                                                : s < step
                                                                ? 'bg-blue-400'
                                                                : 'bg-white/20'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Side - Form */}
                                <div className="flex-1 flex flex-col min-h-0">
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                                        <div>
                                            <h2 className="text-lg font-bold text-white">
                                                {showThankYou ? 'Success!' : `Step ${step} of 3`}
                                            </h2>
                                            <p className="text-xs text-zinc-500">
                                                {step === 1 && 'Market details'}
                                                {step === 2 && 'Category & timing'}
                                                {step === 3 && 'Review & submit'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={onClose}
                                            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex items-center justify-center"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 overflow-y-auto p-6">
                                        <AnimatePresence mode="wait">
                                            {showThankYou ? (
                                                <motion.div
                                                    key="success"
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -20 }}
                                                    className="py-8 flex flex-col items-center text-center"
                                                >
                                                    <div className="w-20 h-20 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center mb-6">
                                                        <Check className="w-10 h-10 text-green-500" />
                                                    </div>
                                                    <h3 className="text-2xl font-bold text-white mb-3">Submitted!</h3>
                                                    <p className="text-zinc-400 max-w-sm mb-8">
                                                        Your market suggestion has been received. We&apos;ll review it and publish if approved.
                                                    </p>
                                                    <button
                                                        onClick={() => { setShowThankYou(false); onClose(); }}
                                                        className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all active:scale-95"
                                                    >
                                                        Done
                                                    </button>
                                                </motion.div>
                                            ) : step === 1 ? (
                                                <motion.div
                                                    key="step1"
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -20 }}
                                                    className="space-y-6"
                                                >
                                                    <div>
                                                        <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                                                            <FileText className="w-4 h-4" />
                                                            Market Question
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={title}
                                                            onChange={(e) => setTitle(e.target.value)}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all text-lg font-medium"
                                                            placeholder="Will Bitcoin reach $100k by 2026?"
                                                        />
                                                        <p className="text-xs text-zinc-600 mt-2">Ask a clear yes/no question about a future event</p>
                                                    </div>

                                                    <div>
                                                        <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                                                            <FileText className="w-4 h-4" />
                                                            Resolution Criteria
                                                        </label>
                                                        <textarea
                                                            value={description}
                                                            onChange={(e) => setDescription(e.target.value)}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all h-32 resize-none"
                                                            placeholder="Describe how this market will be resolved. What source will be used to determine the outcome?"
                                                        />
                                                    </div>

                                                    {/* Image Upload */}
                                                    <div>
                                                        <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                                                            <ImageIcon className="w-4 h-4" />
                                                            Cover Image (Optional)
                                                        </label>
                                                        <div className="flex items-center gap-4">
                                                            <div className="relative w-20 h-20 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center group">
                                                                {imageUrl ? (
                                                                    <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Upload className="w-6 h-6 text-zinc-600" />
                                                                )}
                                                                {uploading && (
                                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="cursor-pointer">
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        onChange={handleFileUpload}
                                                                        className="hidden"
                                                                    />
                                                                    <span className="inline-block px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white font-medium transition-colors">
                                                                        {imageUrl ? 'Change' : 'Upload'}
                                                                    </span>
                                                                </label>
                                                                <p className="text-xs text-zinc-600 mt-1">JPG, PNG. Max 2MB</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ) : step === 2 ? (
                                                <motion.div
                                                    key="step2"
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -20 }}
                                                    className="space-y-6"
                                                >
                                                    <div>
                                                        <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                                                            <Tag className="w-4 h-4" />
                                                            Categories
                                                        </label>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {CATEGORIES.map(cat => (
                                                                <button
                                                                    key={cat}
                                                                    type="button"
                                                                    onClick={() => toggleCategory(cat)}
                                                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                                                        selectedCategories.includes(cat)
                                                                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                                                                            : 'bg-white/5 text-zinc-500 border-white/5 hover:border-white/20 hover:text-zinc-300'
                                                                    }`}
                                                                >
                                                                    {cat}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                                                            <Calendar className="w-4 h-4" />
                                                            Resolution Date
                                                        </label>
                                                        <input
                                                            type="datetime-local"
                                                            value={resolutionDate}
                                                            onChange={(e) => setResolutionDate(e.target.value)}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all [color-scheme:dark]"
                                                        />
                                                        <p className="text-xs text-zinc-600 mt-2">When should this market be resolved?</p>
                                                    </div>

                                                    <div>
                                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 block">
                                                            Market Type
                                                        </label>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {EVENT_TYPES.map(type => (
                                                                <button
                                                                    key={type.value}
                                                                    type="button"
                                                                    onClick={() => setEventType(type.value)}
                                                                    className={`p-4 rounded-xl text-left transition-all border ${
                                                                        eventType === type.value
                                                                            ? 'bg-blue-500/10 border-blue-500/50 text-white'
                                                                            : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/10'
                                                                    }`}
                                                                >
                                                                    <div className="text-sm font-bold">{type.label}</div>
                                                                    <div className="text-xs opacity-60 mt-1">{type.description}</div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <motion.div
                                                    key="step3"
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -20 }}
                                                    className="space-y-6"
                                                >
                                                    <div className="bg-white/5 rounded-xl p-5 border border-white/5">
                                                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">Review Your Submission</h4>
                                                        
                                                        <div className="space-y-4">
                                                            <div>
                                                                <span className="text-xs text-zinc-500">Question</span>
                                                                <p className="text-white font-medium mt-1">{title}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs text-zinc-500">Description</span>
                                                                <p className="text-zinc-300 text-sm mt-1">{description}</p>
                                                            </div>
                                                            <div className="flex gap-8">
                                                                <div>
                                                                    <span className="text-xs text-zinc-500">Categories</span>
                                                                    <p className="text-white text-sm mt-1">{selectedCategories.join(', ')}</p>
                                                                </div>
                                                                <div>
                                                                    <span className="text-xs text-zinc-500">Type</span>
                                                                    <p className="text-white text-sm mt-1">{eventType === 'BINARY' ? 'Yes/No' : 'Multiple Choice'}</p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs text-zinc-500">Resolution Date</span>
                                                                <p className="text-white text-sm mt-1">
                                                                    {resolutionDate ? new Date(resolutionDate).toLocaleDateString('en-US', {
                                                                        weekday: 'long',
                                                                        year: 'numeric',
                                                                        month: 'long',
                                                                        day: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    }) : 'Not set'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <p className="text-xs text-zinc-500 text-center">
                                                        By submitting, you agree that this market will be reviewed by our team before publication.
                                                    </p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Footer */}
                                    {!showThankYou && (
                                        <div className="p-6 border-t border-white/5 flex gap-3">
                                            {step > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setStep(step - 1)}
                                                    className="px-6 py-3 rounded-xl font-bold text-sm text-zinc-400 hover:text-white transition-colors border border-white/10 hover:bg-white/5"
                                                >
                                                    Back
                                                </button>
                                            )}
                                            {step < 3 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setStep(step + 1)}
                                                    disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
                                                    className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]"
                                                >
                                                    Continue
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleSubmit}
                                                    disabled={createEventMutation.isPending}
                                                    className="flex-1 py-3 bg-white text-black font-bold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]"
                                                >
                                                    {createEventMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        );
    }

    // Admin mode - original layout
    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60]"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="fixed inset-0 flex items-center justify-center z-[70] p-4 pt-20 sm:pt-4 pointer-events-none overflow-y-auto"
                    >
                        <div className="w-full max-w-2xl bg-[var(--surface-elevated)] border border-white/10 rounded-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh] my-auto pointer-events-auto font-sans">
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">
                                        {isEditMode ? 'Edit Event' : 'Create New Event'}
                                    </h2>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Fill in the details to list a new market
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex items-center justify-center"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                                <form onSubmit={handleSubmit} className="space-y-8 pb-4">
                                    {/* Image Upload Section */}
                                    <div className="space-y-4">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Visual Presentation</label>
                                        <div className="flex items-center gap-6 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                            <div className="relative group w-24 h-24 rounded-xl bg-[var(--background)] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                                                {imageUrl ? (
                                                    <img src={imageUrl} alt="Event" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                ) : (
                                                    <Upload className="w-8 h-8 text-zinc-600" />
                                                )}
                                                {uploading && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleFileUpload}
                                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="px-4 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface)]/80 text-sm font-semibold text-white transition-colors border border-white/5"
                                                    >
                                                        {imageUrl ? 'Change Image' : 'Upload Image'}
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-zinc-500">
                                                    Recommended: 16:9 aspect ratio, max 2MB.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Core Details */}
                                    <div className="grid gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Market Title</label>
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                required
                                                className="w-full bg-[var(--background)]/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-medium"
                                                placeholder="Will Bitcoin reach $100k by Jan 2026?"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Context & Rules</label>
                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                required
                                                className="w-full bg-[var(--background)]/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all h-32 resize-none text-sm leading-relaxed"
                                                placeholder="Describe the conditions for resolution. What determines the outcome?"
                                            />
                                        </div>
                                    </div>

                                    {/* Categories Grid */}
                                    <div className="space-y-4">
                                        <div className="flex items-end justify-between">
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Categories</label>
                                            <span className="text-[10px] text-zinc-500 font-medium">Selected: {selectedCategories.length}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {CATEGORIES.map(cat => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => toggleCategory(cat)}
                                                    className={`px-3 py-2.5 rounded-xl text-[11px] font-bold tracking-tight transition-all border ${selectedCategories.includes(cat)
                                                        ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                                                        : 'bg-[var(--background)]/50 text-zinc-500 border-white/5 hover:border-white/20 hover:text-zinc-300'
                                                        }`}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Configuration Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Market Type</label>
                                            <div className="grid grid-cols-1 gap-2">
                                                {EVENT_TYPES.map(type => (
                                                    <button
                                                        key={type.value}
                                                        type="button"
                                                        onClick={() => setEventType(type.value)}
                                                        className={`p-3 rounded-xl text-left transition-all border-2 ${eventType === type.value
                                                            ? 'bg-blue-500/5 border-blue-500/50 text-white'
                                                            : 'bg-[var(--background)]/50 border-white/5 text-zinc-500 hover:border-white/10'
                                                            }`}
                                                    >
                                                        <div className="text-sm font-bold flex items-center justify-between">
                                                            {type.label}
                                                            {eventType === type.value && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />}
                                                        </div>
                                                        <div className="text-[10px] opacity-60 mt-0.5 font-medium">{type.description}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Resolution Date</label>
                                            <div className="relative">
                                                <input
                                                    type="datetime-local"
                                                    value={resolutionDate}
                                                    onChange={(e) => setResolutionDate(e.target.value)}
                                                    required
                                                    className="w-full bg-[var(--background)]/50 border border-white/10 rounded-xl px-4 py-8.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-medium [color-scheme:dark]"
                                                    style={{ height: '78px' }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Outcomes Editor */}
                                    <div className="space-y-4">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Outcomes</label>
                                        <div className="space-y-2.5 p-4 rounded-xl bg-white/[0.01] border border-white/5">
                                            {outcomes.map((outcome, index) => (
                                                <div key={index} className="flex gap-2">
                                                    <div className="flex-1 relative group">
                                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-600 tracking-widest">#{index + 1}</div>
                                                        <input
                                                            type="text"
                                                            value={outcome.name}
                                                            onChange={(e) => updateOutcome(index, e.target.value)}
                                                            disabled={eventType === 'BINARY'}
                                                            placeholder={`Enter outcome...`}
                                                            className={`w-full bg-[var(--background)] border border-white/5 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/40 transition-all ${eventType === 'BINARY' ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                                                        />
                                                    </div>
                                                    {eventType === 'MULTIPLE' && outcomes.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeOutcome(index)}
                                                            className="px-3 py-2 bg-red-500/5 hover:bg-red-500/10 text-red-500/60 hover:text-red-400 rounded-lg border border-red-500/10 transition-colors"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {eventType === 'MULTIPLE' && (
                                                <button
                                                    type="button"
                                                    onClick={addOutcome}
                                                    className="w-full py-2.5 border border-dashed border-white/10 rounded-lg text-[11px] font-bold text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all uppercase tracking-widest"
                                                >
                                                    + Add Alternative Outcome
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Draft Options (Admin Only) */}
                                    <label className="flex items-center gap-4 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl cursor-pointer hover:bg-blue-500/10 transition-colors group">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                id="draft-mode"
                                                checked={saveAsDraft}
                                                onChange={(e) => setSaveAsDraft(e.target.checked)}
                                                className="peer sr-only"
                                            />
                                            <div className="w-10 h-6 bg-[var(--surface)] border border-white/10 rounded-full peer-checked:bg-blue-500 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 shadow-inner" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-bold text-white">Draft/Preview Mode</div>
                                            <p className="text-[11px] text-zinc-500 font-medium">Market will be hidden from everyone except admins</p>
                                        </div>
                                    </label>
                                </form>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-6 bg-[var(--background)] border-t border-white/5 flex gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest text-zinc-500 hover:text-white transition-colors border border-white/5 hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    onClick={handleSubmit}
                                    disabled={createEventMutation.isPending || uploading}
                                    className="flex-[2] px-4 py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-widest bg-white text-black hover:bg-zinc-200 transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95 shadow-xl shadow-white/5"
                                >
                                    {createEventMutation.isPending
                                        ? 'Processing...'
                                        : (isEditMode ? 'Update Market' : (saveAsDraft ? 'Save as Draft' : 'Launch Market'))}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
