'use client';

import { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

// Client-only component to avoid SSR issues
function SupportChatWidgetContent() {
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    // #region agent log
    if (typeof window !== 'undefined') {
      fetch('http://127.0.0.1:7242/ingest/742aed11-5b39-48e6-8157-d3822a5f786a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SupportChatWidget.test.tsx:13',message:'useEffect entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
    }
    // #endregion
    setMounted(true);

    // Fetch session via API (client-side only)
    if (typeof window !== 'undefined') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/742aed11-5b39-48e6-8157-d3822a5f786a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SupportChatWidget.test.tsx:20',message:'Fetching session via API',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      fetch('/api/auth/get-session', { credentials: 'include' })
        .then(res => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/742aed11-5b39-48e6-8157-d3822a5f786a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SupportChatWidget.test.tsx:24',message:'Session API response',data:{status:res.status,ok:res.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          return res.json();
        })
        .then(data => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/742aed11-5b39-48e6-8157-d3822a5f786a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SupportChatWidget.test.tsx:29',message:'Session data received',data:{hasData:!!data,hasUser:!!data?.user},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          setSession(data);
        })
        .catch(err => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/742aed11-5b39-48e6-8157-d3822a5f786a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SupportChatWidget.test.tsx:34',message:'Session fetch error',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.error('Failed to fetch session:', err);
        });
    }
  }, []);

  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/742aed11-5b39-48e6-8157-d3822a5f786a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SupportChatWidget.test.tsx:43',message:'Render check',data:{mounted,hasSession:!!session,hasUser:!!session?.user},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion

  if (!mounted || !session?.user) {
    return null;
  }

  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/742aed11-5b39-48e6-8157-d3822a5f786a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SupportChatWidget.test.tsx:52',message:'Rendering button',data:{hasUser:!!session?.user},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion

  return (
    <button
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 via-emerald-600 to-blue-600 text-white shadow-xl"
      aria-label="Open support chat"
    >
      <MessageCircle className="w-6 h-6" />
    </button>
  );
}

// Export with dynamic import and no SSR - fixed syntax
export const SupportChatWidget = dynamic(
  () => Promise.resolve({ default: SupportChatWidgetContent }),
  { ssr: false }
);
