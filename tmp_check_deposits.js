const {Client}=require('pg');
(async()=>{
  const client=new Client({connectionString:process.env.DIRECT_DATABASE_URL});
  await client.connect();
  const depAgg=await client.query('select status, count(*) as count, sum(amount) as sum from "Deposit" group by status');
  const pending=await client.query('select id, "userId", amount, currency, status, "txHash", "fromAddress", "toAddress", "createdAt" from "Deposit" where status = $1 order by "createdAt" desc limit 20',["PENDING"]);
  const addrCount=await client.query('select count(*) from "DepositAddress"');
  const balances=await client.query('select "tokenSymbol", sum(amount) as sum from "Balance" group by "tokenSymbol"');
  console.log(JSON.stringify({depAgg:depAgg.rows,pendingCount:pending.rowCount,samplePending:pending.rows,depositAddressCount:Number(addrCount.rows[0].count),balances:balances.rows},null,2));
  await client.end();
})().catch(err=>{console.error(err); process.exit(1);});
