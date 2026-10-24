import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testJira() {
  console.log('\n--- 1. Testing Jira Integration ---');
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    console.log('[JIRA] Missing credentials in .env');
    return;
  }

  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  
  try {
    const issueKey = 'SCRUM-1';
    const issueRes = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!issueRes.ok) {
      console.log(`[JIRA] Fetch ${issueKey} HTTP ${issueRes.status}:`, await issueRes.text());
    } else {
      const issueData = await issueRes.json() as any;
      console.log(`[JIRA] SUCCESS! Fetched ${issueKey}`);
      console.log(`[JIRA] Summary: ${issueData.fields?.summary}`);
      console.log(`[JIRA] Status: ${issueData.fields?.status?.name}`);
    }
  } catch (err: any) {
    console.error('[JIRA] Error connecting:', err.message);
  }
}

async function testSlack() {
  console.log('\n--- 2. Testing Slack Integration ---');
  const token = process.env.SLACK_BOT_TOKEN;
  console.log('Token prefix:', token?.slice(0, 15), 'Length:', token?.length);

  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json() as any;
    if (data.ok) {
      console.log(`[SLACK] SUCCESS! Authenticated as bot "${data.user}" in team "${data.team}"`);
    } else {
      console.log('[SLACK] auth.test failed:', data.error);
    }
  } catch (err: any) {
    console.error('[SLACK] Error connecting:', err.message);
  }
}

async function run() {
  await testJira();
  await testSlack();
}

run();
