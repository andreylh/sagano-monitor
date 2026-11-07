// Checks whether the Sagano Romantic Train has seats on a target date
// and sends a push notification via ntfy.sh when it does.
import { chromium } from 'playwright';

const URL = 'https://ars-saganokanko.triplabo.jp/activity/en/LINKTIVITY-YRBTL';
const TARGET_DAY = '19';
const TARGET_MONTH = 'November 2026';
const LAST_DATE_JST = '2026-11-19';
const TOPIC = process.env.NTFY_TOPIC;

const todayJST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
if (todayJST > LAST_DATE_JST) {
  console.log(`Date ${LAST_DATE_JST} has passed — nothing to do. Disable this workflow.`);
  process.exit(0);
}

// priority: 'low' = quiet status update; 'urgent' = seats found.
async function notify(title, message, priority = 'low', tags = 'train') {
  if (!TOPIC) { console.log('NTFY_TOPIC not set; skipping push:', title); return; }
  try {
    await fetch(`https://ntfy.sh/${TOPIC}`, {
      method: 'POST',
      body: message,
      headers: { Title: title, Priority: priority, Tags: tags, Click: URL },
    });
  } catch (e) { console.log('ntfy push failed:', e.message); }
}

// A FAILED run means "19/11 is available": GitHub then emails the repo owner.
// Read problems (site slow, layout change) only log a warning so they never trigger that email.
const timeBR = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ locale: 'en-US' });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('button[class*="dateTableDayButton"]', { timeout: 45000 });

  const result = await page.evaluate(({ TARGET_DAY, TARGET_MONTH }) => {
    const text = document.body.innerText;
    const firstMonth = (text.match(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/) || [])[0];
    const btn = [...document.querySelectorAll('button[class*="dateTableDayButton"]')]
      .find(b => b.querySelector('span')?.textContent.trim() === TARGET_DAY);
    if (!btn) return { firstMonth, found: false };
    const cls = btn.querySelector('svg')?.getAttribute('class') || '';
    return { firstMonth, found: true, disabled: btn.disabled, cls };
  }, { TARGET_DAY, TARGET_MONTH });

  console.log(JSON.stringify(result));

  if (!result.found) throw new Error('Could not find the target day in the calendar');
  if (result.firstMonth !== TARGET_MONTH) throw new Error(`First calendar month is "${result.firstMonth}", expected "${TARGET_MONTH}"`);

  const soldOut = result.disabled || /sold-out/.test(result.cls);
  if (soldOut) {
    console.log(`${TARGET_DAY}/11: esgotado`);
    await notify('Sagano 19/11: esgotado', `Checado às ${timeBR()}. Ainda sem lugares.`, 'low', 'hourglass');
  } else {
    const level = /few/.test(result.cls) ? 'poucos lugares' : /many/.test(result.cls) ? 'muitos lugares' : 'disponível';
    console.log(`${TARGET_DAY}/11: DISPONÍVEL (${level})`);
    await notify('🚂 Sagano 19/11 DISPONÍVEL!', `Sagano Romantic Train: 19/11 com ${level}. Toque para reservar já!`, 'urgent', 'rotating_light,train');
    console.log(`::error::SAGANO 19/11 DISPONIVEL (${level}) - reserve ja: ${URL}`);
    process.exitCode = 1;
  }
} catch (e) {
  console.log(`::warning::Could not read the calendar: ${e.message}`);
  await notify('Sagano 19/11: falha na checagem', `Checado às ${timeBR()}. Não consegui ler o calendário; tento de novo na próxima.`, 'low', 'warning');
} finally {
  await browser.close();
}
