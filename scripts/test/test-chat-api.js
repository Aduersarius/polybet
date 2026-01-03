
async function main() {
    const baseUrl = 'http://localhost:3000';

    try {
        // 1. Get Events to find a valid ID
        console.log('Fetching events...');
        const eventsRes = await fetch(`${baseUrl}/api/events`);
        if (!eventsRes.ok) throw new Error(`Failed to fetch events: ${eventsRes.status}`);
        const events = await eventsRes.json();

        if (events.length === 0) {
            console.error('No events found to test with.');
            return;
        }

        const eventId = events[0].id;
        console.log(`Testing with Event ID: ${eventId}`);

        // 2. Test GET Messages
        console.log('\n--- Testing GET Messages ---');
        const msgsRes = await fetch(`${baseUrl}/api/events/${eventId}/messages`);
        if (msgsRes.ok) {
            const msgs = await msgsRes.json();
            console.log(`GET Success. Count: ${msgs.length}`);
            if (msgs.length > 0) console.log('Sample:', msgs[0]);
        } else {
            console.error(`GET Failed: ${msgsRes.status}`);
            console.error(await msgsRes.text());
        }

        // 3. Test POST Message
        console.log('\n--- Testing POST Message ---');
        // We need a valid address. I'll use a random one if I can't find one, 
        // but the API requires the user to exist or it creates one. 
        // My previous fix ensures creation.
        const testAddress = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f';

        const postRes = await fetch(`${baseUrl}/api/events/${eventId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: 'Test message from JS script',
                address: testAddress
            })
        });

        if (postRes.ok) {
            const postedMsg = await postRes.json();
            console.log('POST Success:', postedMsg);
        } else {
            console.error(`POST Failed: ${postRes.status}`);
            console.error(await postRes.text());
        }

    } catch (error) {
        console.error('Test Script Error:', error);
    }
}

main();
