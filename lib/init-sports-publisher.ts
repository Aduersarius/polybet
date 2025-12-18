/**
 * Initialize Sports Odds WebSocket Publisher
 * 
 * This script starts the background job that publishes sports odds
 * to Redis every 500ms for real-time WebSocket updates.
 * 
 * Usage:
 * - Call this once when the app starts
 * - Or manually trigger via API: POST /api/sports/ws-publisher
 */

export async function initSportsPublisher() {
  try {
    const response = await fetch('http://localhost:3000/api/sports/ws-publisher', {
      method: 'POST',
    });
    
    if (!response.ok) {
      const data = await response.json();
      if (data.status === 'already_running') {
        console.log('✅ Sports odds publisher is already running');
        return true;
      }
      throw new Error(`Failed to start publisher: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('🚀 Sports odds publisher started:', data);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize sports publisher:', error);
    return false;
  }
}

export async function stopSportsPublisher() {
  try {
    const response = await fetch('http://localhost:3000/api/sports/ws-publisher', {
      method: 'DELETE',
    });
    
    const data = await response.json();
    console.log('🛑 Sports odds publisher stopped:', data);
    return true;
  } catch (error) {
    console.error('❌ Failed to stop sports publisher:', error);
    return false;
  }
}

export async function checkPublisherStatus() {
  try {
    const response = await fetch('http://localhost:3000/api/sports/ws-publisher');
    const data = await response.json();
    console.log('📊 Publisher status:', data);
    return data;
  } catch (error) {
    console.error('❌ Failed to check publisher status:', error);
    return null;
  }
}

