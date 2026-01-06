const { ClobClient } = require('@polymarket/clob-client');
const { Wallet } = require('ethers');
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');

const PK = "0x90407d4481ea933571bc7facc795127edf0ba4ffc0a6924fc0eeeb3e6fb4bde9";
const PROXY_URL = "http://88fab6960cbe78f5a3eb__cr.ca:d86403e41220abd4@gw.dataimpulse.com:823";

const agent = new HttpsProxyAgent(PROXY_URL);
axios.interceptors.request.use(c => {
    c.httpsAgent = agent;
    c.proxy = false;
    return c;
});

async function check() {
    const w = new Wallet(PK);
    w._signTypedData = function (d, t, v) { return this.signTypedData(d, t, v); };
    const creds = {
        key: "1daaea49-5a5d-8671-a930-0d22fd39147c",
        secret: "3orcPmKi8cYWbjsS7_s9kvC2gnOqmLp-Q8GoBCqNxs8=",
        passphrase: "7159bdd2924797387d41dabf2f52f1382728eb3a6e998fdad9c89c0846c24c13"
    };

    const client = new ClobClient('https://clob.polymarket.com', 137, w, creds);

    try {
        console.log("Checking for open orders...");
        const orders = await client.getOpenOrders();
        console.log("Open Orders:", JSON.stringify(orders, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
check();
