'use client';
import { useEffect, useRef } from 'react';

interface Message {
    id: string;
    user: string;
    text: string;
    timestamp: Date;
}

interface EventChatProps {
    eventId: string;
}

export function EventChat({ eventId }: EventChatProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Mock messages for now
    const messages: Message[] = [
        { id: '1', user: '0x1234...5678', text: 'This is going to hit for sure!', timestamp: new Date(Date.now() - 3600000) },
        { id: '2', user: '0xabcd...ef12', text: 'No way, the odds are against it', timestamp: new Date(Date.now() - 1800000) },
        { id: '3', user: '0x9876...5432', text: 'Just put 1 ETH on YES 🚀', timestamp: new Date(Date.now() - 900000) },
        { id: '4', user: '0x4567...89ab', text: 'Volume is crazy today', timestamp: new Date(Date.now() - 300000) },
    ];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="material-card p-4 flex flex-col h-full">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-[#03dac6] rounded-full animate-pulse"></span>
                Live Chat
            </h3>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {messages.map((msg) => (
                    <div key={msg.id} className="bg-[#2c2c2c] rounded p-3">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-mono text-[#bb86fc]">{msg.user}</span>
                            <span className="text-[10px] text-gray-500">{formatTime(msg.timestamp)}</span>
                        </div>
                        <p className="text-sm text-gray-300">{msg.text}</p>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-1 bg-[#2c2c2c] rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#bb86fc]"
                />
                <button className="material-btn px-4 py-2 text-sm">
                    Send
                </button>
            </div>
        </div>
    );
}
